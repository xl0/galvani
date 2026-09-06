import type { Experiment } from '$lib/core/experiment';

/** Geometry the UI needs to draw and hit-test the cluster. */
export interface MeshGeom {
	nCells: number;
	nMems: number;
	verts: Float64Array;
	vertStart: Int32Array;
	cellCentres: Float64Array;
	memMids: Float64Array;
	memToCell: Int32Array;
	memPartner: Int32Array;
	/** world bounds [xmin, ymin, xmax, ymax] */
	bounds: [number, number, number, number];
}

/** Trace samples accumulated since the previous snapshot: per sample, per probe, (vmAve, cc[0..nIons), subs[0..nSubs)). */
export interface TraceChunk {
	probes: number[];
	t: Float64Array;
	values: Float32Array;
	/** bath concentration per sample per ion (nSamples x nIons) */
	bath: Float32Array;
	/** substance names in the order they appear in values */
	subNames: string[];
}

export interface Snapshot {
	t: number;
	step: number;
	running: boolean;
	stepsPerSec: number;
	vmAve: Float32Array;
	vm: Float32Array;
	/** nIons x nCells, ion-major */
	cc: Float32Array;
	ccEnv: Float32Array;
	gjOpen: Float32Array;
	/** Na/K pump rate per membrane [mol/m2 s] and net membrane current density into the cell [A/m2] */
	pump: Float32Array;
	iMem: Float32Array;
	/** extracellular grid (null = well-mixed bath): per-ion concentrations (ion-major, nx*ny each) and environment voltage */
	env: { nx: number; ny: number; xmin: number; ymin: number; delta: number; cc: Float32Array; v: Float32Array } | null;
	/** 'init' while the initialisation phase runs (clock restarts at 0 when it ends) */
	phase: 'init' | 'run';
	/** open fraction per membrane for each active channel */
	channels: { id: string; type: string; P: Float32Array }[];
	/** network substances: per-cell concentration [mM] and bath value */
	subs: { name: string; cells: Float32Array; env: number }[];
	trace: TraceChunk;
}

export type ToWorker =
	| { type: 'load'; experiment: Experiment }
	| { type: 'update'; experiment: Experiment }
	| { type: 'run' }
	| { type: 'pause' }
	| { type: 'step'; n: number }
	| { type: 'probes'; cells: number[] }
	| { type: 'cut'; cells: number[] }
	/** target simulated seconds per real second, or 'max' */
	| { type: 'speed'; factor: number | 'max' };

export type FromWorker =
	| { type: 'geom'; geom: MeshGeom; reason: 'load' | 'cut'; cellMap?: Int32Array }
	| { type: 'snapshot'; snapshot: Snapshot }
	| { type: 'initDone' }
	| { type: 'error'; message: string };
