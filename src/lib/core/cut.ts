import { finishMesh, type Mesh } from './mesh';
import type { SimState } from './state';

/**
 * Remove a set of cells from the mesh (a wound / BETSE "cut" event).
 * Returns the reduced mesh and a state whose arrays are re-indexed to it.
 * Membranes that faced a removed cell become boundary membranes.
 * cellMap[old] / memMap[old] = new index or -1 for removed cells / membranes.
 */
export function cutCells(mesh: Mesh, s: SimState, removed: Set<number>): { mesh: Mesh; state: SimState; cellMap: Int32Array; memMap: Int32Array } {
	const cellMap = new Int32Array(mesh.nCells).fill(-1);
	let nCells = 0;
	for (let c = 0; c < mesh.nCells; c++) if (!removed.has(c)) cellMap[c] = nCells++;
	const memMap = new Int32Array(mesh.nMems).fill(-1);
	let nMems = 0;
	for (let m = 0; m < mesh.nMems; m++) if (cellMap[mesh.memToCell[m]] >= 0) memMap[m] = nMems++;

	const d = mesh.dim;
	const pick = (src: Float64Array, map: Int32Array, n: number, stride: number) => {
		const out = new Float64Array(n * stride);
		for (let i = 0; i < map.length; i++) {
			const j = map[i];
			if (j < 0) continue;
			for (let k = 0; k < stride; k++) out[j * stride + k] = src[i * stride + k];
		}
		return out;
	};
	const pickMem = (src: Float64Array) => pick(src, memMap, nMems, 1);

	// vertices: cell-major ranges
	const vertStart = new Int32Array(nCells + 1);
	for (let c = 0; c < mesh.nCells; c++) {
		const j = cellMap[c];
		if (j >= 0) vertStart[j + 1] = mesh.vertStart[c + 1] - mesh.vertStart[c];
	}
	for (let j = 0; j < nCells; j++) vertStart[j + 1] += vertStart[j];
	const verts = new Float64Array(vertStart[nCells] * d);
	for (let c = 0; c < mesh.nCells; c++) {
		const j = cellMap[c];
		if (j < 0) continue;
		verts.set(mesh.verts.subarray(mesh.vertStart[c] * d, mesh.vertStart[c + 1] * d), vertStart[j] * d);
	}

	const memToCell = new Int32Array(nMems);
	const memPartner = new Int32Array(nMems);
	const boundary: number[] = [];
	for (let m = 0; m < mesh.nMems; m++) {
		const j = memMap[m];
		if (j < 0) continue;
		memToCell[j] = cellMap[mesh.memToCell[m]];
		const q = memMap[mesh.memPartner[m]];
		memPartner[j] = q >= 0 ? q : j;
		if (q < 0 || q === j) boundary.push(j);
	}

	const newMesh = finishMesh({
		dim: d,
		nCells,
		nMems,
		cellCentres: pick(mesh.cellCentres, cellMap, nCells, d),
		verts,
		vertStart,
		memMids: pick(mesh.memMids, memMap, nMems, d),
		memNormals: pick(mesh.memNormals, memMap, nMems, d),
		memSa: pickMem(mesh.memSa),
		rRads: pickMem(mesh.rRads),
		memToCell,
		memPartner,
		boundaryMems: Int32Array.from(boundary),
		gjLen: mesh.gjLen,
		gjWeights: pickMem(mesh.gjWeights)
	});

	const pickCell = (src: Float64Array) => pick(src, cellMap, nCells, 1);
	const state: SimState = {
		t: s.t,
		step: s.step,
		vm: pickMem(s.vm),
		vmAve: pickCell(s.vmAve),
		ccCells: s.ccCells.map(pickCell),
		ccAtMem: s.ccAtMem.map(pickMem),
		ccEnv: Float64Array.from(s.ccEnv),
		Dm: s.Dm.map(pickMem),
		Dgj: s.Dgj.map(pickMem),
		gjOpen: pickMem(s.gjOpen),
		gjBlock: pickMem(s.gjBlock),
		nakBlock: pickMem(s.nakBlock),
		fluxesMem: s.fluxesMem.map(pickMem),
		fluxesGj: s.fluxesGj.map(pickMem),
		rateNaK: pickMem(s.rateNaK),
		rhoCells: pickCell(s.rhoCells),
		vgj: pickMem(s.vgj),
		nakMod: pickMem(s.nakMod),
		gjMod: pickMem(s.gjMod),
		extraRho: pickCell(s.extraRho)
	};
	return { mesh: newMesh, state, cellMap, memMap };
}
