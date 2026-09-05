import type { Mesh } from './mesh';
import type { Ion, Params } from './params';
import { F } from './params';

/** Mutable simulation state. Per-ion arrays are indexed [ion][cell|mem]. */
export interface SimState {
	t: number;
	step: number;
	/** membrane voltage [V], per membrane */
	vm: Float64Array;
	/** cell-average vm, per cell */
	vmAve: Float64Array;
	/** concentrations at cell centres [mol/m3] */
	ccCells: Float64Array[];
	/** concentrations at membranes (lagged copy of ccCells, see step.ts) */
	ccAtMem: Float64Array[];
	/** bath concentration per ion (well-mixed) */
	ccEnv: Float64Array;
	/** membrane permeability per ion per membrane */
	Dm: Float64Array[];
	/** gap-junction diffusion constant per ion per membrane */
	Dgj: Float64Array[];
	/** gap-junction open fraction, block factor; pump block factor */
	gjOpen: Float64Array;
	gjBlock: Float64Array;
	nakBlock: Float64Array;
	/** scratch: fluxes into cell across membranes / through GJs [mol/m2 s] */
	fluxesMem: Float64Array[];
	fluxesGj: Float64Array[];
	/** Na/K pump rate per membrane */
	rateNaK: Float64Array;
	/** net charge density per cell [C/m3] */
	rhoCells: Float64Array;
	/** transjunctional voltage per membrane */
	vgj: Float64Array;
	/** per-membrane multipliers written by network modulators (BETSE NaKATP_block / gj_block) */
	nakMod: Float64Array;
	gjMod: Float64Array;
	/** extra charge density per cell from network substances [C/m3] */
	extraRho: Float64Array;
}

/**
 * Fresh state with uniform concentrations. `initialVm` [V] is realized by adding
 * balancing anion ("M", or the last anion) so that rho*diviterm/cm = initialVm per cell.
 */
export function createState(mesh: Mesh, ions: Ion[], initialVm = 0, cm = 0.05): SimState {
	const { nCells, nMems } = mesh;
	const n = ions.length;
	const per = (len: number, fill = 0) => Array.from({ length: n }, () => new Float64Array(len).fill(fill));
	const s: SimState = {
		t: 0,
		step: 0,
		vm: new Float64Array(nMems),
		vmAve: new Float64Array(nCells),
		ccCells: ions.map((ion) => new Float64Array(nCells).fill(ion.cCell)),
		ccAtMem: ions.map((ion) => new Float64Array(nMems).fill(ion.cCell)),
		ccEnv: Float64Array.from(ions, (ion) => ion.cEnv),
		Dm: ions.map((ion) => new Float64Array(nMems).fill(ion.Dm)),
		Dgj: ions.map((ion) => new Float64Array(nMems).fill(ion.Dfree)),
		gjOpen: Float64Array.from(mesh.gjWeights),
		gjBlock: new Float64Array(nMems).fill(1),
		nakBlock: new Float64Array(nMems).fill(1),
		fluxesMem: per(nMems),
		fluxesGj: per(nMems),
		rateNaK: new Float64Array(nMems),
		rhoCells: new Float64Array(nCells),
		vgj: new Float64Array(nMems),
		nakMod: new Float64Array(nMems).fill(1),
		gjMod: new Float64Array(nMems).fill(1),
		extraRho: new Float64Array(nCells)
	};
	if (initialVm !== 0) {
		let ia = ions.findIndex((i) => i.name === 'M');
		if (ia < 0) ia = ions.findIndex((i) => i.z < 0);
		if (ia >= 0) {
			const z = ions[ia].z;
			for (let c = 0; c < nCells; c++) {
				// Vm = rho * diviterm / cm  ->  rho = Vm * cm / diviterm, dc = rho / (z F)
				s.ccCells[ia][c] += (initialVm * cm) / mesh.diviterm[c] / (z * F);
			}
			for (let m = 0; m < nMems; m++) s.ccAtMem[ia][m] = s.ccCells[ia][mesh.memToCell[m]];
		}
	}
	return s;
}

/** Vm from net cell charge: surface charge / capacitance (BETSE update_V, polarizability 0). */
export function updateV(mesh: Mesh, ions: Ion[], p: Params, s: SimState): void {
	const { nCells, nMems } = mesh;
	s.rhoCells.set(s.extraRho);
	for (let i = 0; i < ions.length; i++) {
		const zF = ions[i].z * F;
		const cc = s.ccCells[i];
		for (let c = 0; c < nCells; c++) s.rhoCells[c] += zF * cc[c];
	}
	s.vmAve.fill(0);
	for (let m = 0; m < nMems; m++) {
		const c = mesh.memToCell[m];
		s.vm[m] = (s.rhoCells[c] * mesh.diviterm[c]) / p.cm;
		s.vmAve[c] += s.vm[m];
	}
	for (let c = 0; c < nCells; c++) s.vmAve[c] /= mesh.numMems[c];
}
