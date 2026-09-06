import { describe, expect, it } from 'vitest';
import { applyModulation, baseExperiment, type Experiment } from './experiment';
import { generateMesh } from './generator';
import { createState, updateV } from './state';
import { step } from './step';
import { basicCaIons } from './defaults';
import { ErCalcium, defaultCalcium } from './calcium';

/** One cell with the default store and the calcium-wave preset's membrane settings. */
function single() {
	const ex: Experiment = structuredClone(baseExperiment);
	ex.ions = structuredClone(basicCaIons).map((i) => (i.name === 'Ca' ? { ...i, Dm: 5e-18, cCell: 3e-5 } : i));
	ex.params = { ...ex.params, dt: 2e-3 };
	ex.generator.mask = { kind: 'circle', radius: 4e-6 };
	ex.calcium = { ...defaultCalcium };
	const mesh = generateMesh(ex.generator);
	const iCa = ex.ions.findIndex((i) => i.name === 'Ca');
	ex.profiles = [{ id: 'all', name: 'all', color: '#f00', cells: [0] }];
	ex.modifiers = [{ kind: 'perm', ion: 'Ca', factor: 50, profile: 'all', t: 60, tEnd: 61, enabled: true }];
	const s = createState(mesh, ex.ions, -0.05, ex.params.cm);
	applyModulation(mesh, ex, s, 0);
	updateV(mesh, ex.ions, ex.params, s);
	const ca = new ErCalcium(ex.calcium!, mesh, iCa);
	return { ex, mesh, s, ca, iCa };
}

describe('ER calcium store', () => {
	it('rests quietly with a filled store, fires once when pushed, and recovers', () => {
		const { ex, mesh, s, ca, iCa } = single();
		let spontaneous = 0, above = false, peak = 0; const events: number[] = [];
		while (s.t < 80) {
			applyModulation(mesh, ex, s, s.t);
			step(mesh, ex.ions, ex.params, s, [], null, ca);
			const c = s.ccCells[iCa][0] * 1e3; // µM
			// after the initial store/cytosol transient has settled
			if (s.t > 20 && s.t < 60) { if (c > 0.3 && !above) { spontaneous++; events.push(+s.t.toFixed(1)); } above = c > 0.3; }
			if (s.t > 60) peak = Math.max(peak, c);
		}
		expect(events).toEqual([]);
		expect(ca.cEr[0]).toBeGreaterThan(0.2); // store refilled after the event
		expect(peak).toBeGreaterThan(1); // regenerative release, not just the pulse
		expect(s.ccCells[iCa][0] * 1e3).toBeLessThan(0.1); // back at rest 19 s later
		expect(Math.abs(s.erRho[0])).toBeGreaterThan(0); // exchange is charge-compensated
	});
});
