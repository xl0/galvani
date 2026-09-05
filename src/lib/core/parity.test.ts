import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ionsFromBetse, meshFromBetse, paramsFromBetse, stateFromBetse, type BetseFixture } from './betse';
import { updateV } from './state';
import { step } from './step';

const fx: BetseFixture = JSON.parse(
	readFileSync(new URL('../../../tests/fixtures/betse-basic.json', import.meta.url), 'utf8')
);
const mesh = meshFromBetse(fx);
const ions = ionsFromBetse(fx);
const p = paramsFromBetse(fx);

function maxAbsDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
	let d = 0;
	for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
	return d;
}
function maxRelDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
	let d = 0;
	for (let i = 0; i < a.length; i++) d = Math.max(d, Math.abs(a[i] - b[i]) / Math.max(Math.abs(b[i]), 1e-30));
	return d;
}

describe('BETSE parity (default config, ECM off, init phase)', () => {
	it('derives the same cell volumes and diviterm from membrane geometry', () => {
		expect(maxRelDiff(mesh.cellVol, fx.mesh.cell_vol)).toBeLessThan(1e-12);
		expect(maxRelDiff(mesh.cellSa, fx.mesh.cell_sa)).toBeLessThan(1e-12);
		expect(maxRelDiff(mesh.diviterm, fx.mesh.diviterm)).toBeLessThan(1e-12);
		expect(maxRelDiff(mesh.memVol, fx.mesh.mem_vol)).toBeLessThan(1e-12);
	});

	it('reproduces the initial Vm from concentrations', () => {
		const s = stateFromBetse(fx, mesh, ions);
		const vm0 = Float64Array.from(s.vm);
		updateV(mesh, ions, p, s);
		expect(maxAbsDiff(s.vm, vm0)).toBeLessThan(1e-15);
	});

	it('tracks BETSE trajectories step for step', () => {
		const s = stateFromBetse(fx, mesh, ions);
		let worstVm = 0, worstCc = 0, worstEnv = 0, worstGj = 0;
		for (const snap of fx.snaps) {
			while (s.step < snap.step) step(mesh, ions, p, s);
			worstVm = Math.max(worstVm, maxAbsDiff(s.vm, snap.vm));
			for (let i = 0; i < ions.length; i++) worstCc = Math.max(worstCc, maxRelDiff(s.ccCells[i], snap.cc_cells[i]));
			worstEnv = Math.max(worstEnv, maxRelDiff(s.ccEnv, snap.cc_env));
			worstGj = Math.max(worstGj, maxAbsDiff(s.gjOpen, snap.gjopen));
		}
		console.log(`parity after ${s.step} steps: |dVm| ${worstVm.toExponential(2)} V, rel dcc ${worstCc.toExponential(2)}, rel denv ${worstEnv.toExponential(2)}, |dgj| ${worstGj.toExponential(2)}`);
		expect(worstVm).toBeLessThan(1e-10);
		expect(worstCc).toBeLessThan(1e-11);
		expect(worstEnv).toBeLessThan(1e-11);
		expect(worstGj).toBeLessThan(1e-10);
	});
});
