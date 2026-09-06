/// <reference lib="webworker" />
import { createChannel, type ChannelInstance } from '$lib/core/channels';
import { cutCells } from '$lib/core/cut';
import { applyModulation, type Experiment, hasTimedModifiers } from '$lib/core/experiment';
import { generateMesh } from '$lib/core/generator';
import { Network } from '$lib/core/network';
import type { Mesh } from '$lib/core/mesh';
import { createState, updateV, type SimState } from '$lib/core/state';
import { step, UnstableError } from '$lib/core/step';
import type { FromWorker, MeshGeom, ToWorker } from './protocol';

let exp: Experiment;
let mesh: Mesh;
let state: SimState;
let running = false;
let speed: number | 'max' = 'max';
/** wall-clock / sim-time anchor for pacing at a fixed speed factor */
let anchor = { wall: 0, t: 0 };
let probes: number[] = [];
const firedCuts = new Set<number>();
let hasTimedMods = false;
let channels: ChannelInstance[] = [];
let network: Network | null = null;

// trace accumulation between snapshots
let traceT: number[] = [];
let traceV: number[] = [];
let traceB: number[] = [];
let lastSnapshot = 0;
let lastSnapT = -Infinity;
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
	const trace = { probes: probes.slice(), t: Float64Array.from(traceT), values: Float32Array.from(traceV), bath: Float32Array.from(traceB), subNames: network ? network.subs.map((x) => x.cfg.name) : [] };
	traceT = []; traceV = []; traceB = [];
	const snap = {
		t: state.t, step: state.step, running, stepsPerSec,
		vmAve: Float32Array.from(state.vmAve), vm: Float32Array.from(state.vm), cc,
		ccEnv: Float32Array.from(state.ccEnv), gjOpen: Float32Array.from(state.gjOpen),
		channels: channels.map((ch) => ({ id: ch.id, type: ch.type, P: Float32Array.from(ch.P) })),
		subs: network ? network.subs.map((x) => ({ name: x.cfg.name, cells: Float32Array.from(x.cCells), env: x.cEnv })) : [], trace
	};
	post({ type: 'snapshot', snapshot: snap }, [snap.vmAve.buffer, snap.vm.buffer, cc.buffer, snap.ccEnv.buffer, snap.gjOpen.buffer, trace.t.buffer, trace.values.buffer, trace.bath.buffer, ...snap.channels.map((c) => c.P.buffer)]);
	lastSnapshot = performance.now();
	lastSnapT = state.t;
}

function load(e: Experiment): void {
	exp = e;
	mesh = generateMesh(e.generator);
	state = createState(mesh, e.ions, e.initialVm, e.params.cm);
	firedCuts.clear();
	hasTimedMods = hasTimedModifiers(e);
	applyModulation(mesh, exp, state, 0);
	buildNetwork(null);
	updateV(mesh, e.ions, e.params, state);
	channels = [];
	syncChannels();
	probes = probes.filter((c) => c < mesh.nCells);
	traceT = []; traceV = []; traceB = [];
	running = false;
	geom('load');
	snapshot();
}

/** Reconcile channel instances with the experiment: keep gates of existing ids, init new ones at current vm. */
function syncChannels(): void {
	const cellProfile = new Int32Array(mesh.nCells).fill(-1);
	exp.profiles.forEach((p, pi) => { for (const c of p.cells) if (c < mesh.nCells) cellProfile[c] = pi; });
	const next: ChannelInstance[] = [];
	for (const cfg of exp.channels) {
		if (!cfg.enabled) continue;
		let ch = channels.find((x) => x.id === cfg.id && x.type === cfg.type);
		if (!ch) {
			try { ch = createChannel(cfg.id, cfg.type, cfg.maxDm, exp.ions, state.vm); }
			catch (err) { post({ type: 'error', message: String(err) }); continue; }
		}
		ch.maxDm = cfg.maxDm;
		network?.setChannelRegulators(ch.id, cfg.activators, cfg.inhibitors);
		const prof = cfg.profile === '' ? null : exp.profiles.findIndex((p) => p.id === cfg.profile);
		for (let m = 0; m < mesh.nMems; m++) ch.mask[m] = prof === null || cellProfile[mesh.memToCell[m]] === prof ? 1 : 0;
		next.push(ch);
	}
	channels = next;
}

