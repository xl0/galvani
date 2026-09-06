#!/usr/bin/env python3
"""Export a BETSE parity case: geometry, parameters, t0 state, per-step traces.

Usage: HOME=<writable> python dump_parity.py <out.json> [--steps N] [--every K]
Runs BETSE's default config with extracellular spaces disabled (well-mixed bath),
seeds, then runs the init phase, recording state after every step for the first
N steps and every K-th step afterwards.
"""
import argparse, json, os, sys, tempfile
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('out')
ap.add_argument('--steps', type=int, default=50, help='record every step up to here')
ap.add_argument('--every', type=int, default=50, help='then record every K-th step')
ap.add_argument('--total', type=float, default=5.0, help='init total time [s]')
ap.add_argument('--dt', type=float, default=None, help='init time step [s]')
ap.add_argument('--channels', action='store_true', help='enable Nav1p3 + Kv1p5 channels (network on, no substances)')
ap.add_argument('--ions', default=None, help="ion profile, e.g. basic_Ca")
ap.add_argument('--cav', action='store_true', help='add a Cav3p3 channel (needs --channels and --ions basic_Ca)')
ap.add_argument('--net-variant', default='', help='debug: nogate | nokleak | nomod')
ap.add_argument('--network', action='store_true', help='enable a small substance/reaction/modulator network (implies --channels off unless given)')
ap.add_argument('--ecm', action='store_true', help='simulate extracellular spaces (environment grid)')
ap.add_argument('--grid', type=int, default=25, help='env grid size (with --ecm)')
ap.add_argument('--tj', type=float, default=1.0, help='tight junction scaling (with --ecm)')
ap.add_argument('--adh', type=float, default=1.0, help='adherens junction scaling (with --ecm)')
ap.add_argument('--extvolt', type=float, default=None, help='apply an external voltage [V] top(+)/bottom(-) from 0.3*total to 0.7*total; runs the SIM phase (events only fire there)')
args = ap.parse_args()

from betse.util.app.meta import appmetaone
appmetaone.set_app_meta_betse_if_unset().init_libs()
from betse.science.parameters import Parameters
from betse.science.simrunner import SimRunner
from betse.science import sim as simmod, sim_toolbox as stb

work = tempfile.mkdtemp(prefix='galvani_parity_')
conf = os.path.join(work, 'sim.yaml')
# Write BETSE's default config (plus geo/ and extra_configs/), then patch it.
Parameters().copy_default(trg_conf_filename=conf)
import ruamel.yaml
yaml = ruamel.yaml.YAML()
with open(conf) as f:
    doc = yaml.load(f)
doc['general options']['simulate extracellular spaces'] = bool(args.ecm)
doc['general options']['comp grid size'] = args.grid
doc['variable settings']['tight junction scaling'] = args.tj
doc['variable settings']['adherens junction scaling'] = args.adh
# the default config ships with sim-phase events switched on (a cut, global concentration changes); only ours may fire
def _off(node):
    if isinstance(node, dict):
        if 'event happens' in node: node['event happens'] = False
        for v in node.values(): _off(v)
    elif isinstance(node, list):
        for v in node: _off(v)
_off(doc)
if args.extvolt is not None:
    ev = doc['apply external voltage']
    ev['event happens'] = True
    ev['change start'] = 0.3 * args.total
    ev['change finish'] = 0.7 * args.total
    ev['change rate'] = 0.05 * args.total
    ev['peak voltage'] = args.extvolt
    ev['positive voltage boundary'] = 'top'
    ev['negative voltage boundary'] = 'bottom'
    # sim phase settings mirror the init ones so the recorded run is the sim phase
    doc['sim time settings']['time step'] = args.dt if args.dt is not None else doc['init time settings']['time step']
    doc['sim time settings']['total time'] = args.total
    doc['sim time settings']['sampling rate'] = 1.0
