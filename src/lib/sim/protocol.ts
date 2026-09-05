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

/** Trace samples accumulated since the previous snapshot: per sample, per probe, (vmAve, cc[0..nIons)). */
export interface TraceChunk {
	probes: number[];
	t: Float64Array;
	values: Float32Array;
	/** bath concentration per sample per ion (nSamples x nIons) */
	bath: Float32Array;
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
	/** open fraction per membrane for each active channel */
	channels: { id: string; type: string; P: Float32Array }[];
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
	| { type: 'speed'; stepsPerTick: number };

export type FromWorker =
	| { type: 'geom'; geom: MeshGeom; reason: 'load' | 'cut'; cellMap?: Int32Array }
	| { type: 'snapshot'; snapshot: Snapshot }
	| { type: 'error'; message: string };
