/** Loader for parity fixtures exported by tools/betse/dump_parity.py. */
import { finishMesh, type Mesh } from './mesh';
import type { Ion, Params } from './params';
import type { NetworkConfig } from './network';
import { createState, type SimState } from './state';
import { buildEcm, createEcmState, setScreening, type Ecm } from './ecm';

export interface BetseFixture {
	channels?: { type: string; ion: string; maxDm: number; inhibitors?: { name: string; Km: number; n: number; zone: 'cell' | 'env' }[] }[];
	network?: NetworkConfig | null;
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
		/** BETSE's membrane copy of the concentrations; can differ from cc_cells after its charge balancing */
		cc_at_mem?: number[][];
		cc_env: number[] | number[][];
		gjopen: number[];
		v_env?: number[];
		E_env_x?: number[];
		E_env_y?: number[];
		Dm_cells: number[][];
		D_gj: number[][];
		gj_block: number[];
		NaKATP_block: number[];
		n_steps: number;
		subs?: Record<string, { cells: number[]; mem: number[]; env: number }>;
	};
	/** extracellular grid geometry when the fixture was exported with --ecm */
	ecm?: { shape: number[]; delta: number; xmin: number; xmax: number; ymin: number; ymax: number; map_mem2ecm: number[]; map_cell2ecm: number[]; envInds_inClust: number[]; memSa_per_envSquare: number[]; D_env: number[][]; ko_env: number; c_env_bound: number[] } | null;
	snaps: { step: number; vm: number[]; cc_cells: number[][]; cc_env: number[] | number[][]; gjopen: number[]; v_env?: number[]; E_env_x?: number[]; E_env_y?: number[]; subs?: Record<string, { cells: number[]; mem: number[]; env: number }>; nak_block?: number[] }[];
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
		if (t.cc_at_mem) s.ccAtMem[i].set(t.cc_at_mem[i]);
		else for (let m = 0; m < mesh.nMems; m++) s.ccAtMem[i][m] = s.ccCells[i][mesh.memToCell[m]];
		s.ccEnv[i] = Array.isArray(t.cc_env[i]) ? (t.cc_env[i] as number[])[0] : (t.cc_env[i] as number);
		s.Dm[i].set(t.Dm_cells[i]);
		s.Dgj[i].set(t.D_gj[i]);
	}
	s.gjOpen.set(t.gjopen);
	s.gjBlock.set(t.gj_block);
	s.nakBlock.set(t.NaKATP_block);
	if (fx.ecm) {
		s.ecm = createEcmState(ecmFromBetse(fx, mesh, ions), ions);
		for (let i = 0; i < ions.length; i++) s.ecm.cc[i].set(t.cc_env[i] as number[]);
		setScreening(s.ecm, ions);
		if (t.v_env) { s.ecm.vEnv.set(t.v_env); s.ecm.eEnvX.set(t.E_env_x!); s.ecm.eEnvY.set(t.E_env_y!); }
	}
	return s;
}

/** Grid built by our own rules from the fixture's world bounds; the fixture's maps must agree (checked in the parity test). */
export function ecmFromBetse(fx: BetseFixture, mesh: Mesh, ions: Ion[]): Ecm {
	const e = fx.ecm!, q = fx.params as Record<string, number>;
	const tjRel = (fx.params as unknown as { Dtj_rel: Record<string, number> }).Dtj_rel ?? {};
	return buildEcm(mesh, ions, { gridSize: q.grid_size, tjScale: q.D_tj, adhScale: q.D_adh, tjRel }, [e.xmin, e.xmax, e.ymin, e.ymax], q.cell_height, q.cell_radius, q.T, q.true_cell_size);
}