doc['general network']['implement network'] = args.channels or args.network
if args.channels or args.network:
    net = doc['general network']
    net['biomolecules'] = []
    net['reactions'] = None
    net['transporters'] = None
    net['modulators'] = None
    net['channels'] = ([
        {'name': 'Nav', 'channel class': 'Na', 'channel type': 'Nav1p3', 'max Dm': 2.0e-14, 'apply to': 'all', 'init active': True},
        {'name': 'Kv', 'channel class': 'K', 'channel type': 'Kv1p5', 'max Dm': 1.0e-15, 'apply to': 'all', 'init active': True},
    ] if args.channels else []) + ([{'name': 'Cav', 'channel class': 'Ca', 'channel type': 'Cav3p3', 'max Dm': 1.0e-15, 'apply to': 'all', 'init active': True}] if args.cav else [])
NETWORK = {
    'substances': [
        {'name': 'X', 'z': 0, 'Dm': 0.0, 'Do': 1e-10, 'Dgj': 1e-15, 'cCell': 0.0, 'cEnv': 0.0, 'updateIntra': False,
         'growth': {'rProd': 0.1, 'rDecay': 0.1, 'profile': '', 'activators': [], 'inhibitors': []}},
        {'name': 'Y', 'z': 1, 'Dm': 1e-18, 'Do': 1e-10, 'Dgj': 1e-15, 'cCell': 1.0, 'cEnv': 0.5, 'updateIntra': False,
         'growth': {'rProd': 0.05, 'rDecay': 0.02, 'profile': '', 'activators': [], 'inhibitors': [{'name': 'X', 'Km': 0.5, 'n': 2, 'zone': 'cell'}]},
         'gating': {'ions': ['K'], 'HillK': 0.5, 'HillN': 2, 'peak': 1e-17, 'extracellular': False, 'activators': [], 'inhibitors': []}},
        {'name': 'Z', 'z': 0, 'Dm': 0.0, 'Do': 1e-10, 'Dgj': 1e-15, 'cCell': 0.0, 'cEnv': 0.0, 'updateIntra': True},
    ],
    'reactions': [
        {'name': 'R1', 'reactants': [{'name': 'X', 'coeff': 1, 'Km': 0.5}, {'name': 'Y', 'coeff': 1, 'Km': 0.5}], 'products': [{'name': 'Z', 'coeff': 1, 'Km': 1.0}],
         'vmax': 0.01, 'deltaG': None, 'activators': [], 'inhibitors': []},
    ],
    'modulators': [
        {'name': 'M1', 'target': 'NaK', 'max': 1.0, 'activators': [], 'inhibitors': [{'name': 'Z', 'Km': 0.1, 'n': 1, 'zone': 'cell'}]},
    ],
    'channelInfluence': {'KLeak': {'maxDm': 6e-18, 'inhibitors': [{'name': 'X', 'Km': 0.05, 'n': 2, 'zone': 'cell'}]}},
    'affectCharge': True,
}
if args.net_variant in ('minimal', 'minimal-inh'):
    NETWORK['substances'] = NETWORK['substances'][:1]
    NETWORK['reactions'] = []
    NETWORK['modulators'] = []
    if args.net_variant == 'minimal':
        NETWORK['channelInfluence'] = {'KLeak': {'maxDm': 6e-18, 'inhibitors': []}}
if args.net_variant == 'nogate':
    del NETWORK['substances'][1]['gating']
if args.net_variant == 'nokleak':
    NETWORK['channelInfluence'] = {}
if args.net_variant == 'nomod':
    NETWORK['modulators'] = []
