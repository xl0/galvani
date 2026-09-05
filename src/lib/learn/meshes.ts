/** Tiny meshes for the lessons: one cell, two cells, a one-row strip. */
import { cutCells } from '$lib/core/cut';
import { basicIons } from '$lib/core/defaults';
import { defaultGenerator, generateMesh, type GeneratorConfig } from '$lib/core/generator';
import type { Mesh } from '$lib/core/mesh';
import { createState } from '$lib/core/state';

const r = defaultGenerator.cellRadius;
const dy = 2 * r * Math.sqrt(3) / 2; // lattice row spacing
const base: GeneratorConfig = { ...defaultGenerator, disorder: 0, seed: 7 };
/** world side such that an even lattice row passes through the centre */
const worldFor = (rows: number) => 2 * (2 * Math.ceil(rows / 2)) * dy;

export function oneCell(): Mesh {
	// no lattice point sits exactly at the world centre, so take the two-cell mesh and drop one
	const two = twoCells();
	return cutCells(two, createState(two, basicIons), new Set([1])).mesh;
}

export function twoCells(): Mesh {
	// two neighbours in the centre row
	return generateMesh({ ...base, worldSize: worldFor(4), mask: { kind: 'rect', w: 4.2 * r, h: 1.2 * r } });
}

/** n cells in a single row */
export function strip(n: number): Mesh {
	const W = Math.max(worldFor(4), 2 * dy * Math.ceil((n + 4) * 2 * r / (2 * dy)));
	return generateMesh({ ...base, worldSize: W, mask: { kind: 'rect', w: n * 2 * r - r, h: 1.2 * r } });
}
