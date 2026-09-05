import { describe, expect, it } from 'vitest';
import { cutCells } from './cut';
import { defaultGenerator, generateMesh } from './generator';
import { createState } from './state';
import { step } from './step';
import { basicIons, basicParams } from './defaults';

describe('cutCells', () => {
	it('removes cells, keeps partner symmetry and runs', () => {
		const mesh = generateMesh(defaultGenerator);
		const s0 = createState(mesh, basicIons);
		const removed = new Set<number>();
		const cx = mesh.cellCentres[0], cy = mesh.cellCentres[1];
		for (let c = 0; c < mesh.nCells; c++) {
			if (Math.hypot(mesh.cellCentres[2 * c] - cx, mesh.cellCentres[2 * c + 1] - cy) < 15e-6) removed.add(c);
		}
		expect(removed.size).toBeGreaterThan(1);
		const { mesh: m2, state } = cutCells(mesh, s0, removed);
		expect(m2.nCells).toBe(mesh.nCells - removed.size);
		let boundary = 0;
		for (let m = 0; m < m2.nMems; m++) {
			const q = m2.memPartner[m];
			expect(m2.memPartner[q]).toBe(m);
			if (q === m) boundary++;
		}
		expect(boundary).toBe(m2.boundaryMems.length);
		expect(boundary).toBeGreaterThan(mesh.boundaryMems.length);
		for (let i = 0; i < 10; i++) step(m2, basicIons, basicParams, state);
		expect(Number.isFinite(state.vm[0])).toBe(true);
	});
});