if args.network:
    def infl(lst, key):
        return {f'{key}s': [i['name'] for i in lst] if lst else None, f'{key} Km' if key != 'activator' else 'Km activators': None}
    def gad_block(g):
        d = {'production rate': g['rProd'], 'decay rate': g['rDecay'], 'apply to': 'all', 'modulator function': 'None'}
        if g['activators']:
            d['activators'] = [a['name'] for a in g['activators']]; d['Km activators'] = [a['Km'] for a in g['activators']]; d['n activators'] = [a['n'] for a in g['activators']]; d['zone activators'] = [a['zone'] for a in g['activators']]
        if g['inhibitors']:
            d['inhibitors'] = [a['name'] for a in g['inhibitors']]; d['Km inhibitors'] = [a['Km'] for a in g['inhibitors']]; d['n inhibitors'] = [a['n'] for a in g['inhibitors']]; d['zone inhibitors'] = [a['zone'] for a in g['inhibitors']]
        return d
    bio = []
    for sdef in NETWORK['substances']:
        m = {'name': sdef['name'], 'Dm': sdef['Dm'], 'Do': sdef['Do'], 'Dgj': sdef['Dgj'], 'z': sdef['z'], 'env conc': sdef['cEnv'], 'cell conc': sdef['cCell'],
             'scale factor': 1.0, 'update intracellular': sdef['updateIntra'], 'use time dilation': False, 'transmem': False, 'initial asymmetry': 'None',
             'TJ permeable': False, 'GJ impermeable': False, 'TJ factor': 1.0,
             'plotting': {'plot 2D': False, 'animate': False, 'autoscale colorbar': True, 'max val': 2.0, 'min val': 0.0}}
        if 'growth' in sdef: m['growth and decay'] = gad_block(sdef['growth'])
        if 'gating' in sdef:
            g = sdef['gating']
            m['ion channel gating'] = {'channel name': 'gated', 'ion channel target': g['ions'], 'target Hill coefficient': g['HillK'], 'target Hill exponent': g['HillN'], 'peak channel opening': g['peak'], 'acts extracellularly': g['extracellular']}
        bio.append(m)
    net['biomolecules'] = bio
    net['reactions'] = [{'name': r['name'], 'reaction zone': 'cell', 'reactants': [x['name'] for x in r['reactants']], 'reactant multipliers': [x['coeff'] for x in r['reactants']],
                         'Km reactants': [x['Km'] for x in r['reactants']], 'products': [x['name'] for x in r['products']], 'product multipliers': [x['coeff'] for x in r['products']],
                         'Km products': [x['Km'] for x in r['products']], 'max rate': r['vmax'], 'standard free energy': 'None' if r['deltaG'] is None else r['deltaG']} for r in NETWORK['reactions']]
    net['modulators'] = [{'name': m['name'], 'target': 'Na/K-ATPase' if m['target'] == 'NaK' else 'GJ', 'max effect': m['max'],
                          'inhibitors': [i['name'] for i in m['inhibitors']], 'inhibitor Km': [i['Km'] for i in m['inhibitors']], 'inhibitor n': [i['n'] for i in m['inhibitors']], 'inhibitor zone': [i['zone'] for i in m['inhibitors']]} for m in NETWORK['modulators']]
    for ctype, cdef in NETWORK['channelInfluence'].items():
        chan = {'name': 'KL', 'channel class': 'K', 'channel type': ctype, 'max Dm': cdef['maxDm'], 'apply to': 'all', 'init active': True}
        if cdef['inhibitors']:
            chan.update({'channel inhibitors': [i['name'] for i in cdef['inhibitors']], 'inhibitor Km': [i['Km'] for i in cdef['inhibitors']], 'inhibitor n': [i['n'] for i in cdef['inhibitors']], 'inhibitor zone': [i['zone'] for i in cdef['inhibitors']]})
        net['channels'] = list(net['channels']) + [chan]
    doc['variable settings']['substances affect Vmem'] = NETWORK['affectCharge']
if args.ions is not None:
    doc['general options']['ion profile'] = args.ions
if args.dt is not None:
    doc['init time settings']['time step'] = args.dt
doc['init time settings']['total time'] = args.total
doc['init time settings']['sampling rate'] = 1.0  # storage unused; we record via hook
with open(conf, 'w') as f:
    yaml.dump(doc, f)

p = Parameters()
p.load(conf)
runner = SimRunner(p)
runner.seed()

