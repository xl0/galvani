import { baseExperiment, type Experiment } from './core/experiment';
import { defaultEcm } from './core/ecm';
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
		name: 'Resting cluster (BETSE default)',
		blurb: 'BETSE defaults. Na/K pumps polarize every cell from 0 mV; watch Vm settle.',
		make: () => structuredClone(baseExperiment)
	},
	{
		id: 'leaky-patch',
		name: 'Leaky K+ patch',
		blurb: 'A central patch with 20x K+ permeability hyperpolarizes; gap junctions spread it to neighbours.',
		make: () => {
			const e = structuredClone(baseExperiment);
			const W = e.generator.worldSize / 2;
			e.name = 'Leaky K+ patch';
			e.profiles = [{ id: 'patch', name: 'K+ leaky patch', color: '#ff7f0e', cells: cellsNear(e, W, W, 18e-6) }];
			e.modifiers = [{ kind: 'perm', ion: 'K', value: 2e-17, profile: 'patch', t: 0, tEnd: null, enabled: true }];
			return e;
		}
	},
	{
		id: 'na-pulse',
		name: 'Na+ pulse',
		blurb: 'From t = 20 s to 25 s all membranes get 50x Na+ permeability: a transient depolarization and recovery.',
		make: () => {
			const e = structuredClone(baseExperiment);
			e.name = 'Na+ pulse';
			e.modifiers = [{ kind: 'perm', ion: 'Na', factor: 50, profile: '', t: 20, tEnd: 25, enabled: true }];
			return e;
		}
	},
	{
		id: 'excitable',
		name: 'Excitable sheet',
		blurb: 'Nav1.3 + Kv1.5 + K leak on a −60 mV cluster. A 10 ms Na⁺ pulse on the left edge fires an action potential that sweeps across the sheet.',
		make: () => {
			const e = structuredClone(baseExperiment);
			const W = e.generator.worldSize / 2;
			e.name = 'Excitable sheet';
			e.initialVm = -0.06;
			e.params = { ...e.params, dt: 1e-4 };
			e.endTime = 0.5;
			e.channels = [
				{ id: 'kleak', type: 'KLeak', maxDm: 1e-17, profile: '', enabled: true, activators: [], inhibitors: [] },
				{ id: 'nav', type: 'Nav1p3', maxDm: 2e-14, profile: '', enabled: true, activators: [], inhibitors: [] },
				{ id: 'kv', type: 'Kv1p5', maxDm: 1e-15, profile: '', enabled: true, activators: [], inhibitors: [] }
			];
			e.profiles = [{ id: 'trigger', name: 'Trigger', color: '#d62728', cells: cellsNear(e, W - 55e-6, W, 16e-6) }];
			e.modifiers = [{ kind: 'perm', ion: 'Na', factor: 200, profile: 'trigger', t: 0.1, tEnd: 0.11, enabled: true }];
			return e;
		}
	},
	{
		id: 'morphogen',
		name: 'Morphogen gradient',
		blurb: 'A painted source region produces a diffusible substance that opens K⁺ channels. It spreads through gap junctions and prints a hyperpolarized voltage gradient onto the tissue.',
		make: () => {
			const e = structuredClone(baseExperiment);
			const W = e.generator.worldSize / 2;
			e.name = 'Morphogen gradient';
			e.endTime = 120;
			e.profiles = [{ id: 'source', name: 'Source', color: '#9467bd', cells: cellsNear(e, W - 45e-6, W, 16e-6) }];
			e.network = {
				substances: [{
					name: 'Morph', z: 0, Dm: 0, Do: 1e-10, Dgj: 1e-14, cCell: 0, cEnv: 0, updateIntra: false,
					growth: { rProd: 0.2, rDecay: 0.02, profile: 'source', activators: [], inhibitors: [] },
					gating: { ions: ['K'], HillK: 0.5, HillN: 2, peak: 2e-17, extracellular: false, activators: [], inhibitors: [] }
				}],
				reactions: [],
				modulators: [],
				affectCharge: true
			};
			return e;
		}
	},
	{
		id: 'genes',
		name: 'Gene network (BETSE grn_basic)',
		blurb: 'Three genes regulating each other: 1 represses itself via 3, 2 is activated by 1, 3 by 1 and 2. Genes are cell-local and do not touch the ions.',
		make: () => {
			const e = structuredClone(baseExperiment);
			e.name = 'Gene network';
			e.endTime = 60;
			const gene = (name: string, rProd: number, activators: { name: string; Km: number; n: number; zone: 'cell' }[], inhibitors: { name: string; Km: number; n: number; zone: 'cell' }[]) => ({
				name, z: 0, Dm: 0, Do: 1e-12, Dgj: 1e-16, cCell: 0, cEnv: 0, updateIntra: true, gjImpermeable: true,
				growth: { rProd, rDecay: 1, profile: '', activators, inhibitors }
			});
			e.network = {
				substances: [
					gene('Gene 1', 2, [], [{ name: 'Gene 3', Km: 0.01, n: 1, zone: 'cell' }]),
					gene('Gene 2', 2, [{ name: 'Gene 1', Km: 1, n: 1, zone: 'cell' }], []),
					gene('Gene 3', 15, [{ name: 'Gene 1', Km: 1, n: 1, zone: 'cell' }, { name: 'Gene 2', Km: 1, n: 1, zone: 'cell' }], [])
				],
				reactions: [],
				modulators: [],
				affectCharge: true
			};
			return e;
		}
	},
	{
		id: 'field',
		name: 'Applied field',
		blurb: 'Extracellular spaces on: the environment is a grid with its own voltage. From 1 to 3 s a 1 mV voltage is applied between the top and bottom edges (BETSE\'s external-voltage demo); watch the environment voltage and the cells\' Vm respond.',
		make: () => {
			const e = structuredClone(baseExperiment);
			e.name = 'Applied field';
			e.endTime = 5;
			e.ecm = { ...defaultEcm, tjRel: {} };
			e.modifiers = [{ kind: 'voltage', peak: 1e-3, pos: 'T', neg: 'B', rate: 0.25, profile: '', t: 1, tEnd: 3, enabled: true }];
			return e;
		}
	},
	{
		id: 'wound',
		name: 'Wound',
		blurb: 'A wedge of cells is cut away at t = 10 s; the new boundary cells lose their neighbours\' coupling.',
		make: () => {
			const e = structuredClone(baseExperiment);
			const W = e.generator.worldSize / 2;
			e.name = 'Wound';
			e.profiles = [{ id: 'wound', name: 'Wound site', color: '#d62728', cells: cellsNear(e, W + 40e-6, W, 22e-6) }];
			e.modifiers = [{ kind: 'cut', profile: 'wound', t: 10, tEnd: null, enabled: true }];
			return e;
		}
	}
];

/** What a fresh page opens with. */
export const defaultPreset = presets.find((p) => p.id === 'excitable')!;
