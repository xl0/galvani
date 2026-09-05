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
doc['general options']['simulate extracellular spaces'] = False
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
        'cc_env': [float(np.asarray(c).ravel()[0]) for c in sim.cc_env],
        'gjopen': np.asarray(sim.gjopen * np.ones(sim.mdl)).tolist(),
    }
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
    SIM[0] = self
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
    't0': t0,
    'snaps': snaps,
}
with open(args.out, 'w') as f:
    json.dump(out, f)
print('wrote', args.out, 'cells', len(cells.cell_i), 'mems', len(cells.mem_i),
      'snaps', len(snaps), 'steps', t0['n_steps'])