# ---- hooks: capture t0 state and per-step state ------------------------------
snaps = []
orig_check_v = stb.check_v
step = [0]
def snap(sim):
    d = {
        'vm': sim.vm.tolist(),
        'cc_cells': np.asarray(sim.cc_cells).tolist(),
        'cc_env': np.asarray(sim.cc_env).tolist() if args.ecm else [float(np.asarray(c).ravel()[0]) for c in sim.cc_env],
        'gjopen': np.asarray(sim.gjopen * np.ones(sim.mdl)).tolist(),
    }
    if args.ecm:
        d['v_env'] = np.asarray(sim.v_env).ravel().tolist()
        d['E_env_x'] = np.asarray(sim.E_env_x).ravel().tolist()
        d['E_env_y'] = np.asarray(sim.E_env_y).ravel().tolist()
        d['Phi_b'] = np.asarray(sim.Phi_b).ravel().tolist() if np.ndim(getattr(sim, 'Phi_b', 0)) else 0.0
        d['bound_V'] = {k: float(v) for k, v in sim.bound_V.items()}
    if getattr(sim, 'molecules', None) is not None:
        d['subs'] = {name: {'cells': np.asarray(m.c_cells).tolist(), 'mem': np.asarray(m.cc_at_mem).tolist(), 'env': float(np.asarray(m.c_env).ravel()[0])} for name, m in sim.molecules.core.molecules.items()}
        d['nak_block'] = np.asarray(sim.NaKATP_block * np.ones(sim.mdl)).tolist()
    return d
def check_v_hook(vm):
    orig_check_v(vm)
    s = step[0]
    if s < args.steps or (s % args.every) == 0:
        snaps.append({'step': s + 1, **snap(SIM[0])})
    step[0] += 1
stb.check_v = check_v_hook
SIM = [None]
t0 = {}
orig_loop = simmod.Simulator._run_sim_core_loop
def loop_hook(self, phase, time_steps, time_steps_sampled, anim_cells):
    print(f'[dump] core loop: phase={phase.kind} cells={len(self.cc_cells[0])} mems={self.mdl} steps={len(time_steps)}', flush=True)
    SIM[0] = self
    t0.clear(); snaps.clear(); step[0] = 0
    t0.update(snap(self))
    t0['cc_at_mem'] = np.asarray(self.cc_at_mem).tolist()
    t0['Dm_cells'] = np.asarray(self.Dm_cells).tolist()
    t0['D_gj'] = np.asarray(self.D_gj).tolist()
    t0['gj_block'] = np.asarray(self.gj_block * np.ones(self.mdl)).tolist()
    t0['NaKATP_block'] = np.asarray(self.NaKATP_block * np.ones(self.mdl)).tolist()
    t0['n_steps'] = int(len(time_steps))
    return orig_loop(self, phase, time_steps, time_steps_sampled, anim_cells)
simmod.Simulator._run_sim_core_loop = loop_hook

phase = runner.init()
if args.extvolt is not None:
    phase = runner.sim()
sim, cells, p = phase.sim, phase.cells, phase.p

