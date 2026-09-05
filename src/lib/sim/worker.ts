/// <reference lib="webworker" />
import { cutCells } from '$lib/core/cut';
import { applyModulation, type Experiment } from '$lib/core/experiment';
import { generateMesh } from '$lib/core/generator';
import type { Mesh } from '$lib/core/mesh';
import { createState, updateV, type SimState } from '$lib/core/state';
import { step, UnstableError } from '$lib/core/step';
import type { FromWorker, MeshGeom, ToWorker } from './protocol';

let exp: Experiment;
let mesh: Mesh;
let state: SimState;
let running = false;
let stepsPerTick = 25;
let probes: number[] = [];
const firedCuts = new Set<number>();
let hasTimedEvents = false;

// trace accumulation between snapshots
let traceT: number[] = [];
let traceV: number[] = [];
let lastSnapshot = 0;
let stepsSince = 0;
let stepsSinceTime = 0;
let stepsPerSec = 0;

const post = (msg: FromWorker, transfer?: Transferable[]) => (self as unknown as Worker).postMessage(msg, transfer ?? []);

function geom(reason: 'load' | 'cut', cellMap?: Int32Array): void {
	let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
	for (let i = 0; i < mesh.verts.length; i += 2) {
		xmin = Math.min(xmin, mesh.verts[i]); xmax = Math.max(xmax, mesh.verts[i]);
		ymin = Math.min(ymin, mesh.verts[i + 1]); ymax = Math.max(ymax, mesh.verts[i + 1]);
	}
	const g: MeshGeom = {
		nCells: mesh.nCells, nMems: mesh.nMems,
		verts: mesh.verts.slice(), vertStart: mesh.vertStart.slice(), cellCentres: mesh.cellCentres.slice(),
		memMids: mesh.memMids.slice(), memToCell: mesh.memToCell.slice(), memPartner: mesh.memPartner.slice(),
		bounds: [xmin, ymin, xmax, ymax]
	};
	post({ type: 'geom', geom: g, reason, cellMap });
}

function snapshot(): void {
	const nIons = exp.ions.length;
	const cc = new Float32Array(nIons * mesh.nCells);
	for (let i = 0; i < nIons; i++) cc.set(state.ccCells[i], i * mesh.nCells);
	const trace = { probes: probes.slice(), t: Float64Array.from(traceT), values: Float32Array.from(traceV) };
	traceT = []; traceV = [];
	const snap = {
		t: state.t, step: state.step, running, stepsPerSec,
		vmAve: Float32Array.from(state.vmAve), vm: Float32Array.from(state.vm), cc,
		ccEnv: Float32Array.from(state.ccEnv), gjOpen: Float32Array.from(state.gjOpen), trace
	};
	post({ type: 'snapshot', snapshot: snap }, [snap.vmAve.buffer, snap.vm.buffer, cc.buffer, snap.ccEnv.buffer, snap.gjOpen.buffer, trace.t.buffer, trace.values.buffer]);
	lastSnapshot = performance.now();
}

function load(e: Experiment): void {
	exp = e;
	mesh = generateMesh(e.generator);
	state = createState(mesh, e.ions);
	firedCuts.clear();
	hasTimedEvents = e.events.some((ev) => ev.kind !== 'cut');
	applyModulation(mesh, exp, state, 0);
	updateV(mesh, e.ions, e.params, state);
	probes = probes.filter((c) => c < mesh.nCells);
	traceT = []; traceV = [];
	running = false;
	geom('load');
	snapshot();
}

function update(e: Experiment): void {
	exp = e;
	hasTimedEvents = e.events.some((ev) => ev.kind !== 'cut');
	applyModulation(mesh, exp, state, state.t);
	if (!running) snapshot();
}

function doCut(cells: Iterable<number>): void {
	const removed = new Set(cells);
	if (removed.size === 0) return;
	const r = cutCells(mesh, state, removed);
	mesh = r.mesh; state = r.state;
	// remap profiles and probes to the new indices
	exp = {
		...exp,
		profiles: exp.profiles.map((p) => ({ ...p, cells: p.cells.map((c) => r.cellMap[c]).filter((c) => c >= 0) }))
	};
	probes = probes.map((c) => r.cellMap[c]).filter((c) => c >= 0);
	applyModulation(mesh, exp, state, state.t);
	geom('cut', r.cellMap);
}

function fireEvents(): void {
	exp.events.forEach((ev, i) => {
		if (ev.kind === 'cut' && !firedCuts.has(i) && state.t >= ev.t) {
			firedCuts.add(i);
			const prof = exp.profiles.find((p) => p.id === ev.profile);
			if (prof) doCut(prof.cells);
		}
	});
	if (hasTimedEvents) applyModulation(mesh, exp, state, state.t);
}

function sampleTrace(): void {
	if (probes.length === 0) return;
	traceT.push(state.t);
	for (const c of probes) {
		traceV.push(state.vmAve[c]);
		for (let i = 0; i < exp.ions.length; i++) traceV.push(state.ccCells[i][c]);
	}
}

function doStep(): boolean {
	fireEvents();
	try {
		step(mesh, exp.ions, exp.params, state);
	} catch (err) {
		running = false;
		post({ type: 'error', message: err instanceof UnstableError ? err.message : String(err) });
		return false;
	}
	sampleTrace();
	return true;
}

function tick(): void {
	if (!running) return;
	const t0 = performance.now();
	for (let i = 0; i < stepsPerTick; i++) {
		if (!doStep()) break;
		if (state.t >= exp.endTime) { running = false; break; }
	}
	const dtms = performance.now() - t0;
	stepsSince += stepsPerTick; stepsSinceTime += dtms;
	if (stepsSinceTime > 500) { stepsPerSec = (stepsSince * 1000) / stepsSinceTime; stepsSince = 0; stepsSinceTime = 0; }
	if (performance.now() - lastSnapshot > 33 || !running) snapshot();
	if (running) setTimeout(tick, 0);
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
	const msg = ev.data;
	switch (msg.type) {
		case 'load': load(msg.experiment); break;
		case 'update': update(msg.experiment); break;
		case 'run': if (!running) { running = true; stepsSince = 0; stepsSinceTime = 0; tick(); } break;
		case 'pause': running = false; snapshot(); break;
		case 'step': running = false; for (let i = 0; i < msg.n; i++) if (!doStep()) break; snapshot(); break;
		case 'probes': probes = msg.cells.filter((c) => c < mesh.nCells); traceT = []; traceV = []; if (!running) snapshot(); break;
		case 'cut': doCut(msg.cells); snapshot(); break;
		case 'speed': stepsPerTick = Math.max(1, msg.stepsPerTick); break;
	}
};
