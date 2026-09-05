/** Loader for parity fixtures exported by tools/betse/dump_parity.py. */
import { finishMesh, type Mesh } from './mesh';
import type { Ion, Params } from './params';
import { createState, type SimState } from './state';

export interface BetseFixture {
	channels?: { type: string; ion: string; maxDm: number }[];
	params: Record<string, number | boolean>;
	ions: { name: string; z: number; D_free: number; Dm: number; c_cell: number; c_env: number }[];
	mesh: {
		cell_centres: number[][];
		cell_verts: number[][][];
		mem_mids: number[][];
		mem_normals: number[][];
		mem_sa: number[];
		mem_vol: number[];
		R_rads: number[];
		cell_sa: number[];
		cell_vol: number[];
		diviterm: number[];
		num_mems: number[];
		mem_to_cells: number[];
		nn_i: number[];
		bflags_mems: number[];
		gj_default_weights: number[];
	};
	t0: {
		vm: number[];
		cc_cells: number[][];
		cc_env: number[];
		gjopen: number[];
		Dm_cells: number[][];
		D_gj: number[][];
		gj_block: number[];
		NaKATP_block: number[];
		n_steps: number;
	};
	snaps: { step: number; vm: number[]; cc_cells: number[][]; cc_env: number[]; gjopen: number[] }[];
}

export function paramsFromBetse(fx: BetseFixture): Params {
	const q = fx.params as Record<string, number> & { v_sensitive_gj: boolean };
	return {
		dt: q.dt,
		T: q.T,
		cm: q.cm,
		tm: q.tm,
		volEnv: q.vol_env,
		gjSurface: q.gj_surface,
		gjVthresh: q.gj_vthresh,
		gjMin: q.gj_min,
		vSensitiveGj: q.v_sensitive_gj,
		alphaNaK: q.alpha_NaK,
		KmNK_Na: q.KmNK_Na,
		KmNK_K: q.KmNK_K,
		KmNK_ATP: q.KmNK_ATP,
		deltaGATP: q.deltaGATP,
		cATP: q.cATP,
		cADP: q.cADP,
		cPi: q.cPi,
		alphaCa: q.alpha_Ca ?? 5e-8,
		KmCa_Ca: q.KmCa_Ca ?? 1e-3,
		KmCa_ATP: q.KmCa_ATP ?? 0.5
	};
}

export function ionsFromBetse(fx: BetseFixture): Ion[] {
	return fx.ions.map((i) => ({ name: i.name, z: i.z, Dfree: i.D_free, Dm: i.Dm, cCell: i.c_cell, cEnv: i.c_env }));
}

export function meshFromBetse(fx: BetseFixture): Mesh {
	const m = fx.mesh;
	const nCells = m.cell_centres.length;
	const nMems = m.mem_mids.length;
	const vertStart = new Int32Array(nCells + 1);
	for (let c = 0; c < nCells; c++) vertStart[c + 1] = vertStart[c] + m.cell_verts[c].length;
	const verts = new Float64Array(2 * vertStart[nCells]);
	for (let c = 0, k = 0; c < nCells; c++) for (const [x, y] of m.cell_verts[c]) (verts[k++] = x), (verts[k++] = y);
	return finishMesh({
		dim: 2,
		nCells,
		nMems,
		cellCentres: Float64Array.from(m.cell_centres.flat()),
		verts,
		vertStart,
		memMids: Float64Array.from(m.mem_mids.flat()),
		memNormals: Float64Array.from(m.mem_normals.flat()),
		memSa: Float64Array.from(m.mem_sa),
		rRads: Float64Array.from(m.R_rads),
		memToCell: Int32Array.from(m.mem_to_cells),
		memPartner: Int32Array.from(m.nn_i),
		boundaryMems: Int32Array.from(m.bflags_mems),
		gjLen: fx.params.gj_len as number,
		gjWeights: Float64Array.from(m.gj_default_weights)
	});
}

/** State at t=0 as BETSE had it right before its time loop. */
export function stateFromBetse(fx: BetseFixture, mesh: Mesh, ions: Ion[]): SimState {
	const s = createState(mesh, ions);
	const t = fx.t0;
	s.vm.set(t.vm);
	for (let i = 0; i < ions.length; i++) {
		s.ccCells[i].set(t.cc_cells[i]);
		for (let m = 0; m < mesh.nMems; m++) s.ccAtMem[i][m] = s.ccCells[i][mesh.memToCell[m]];
		s.ccEnv[i] = t.cc_env[i];
		s.Dm[i].set(t.Dm_cells[i]);
		s.Dgj[i].set(t.D_gj[i]);
	}
	s.gjOpen.set(t.gjopen);
	s.gjBlock.set(t.gj_block);
	s.nakBlock.set(t.NaKATP_block);
	return s;
}