/** (Re)build the network. Substance pools are kept by name when `keep` is given (live edits, cuts). */
function buildNetwork(keep: Network | null, cellMap?: Int32Array): void {
	if (!exp.network || exp.network.substances.length === 0) { network = null; state.nakMod.fill(1); state.gjMod.fill(1); state.extraRho.fill(0); return; }
	const profileCells = (id: string) => exp.profiles.find((p) => p.id === id)?.cells ?? null;
	try {
		const net = new Network(exp.network, mesh, exp.ions, exp.params, state, profileCells);
		if (keep) {
			for (const sub of net.subs) {
				const old = keep.subs.find((x) => x.cfg.name === sub.cfg.name);
				if (!old) continue;
				const cells = new Float64Array(mesh.nCells).fill(sub.cfg.cCell);
				if (cellMap) { for (let c = 0; c < cellMap.length; c++) if (cellMap[c] >= 0) cells[cellMap[c]] = old.cCells[c]; }
				else cells.set(old.cCells);
				const mem = new Float64Array(mesh.nMems);
				for (let m = 0; m < mesh.nMems; m++) mem[m] = cells[mesh.memToCell[m]];
				net.setConcentrations(sub.cfg.name, cells, mem, old.cEnv);
			}
		} else net.balanceCharge();
		network = net;
	} catch (err) {
		network = null;
		post({ type: 'error', message: `network: ${err instanceof Error ? err.message : err}` });
	}
}

function update(e: Experiment): void {
	exp = e;
	hasTimedMods = hasTimedModifiers(e);
	applyModulation(mesh, exp, state, state.t);
	buildNetwork(network);
	syncChannels();
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
	// re-index channel gate arrays to the surviving membranes
	const pick = (src: Float64Array) => { const out = new Float64Array(mesh.nMems); for (let m = 0; m < r.memMap.length; m++) if (r.memMap[m] >= 0) out[r.memMap[m]] = src[m]; return out; };
	channels = channels.map((ch) => ({ ...ch, mask: pick(ch.mask), m: pick(ch.m), h: pick(ch.h), P: pick(ch.P), flux: new Float64Array(mesh.nMems) }));
	applyModulation(mesh, exp, state, state.t);
	buildNetwork(network, r.cellMap);
	syncChannels();
	geom('cut', r.cellMap);
}

function fireModifiers(): void {
	exp.modifiers.forEach((ev, i) => {
		if (ev.kind === 'cut' && ev.enabled && !firedCuts.has(i) && state.t >= ev.t) {
			firedCuts.add(i);
			const prof = exp.profiles.find((p) => p.id === ev.profile);
			if (prof) doCut(prof.cells);
		}
	});
	if (hasTimedMods) applyModulation(mesh, exp, state, state.t);
}

function sampleTrace(): void {
	traceT.push(state.t);
	for (let i = 0; i < exp.ions.length; i++) traceB.push(state.ccEnv[i]);
	for (const c of probes) {
		traceV.push(state.vmAve[c]);
		for (let i = 0; i < exp.ions.length; i++) traceV.push(state.ccCells[i][c]);
		if (network) for (const sub of network.subs) traceV.push(sub.cCells[c]);
	}
}

function doStep(): boolean {
	fireModifiers();
	try {
		step(mesh, exp.ions, exp.params, state, channels, network);
	} catch (err) {
		running = false;
		post({ type: 'error', message: err instanceof UnstableError ? `${err.message}. Reduce the time step.` : String(err) });
		return false;
	}
	sampleTrace();
	return true;
}

/** One scheduler tick: run steps for ~12 ms of wall time, or until the paced sim time is caught up. */
function tick(): void {
	if (!running) return;
	const t0 = performance.now();
	// record a frame at least every endTime/600 of simulated time so fast events are scrubbable
	const frameDt = Math.max(exp.params.dt, exp.endTime / 600);
	const allowedT = speed === 'max' ? Infinity : anchor.t + ((t0 - anchor.wall) / 1000) * speed;
	let n = 0;
	while (state.t < allowedT && performance.now() - t0 < 12) {
		if (!doStep()) break;
		n++;
		if (state.t >= exp.endTime) { running = false; break; }
		if (state.t - lastSnapT >= frameDt - 1e-12) snapshot();
	}
	const dtms = performance.now() - t0;
	stepsSince += n; stepsSinceTime += dtms;
	if (stepsSinceTime > 500) { stepsPerSec = (stepsSince * 1000) / stepsSinceTime; stepsSince = 0; stepsSinceTime = 0; }
	if (performance.now() - lastSnapshot > 33 || !running) snapshot();
	// when paced and ahead of schedule, sleep until the next step is due
	if (running) setTimeout(tick, n === 0 && speed !== 'max' ? Math.max(1, Math.min(50, ((state.t - allowedT) / speed) * 1000)) : 0);
}

self.onmessage = (ev: MessageEvent<ToWorker>) => {
	const msg = ev.data;
	switch (msg.type) {
		case 'load': load(msg.experiment); break;
		case 'update': update(msg.experiment); break;
		case 'run': if (!running) { running = true; stepsSince = 0; stepsSinceTime = 0; anchor = { wall: performance.now(), t: state.t }; tick(); } break;
		case 'pause': running = false; snapshot(); break;
		case 'step': running = false; for (let i = 0; i < msg.n; i++) if (!doStep()) break; snapshot(); break;
		case 'probes': probes = msg.cells.filter((c) => c < mesh.nCells); traceT = []; traceV = []; traceB = []; if (!running) snapshot(); break;
		case 'cut': doCut(msg.cells); snapshot(); break;
		case 'speed': speed = msg.factor; anchor = { wall: performance.now(), t: state.t }; break;
	}
};
