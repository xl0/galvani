import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ionsFromBetse, meshFromBetse, paramsFromBetse, stateFromBetse, type BetseFixture } from './betse';
import { createChannel } from './channels';
import { step } from './step';

const fx: BetseFixture = JSON.parse(readFileSync(new URL('../../../tests/fixtures/betse-channels.json', import.meta.url), 'utf8'));
const mesh = meshFromBetse(fx);
const ions = ionsFromBetse(fx);
const p = paramsFromBetse(fx);

const maxAbs = (a: ArrayLike<number>, b: ArrayLike<number>) => { let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i])); return d; };
const maxRel = (a: ArrayLike<number>, b: ArrayLike<number>) => { let d = 0; for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]) / Math.max(Math.abs(b[i]), 1e-30)); return d; };

describe('BETSE parity with Nav1p3 + Kv1p5 channels', () => {
	it('tracks BETSE trajectories step for step', () => {
		const s = stateFromBetse(fx, mesh, ions);
		const channels = fx.channels!.map((c, k) => createChannel(`c${k}`, c.type, c.maxDm, ions, s.vm));
		let worstVm = 0, worstCc = 0, worstEnv = 0;
		for (const snap of fx.snaps) {
			while (s.step < snap.step) step(mesh, ions, p, s, channels);
			worstVm = Math.max(worstVm, maxAbs(s.vm, snap.vm));
			for (let i = 0; i < ions.length; i++) worstCc = Math.max(worstCc, maxRel(s.ccCells[i], snap.cc_cells[i]));
			worstEnv = Math.max(worstEnv, maxRel(s.ccEnv, snap.cc_env));
		}
		console.log(`channel parity after ${s.step} steps: |dVm| ${worstVm.toExponential(2)} V, rel dcc ${worstCc.toExponential(2)}, rel denv ${worstEnv.toExponential(2)}`);
		expect(worstVm).toBeLessThan(1e-10);
		expect(worstCc).toBeLessThan(1e-11);
		expect(worstEnv).toBeLessThan(1e-11);
	});

	it('diverges from BETSE when the channels are left out (fixture exercises them)', () => {
		const s = stateFromBetse(fx, mesh, ions);
		const last = fx.snaps[fx.snaps.length - 1];
		while (s.step < last.step) step(mesh, ions, p, s);
		expect(maxAbs(s.vm, last.vm)).toBeGreaterThan(1e-4);
	});
});
