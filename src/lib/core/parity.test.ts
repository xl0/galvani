import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ionsFromBetse, meshFromBetse, paramsFromBetse, stateFromBetse, type BetseFixture } from './betse';
import { createChannel } from './channels';
import { Network } from './network';
import { updateV } from './state';
import { step } from './step';

const load = (name: string): BetseFixture => JSON.parse(readFileSync(new URL(`../../../tests/fixtures/${name}.json`, import.meta.url), 'utf8'));
const maxAbs = (a: ArrayLike<number>, b: ArrayLike<number>) => { let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; };
const maxRel = (a: ArrayLike<number>, b: ArrayLike<number>) => { let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]) / Math.max(Math.abs(b[i]), 1e-30)); return d; };

/** Fixtures exported by tools/betse/dump.sh; each is BETSE's default config, ECM off, init phase, plus the listed twist. */
const cases = [
	{ name: 'betse-basic', twist: 'Na/K/P/M, pump + GJ only' },
	{ name: 'betse-channels', twist: 'Nav1p3 + Kv1p5 channels' },
	{ name: 'betse-ca', twist: 'basic_Ca profile with Ca-ATPase' },
	{ name: 'betse-ca-channels', twist: 'basic_Ca + Nav1p3, Kv1p5, Cav3p3 channels' },
	{ name: 'betse-network', twist: 'substance network: growth, reaction, gating, modulator, channel inhibitor' }
];

describe.each(cases)('BETSE parity: $twist ($name)', ({ name }) => {
	const fx = load(name);
	const mesh = meshFromBetse(fx);
	const ions = ionsFromBetse(fx);
	const p = paramsFromBetse(fx);
	const channels = () => (fx.channels ?? []).map((c, k) => createChannel(`c${k}`, c.type, c.maxDm, ions, new Float64Array(mesh.nMems)));
	/** network built on a loaded state, with substance pools from t0 */
	const network = (s: ReturnType<typeof stateFromBetse>, ch: ReturnType<typeof channels>) => {
		if (!fx.network) return null;
		const net = new Network(fx.network, mesh, ions, p, s, () => null);
		for (const [name, v] of Object.entries(fx.t0.subs ?? {})) net.setConcentrations(name, v.cells, v.mem, v.env);
		(fx.channels ?? []).forEach((c, k) => { if (c.inhibitors?.length) net.setChannelRegulators(ch[k].id, [], c.inhibitors); });
		return net;
	};

	it('derives the same cell volumes and diviterm from membrane geometry', () => {
		expect(maxRel(mesh.cellVol, fx.mesh.cell_vol)).toBeLessThan(1e-12);
		expect(maxRel(mesh.diviterm, fx.mesh.diviterm)).toBeLessThan(1e-12);
	});

	it('reproduces the initial Vm from concentrations', () => {
		const s = stateFromBetse(fx, mesh, ions);
		network(s, channels());
		const vm0 = Float64Array.from(s.vm);
		updateV(mesh, ions, p, s);
		expect(maxAbs(s.vm, vm0)).toBeLessThan(1e-13);
	});

	it('tracks BETSE trajectories step for step', () => {
		const s = stateFromBetse(fx, mesh, ions);
		const ch = channels();
		const net = network(s, ch);
		let worstVm = 0, worstCc = 0, worstEnv = 0, worstGj = 0, worstSub = 0;
		for (const snap of fx.snaps) {
			while (s.step < snap.step) step(mesh, ions, p, s, ch, net);
			worstVm = Math.max(worstVm, maxAbs(s.vm, snap.vm));
			for (let i = 0; i < ions.length; i++) worstCc = Math.max(worstCc, maxRel(s.ccCells[i], snap.cc_cells[i]));
			worstEnv = Math.max(worstEnv, maxRel(s.ccEnv, snap.cc_env));
			worstGj = Math.max(worstGj, maxAbs(s.gjOpen, snap.gjopen));
			if (net && snap.subs) for (const sub of net.subs) { const ref = snap.subs[sub.cfg.name]; worstSub = Math.max(worstSub, maxAbs(sub.cCells, ref.cells), maxAbs(sub.cMem, ref.mem), Math.abs(sub.cEnv - ref.env)); }
		}
		console.log(`${name}: after ${s.step} steps |dVm| ${worstVm.toExponential(2)} V, rel dcc ${worstCc.toExponential(2)}, rel denv ${worstEnv.toExponential(2)}, |dgj| ${worstGj.toExponential(2)}${net ? `, |dsub| ${worstSub.toExponential(2)} mM` : ''}`);
		if (net) expect(worstSub).toBeLessThan(1e-9);
		expect(worstVm).toBeLessThan(1e-10);
		expect(worstCc).toBeLessThan(1e-10); // Ca2+ sits at 1e-4 mM, so relative round-off is larger
		expect(worstEnv).toBeLessThan(1e-11);
		expect(worstGj).toBeLessThan(1e-10);
	});

	if (fx.channels?.length && !fx.network) {
		it('diverges from BETSE when the channels are left out (fixture exercises them)', () => {
			const s = stateFromBetse(fx, mesh, ions);
			const last = fx.snaps[fx.snaps.length - 1];
			while (s.step < last.step) step(mesh, ions, p, s);
			expect(maxAbs(s.vm, last.vm)).toBeGreaterThan(1e-4);
		});
	}
});
