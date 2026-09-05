import { defaultExperiment, type Experiment } from './core/experiment';
import { generateMesh } from './core/generator';

/** Cells within radius r [m] of world point (x, y) for the experiment's generator. */
function cellsNear(exp: Experiment, x: number, y: number, r: number): number[] {
	const mesh = generateMesh(exp.generator);
	const out: number[] = [];
	for (let c = 0; c < mesh.nCells; c++) {
		if (Math.hypot(mesh.cellCentres[2 * c] - x, mesh.cellCentres[2 * c + 1] - y) <= r) out.push(c);
	}
	return out;
}

export interface Preset {
	id: string;
	name: string;
	blurb: string;
	make: () => Experiment;
}

export const presets: Preset[] = [
	{
		id: 'resting',
		name: 'Resting cluster',
		blurb: 'BETSE defaults. Na/K pumps polarize every cell from 0 mV; watch Vm settle.',
		make: () => structuredClone(defaultExperiment)
	},
	{
		id: 'leaky-patch',
		name: 'Leaky K+ patch',
		blurb: 'A central patch with 20x K+ permeability hyperpolarizes; gap junctions spread it to neighbours.',
		make: () => {
			const e = structuredClone(defaultExperiment);
			const W = e.generator.worldSize / 2;
			e.name = 'Leaky K+ patch';
			e.profiles = [{ id: 'patch', name: 'K+ leaky patch', color: '#ff7f0e', cells: cellsNear(e, W, W, 18e-6), Dm: { K: 2e-17 }, pumpScale: 1, gjScale: 1 }];
			return e;
		}
	},
	{
		id: 'na-pulse',
		name: 'Na+ pulse',
		blurb: 'From t = 20 s to 25 s all membranes get 50x Na+ permeability: a transient depolarization and recovery.',
		make: () => {
			const e = structuredClone(defaultExperiment);
			e.name = 'Na+ pulse';
			e.events = [{ kind: 'perm', t: 20, tEnd: 25, ion: 'Na', profile: '', factor: 50 }];
			return e;
		}
	},
	{
		id: 'wound',
		name: 'Wound',
		blurb: 'A wedge of cells is cut away at t = 10 s; the new boundary cells lose their neighbours\' coupling.',
		make: () => {
			const e = structuredClone(defaultExperiment);
			const W = e.generator.worldSize / 2;
			e.name = 'Wound';
			e.profiles = [{ id: 'wound', name: 'Wound site', color: '#d62728', cells: cellsNear(e, W + 40e-6, W, 22e-6), Dm: {}, pumpScale: 1, gjScale: 1 }];
			e.events = [{ kind: 'cut', t: 10, profile: 'wound' }];
			return e;
		}
	}
];