ions = [name for name, on in p.ions_dict.items() if on == 1]
out = {
    'source': 'betse default config, ECM off, init phase' + (', channels Nav1p3+Kv1p5' if args.channels else '') + (f', ions {args.ions}' if args.ions else '') + (', network' if args.network else ''),
    'channels': (([{'type': 'Nav1p3', 'ion': 'Na', 'maxDm': 2.0e-14}, {'type': 'Kv1p5', 'ion': 'K', 'maxDm': 1.0e-15}] if args.channels else []) + ([{'type': 'Cav3p3', 'ion': 'Ca', 'maxDm': 1.0e-15}] if args.cav else []) + ([{'type': 'KLeak', 'ion': 'K', 'maxDm': 6e-18, 'inhibitors': NETWORK['channelInfluence']['KLeak']['inhibitors']}] if args.network else [])),
    'network': NETWORK if args.network else None,
    'params': {
        'dt': p.dt, 'T': p.T, 'F': p.F, 'R': p.R, 'cm': p.cm, 'tm': p.tm,
        'vol_env': p.vol_env, 'cell_height': p.cell_height,
        'gj_surface': p.gj_surface, 'gj_vthresh': p.gj_vthresh, 'gj_min': p.gj_min,
        'v_sensitive_gj': bool(p.v_sensitive_gj), 'gj_len': float(cells.gj_len),
        'alpha_NaK': p.alpha_NaK, 'KmNK_Na': p.KmNK_Na, 'KmNK_K': p.KmNK_K,
        'KmNK_ATP': p.KmNK_ATP, 'deltaGATP': p.deltaGATP,
        'cATP': p.cATP, 'cADP': p.cADP, 'cPi': p.cPi,
        'cluster_open': bool(p.cluster_open),
        'alpha_Ca': p.alpha_Ca, 'KmCa_Ca': p.KmCa_Ca, 'KmCa_ATP': p.KmCa_ATP, 'Ca_dyn': bool(p.Ca_dyn),
        'is_ecm': bool(p.is_ecm), 'grid_size': int(p.grid_size), 'er': p.er, 'eo': p.eo, 'kb': p.kb, 'q': p.q, 'NAv': p.NAv,
        'true_cell_size': p.true_cell_size, 'cell_radius': p.cell_radius, 'D_tj': p.D_tj, 'D_adh': p.D_adh,
        'Dtj_rel': {k: float(v) for k, v in p.Dtj_rel.items()}, 'sharpness': p.sharpness, 'fast_update_ecm': bool(p.fast_update_ecm),
        'cbnd': {k: float(v) for k, v in (p.cbnd or {}).items()},
        'ext_volt': None if args.extvolt is None else {'peak': args.extvolt, 'start': 0.3 * args.total, 'finish': 0.7 * args.total, 'rate': 0.05 * args.total, 'pos': 'T', 'neg': 'B'},
    },
    'ions': [{'name': n, 'z': p.ion_charge[n], 'D_free': p.free_diff[n],
              'Dm': p.mem_perms[n], 'c_cell': p.cell_concs[n], 'c_env': p.env_concs[n]}
             for n in ions],
    'mesh': {
        'cell_centres': cells.cell_centres.tolist(),
        'cell_verts': [np.asarray(v).tolist() for v in cells.cell_verts],
        'mem_mids': cells.mem_mids_flat.tolist(),
        'mem_normals': cells.mem_vects_flat[:, 2:4].tolist(),
        'mem_sa': cells.mem_sa.tolist(),
        'mem_vol': cells.mem_vol.tolist(),
        'R_rads': cells.R_rads.tolist(),
        'cell_sa': cells.cell_sa.tolist(),
        'cell_vol': cells.cell_vol.tolist(),
        'diviterm': cells.diviterm.tolist(),
        'num_mems': cells.num_mems.tolist(),
        'mem_to_cells': cells.mem_to_cells.tolist(),
        'nn_i': cells.nn_i.tolist(),
        'cell_nn_i': cells.cell_nn_i.tolist(),
        'bflags_mems': cells.bflags_mems.tolist(),
        'gj_default_weights': cells.gj_default_weights.tolist(),
    },
    'ecm': None if not args.ecm else {
        'shape': list(cells.X.shape), 'delta': float(cells.delta),
        'xmin': float(cells.xmin), 'xmax': float(cells.xmax), 'ymin': float(cells.ymin), 'ymax': float(cells.ymax),
        'X': cells.X.ravel().tolist(), 'Y': cells.Y.ravel().tolist(),
        'map_mem2ecm': cells.map_mem2ecm.tolist(), 'map_cell2ecm': cells.map_cell2ecm.tolist(),
        'envInds_inClust': cells.envInds_inClust.tolist(), 'memSa_per_envSquare': cells.memSa_per_envSquare.tolist(),
        'all_bound_mem_inds': np.asarray(cells.all_bound_mem_inds).tolist(), 'interior_bound_mem_inds': np.asarray(cells.interior_bound_mem_inds).tolist(),
        'ecm_inds_bound_cell': np.asarray(cells.ecm_inds_bound_cell).tolist(),
        'D_env': np.asarray(sim.D_env).tolist(), 'ko_env': float(sim.ko_env), 'c_env_bound': [float(x) for x in sim.c_env_bound],
    },
    't0': t0,
    'snaps': snaps,
}
with open(args.out, 'w') as f:
    json.dump(out, f)
print('wrote', args.out, 'cells', len(cells.cell_i), 'mems', len(cells.mem_i),
      'snaps', len(snaps), 'steps', t0['n_steps'])
