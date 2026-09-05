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
doc['general network']['implement network'] = args.channels
if args.channels:
    net = doc['general network']
    net['biomolecules'] = []
    net['reactions'] = None
    net['transporters'] = None
    net['modulators'] = None
    net['channels'] = [
        {'name': 'Nav', 'channel class': 'Na', 'channel type': 'Nav1p3', 'max Dm': 2.0e-14, 'apply to': 'all', 'init active': True},
        {'name': 'Kv', 'channel class': 'K', 'channel type': 'Kv1p5', 'max Dm': 1.0e-15, 'apply to': 'all', 'init active': True},
    ]
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
    return {
        'vm': sim.vm.tolist(),
        'cc_cells': np.asarray(sim.cc_cells).tolist(),
        'cc_env': [float(np.asarray(c).ravel()[0]) for c in sim.cc_env],
        'gjopen': np.asarray(sim.gjopen * np.ones(sim.mdl)).tolist(),
    }
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
    'source': 'betse default config, ECM off, init phase' + (', channels Nav1p3+Kv1p5' if args.channels else ''),
    'channels': [{'type': 'Nav1p3', 'ion': 'Na', 'maxDm': 2.0e-14}, {'type': 'Kv1p5', 'ion': 'K', 'maxDm': 1.0e-15}] if args.channels else [],
    'params': {
        'dt': p.dt, 'T': p.T, 'F': p.F, 'R': p.R, 'cm': p.cm, 'tm': p.tm,
        'vol_env': p.vol_env, 'cell_height': p.cell_height,
        'gj_surface': p.gj_surface, 'gj_vthresh': p.gj_vthresh, 'gj_min': p.gj_min,
        'v_sensitive_gj': bool(p.v_sensitive_gj), 'gj_len': float(cells.gj_len),
        'alpha_NaK': p.alpha_NaK, 'KmNK_Na': p.KmNK_Na, 'KmNK_K': p.KmNK_K,
        'KmNK_ATP': p.KmNK_ATP, 'deltaGATP': p.deltaGATP,
        'cATP': p.cATP, 'cADP': p.cADP, 'cPi': p.cPi,
        'cluster_open': bool(p.cluster_open),
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
