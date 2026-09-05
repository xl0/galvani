import { describe, expect, it } from 'vitest';
import { defaultGenerator, generateMesh } from './generator';

describe('mesh generator', () => {
	const mesh = generateMesh(defaultGenerator);

	it('is deterministic for a seed', () => {
		const again = generateMesh(defaultGenerator);
		expect(again.nCells).toBe(mesh.nCells);
		expect(Array.from(again.memMids)).toEqual(Array.from(mesh.memMids));
	});

	it('pairs membranes symmetrically', () => {
		let interior = 0;
		for (let m = 0; m < mesh.nMems; m++) {
			const q = mesh.memPartner[m];
			expect(mesh.memPartner[q]).toBe(m);
			if (q !== m) {
				interior++;
				expect(mesh.memToCell[q]).not.toBe(mesh.memToCell[m]);
				// partner midpoints are close (separated by the cell gap)
				const d = Math.hypot(mesh.memMids[2 * m] - mesh.memMids[2 * q], mesh.memMids[2 * m + 1] - mesh.memMids[2 * q + 1]);
				expect(d).toBeLessThan(0.3 * defaultGenerator.cellRadius);
			}
		}
		expect(interior).toBeGreaterThan(mesh.nMems / 2);
		expect(mesh.boundaryMems.length + interior).toBe(mesh.nMems);
	});

	it('produces cells of the expected size', () => {
		expect(mesh.nCells).toBeGreaterThan(100);
		const r = defaultGenerator.cellRadius;
		const hexArea = 2 * Math.sqrt(3) * r * r; // regular hex of inradius r
		for (let c = 0; c < mesh.nCells; c++) {
			const area = mesh.cellVol[c] / defaultGenerator.cellHeight;
			expect(area).toBeGreaterThan(0.3 * hexArea);
			expect(area).toBeLessThan(2.5 * hexArea);
		}
	});
});
