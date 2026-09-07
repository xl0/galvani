import { getContext, setContext } from 'svelte';
import { needsReload, type Experiment } from '$lib/core/experiment';
import { defaultPreset } from '$lib/presets';
import { decodeExperiment, encodeExperiment } from '$lib/persist';
import type { FromWorker, MeshGeom, Snapshot, ToWorker } from './protocol';
import dbg from 'debug';
import { fieldValues } from '$lib/viz/fields';

const debug = dbg('galvani:session');

/** Per-probe series aligned to SimSession.traceT; null before the probe existed. */
export function snapshotBytes(s: Snapshot): number {
	let b = s.vmAve.byteLength + s.vm.byteLength + s.cc.byteLength + s.ccEnv.byteLength + s.gjOpen.byteLength + s.pump.byteLength + s.iMem.byteLength + (s.env ? s.env.cc.byteLength + s.env.v.byteLength : 0);
	for (const c of s.channels) b += c.P.byteLength;
	for (const x of s.subs) b += x.cells.byteLength;
	return b;
}

export interface Trace {
	/** cell-average Vm [V] */
	vm: (number | null)[];
	/** per ion, [mol/m3] */
	cc: (number | null)[][];
	/** extra quantities in `extraNames` order (substances [mM], gj/pump/imem cell means, channel P, V env [mV]) */
	extra: (number | null)[][];
}

export const PROBE_PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#9a6324', '#469990', '#bfef45'];

/** Owns the simulation worker and mirrors its state for the UI. */
export class SimSession {
	experiment = $state<Experiment>(defaultPreset.make());
	geom = $state.raw<MeshGeom | null>(null);
	/** latest snapshot from the worker */
	snap = $state.raw<Snapshot | null>(null);
	/** recorded snapshots since the last reset, for scrubbing back in time */
	history: Snapshot[] = [];
	historyLen = $state(0);
	/** index into history being displayed, or null for live */
	playhead = $state<number | null>(null);
	/** the snapshot the views should draw */
	get view(): Snapshot | null {
		return this.playhead === null ? this.snap : (this.history[this.playhead] ?? this.snap);
	}
	running = $state(false);
	stepsPerSec = $state(0);
	error = $state<string | null>(null);
	probes = $state<number[]>([]);
	/** bumped whenever traces get new samples (traces themselves are plain arrays) */
	traceVersion = $state(0);
	/** shared time base of all traces [s] */
	traceT: number[] = [];
	/** bath concentration per ion, aligned to traceT */
	traceBath: number[][] = [];
	/** ids of the extra traced quantities (see TraceChunk.extras) */
	extraNames = $state<string[]>([]);
	traces = new Map<number, Trace>();
	/** colour per probed cell; stable while the probe exists */
	probeColors = $state<Record<number, string>>({});
	/** the bath can be probed too (click outside the cluster with the probe tool) */
	bathProbe = $state(false);
	bathColor = $state('');
	/** simulated seconds per real second, or 'max' */
	speed = $state<number | 'max'>('max');

	/** history is capped by `experiment.historyMB`; the worker picks the cadence so a run fits, this only guards overruns */
	private historyBytes = 0;
	private worker: Worker | null = null;
	private hashTimer: ReturnType<typeof setTimeout> | null = null;

	/** Call once from onMount (needs window). */
	async start(): Promise<void> {
		if (this.worker) return;
		if (location.hash.length > 1) {
			try {
				this.experiment = await decodeExperiment(location.hash.slice(1));
			} catch (e) {
				console.warn('galvani: ignoring invalid URL hash', e);
			}
		}
		this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
		this.worker.onmessage = (ev: MessageEvent<FromWorker>) => this.onMessage(ev.data);
		this.post({ type: 'load', experiment: $state.snapshot(this.experiment) });
		this.applyProbes(this.experiment);
	}

	/** adopt the probes stored in an experiment (link, preset, file) */
	private applyProbes(exp: Experiment): void {
		this.probes = []; this.probeColors = {}; this.traces.clear();
		for (const c of exp.probes) { this.probes = [...this.probes, c]; this.probeColors = { ...this.probeColors, [c]: this.freeColor() }; this.backfill(c); }
		this.bathProbe = exp.bathProbe;
		this.bathColor = exp.bathProbe ? this.freeColor() : '';
		this.traceVersion++;
		this.post({ type: 'probes', cells: $state.snapshot(this.probes) });
	}

	/** mirror the probe state into the experiment (URL hash, saved files) */
	private syncProbes(): void {
		this.experiment.probes = $state.snapshot(this.probes);
		this.experiment.bathProbe = this.bathProbe;
		this.scheduleHash();
	}

	stop(): void {
		this.worker?.terminate();
		this.worker = null;
	}

	private post(msg: ToWorker): void {
		this.worker?.postMessage(msg);
	}

	private onMessage(msg: FromWorker): void {
		switch (msg.type) {
			case 'geom': {
				const prev = this.geom;
				this.geom = msg.geom;
				if (msg.reason === 'cut' && msg.cellMap) this.remapAfterCut(msg.cellMap);
				else if (msg.reason === 'load' && prev && prev !== msg.geom) this.remapByPosition(prev, msg.geom);
				break;
			}
			case 'snapshot':
				for (const s of [...msg.frames, msg.snapshot]) {
					if (s.record && (this.history.length === 0 || s.step !== this.history[this.history.length - 1].step)) {
						this.history.push(s);
						this.historyBytes += snapshotBytes(s);
					}
					this.appendTrace(s);
				}
				while (this.historyBytes > this.experiment.historyMB * 2 ** 20 && this.history.length > 1) { this.historyBytes -= snapshotBytes(this.history.shift()!); debug('history full (%d frames, %d MB): dropped t=%s', this.history.length, (this.historyBytes / 2 ** 20).toFixed(0), this.history[0].t); }
				this.historyLen = this.history.length;
				this.snap = msg.snapshot;
				this.running = msg.snapshot.running;
				this.stepsPerSec = msg.snapshot.stepsPerSec;
				break;
			case 'initDone':
				this.clearRecords();
				break;
			case 'error':
				this.error = msg.message;
				this.running = false;
				break;
		}
	}

	private appendTrace(s: Snapshot): void {
		const { probes, t, values, bath, extras } = s.trace;
		if (t.length === 0) return;
		const nIons = this.experiment.ions.length;
		const nSubs = extras.length;
		if (extras.join() !== this.extraNames.join()) { const old = this.extraNames; this.extraNames = extras; for (const tr of this.traces.values()) tr.extra = extras.map((id) => tr.extra[old.indexOf(id)] ?? new Array(tr.vm.length).fill(null)); }
		const stride = 1 + nIons + nSubs;
		const n0 = this.traceT.length;
		for (let j = 0; j < t.length; j++) this.traceT.push(t[j]);
		while (this.traceBath.length < nIons) this.traceBath.push(new Array(n0).fill(null));
		for (let i = 0; i < nIons; i++) for (let j = 0; j < t.length; j++) this.traceBath[i].push(bath[j * nIons + i]);
		// probes not in this chunk (just removed / not yet known to the worker) get gaps
		for (const [c, tr] of this.traces) {
			if (probes.includes(c)) continue;
			for (let j = 0; j < t.length; j++) { tr.vm.push(null); for (let i = 0; i < nIons; i++) tr.cc[i].push(null); for (let k = 0; k < nSubs; k++) tr.extra[k].push(null); }
		}
		probes.forEach((c, k) => {
			let tr = this.traces.get(c);
			if (!tr) {
				tr = { vm: new Array(n0).fill(null), cc: Array.from({ length: nIons }, () => new Array(n0).fill(null)), extra: Array.from({ length: nSubs }, () => new Array(n0).fill(null)) };
				this.traces.set(c, tr);
			}
			for (let j = 0; j < t.length; j++) {
				const base = (j * probes.length + k) * stride;
				tr.vm.push(values[base]);
				for (let i = 0; i < nIons; i++) tr.cc[i].push(values[base + 1 + i]);
				for (let k = 0; k < nSubs; k++) tr.extra[k].push(values[base + 1 + nIons + k]);
			}
		});
		this.traceVersion++;
	}

	/** After a rebuild (new seed / shape), move painted regions and probes to the nearest new cells. */
	private remapByPosition(prev: MeshGeom, next: MeshGeom): void {
		const r = this.experiment.generator.cellRadius;
		const nearest = (c: number): number => {
			const x = prev.cellCentres[2 * c], y = prev.cellCentres[2 * c + 1];
			let best = -1, bd = r * r;
			for (let k = 0; k < next.nCells; k++) {
				const d = (next.cellCentres[2 * k] - x) ** 2 + (next.cellCentres[2 * k + 1] - y) ** 2;
				if (d < bd) { bd = d; best = k; }
			}
			return best;
		};
		const map = (cells: number[]) => [...new Set(cells.filter((c) => c < prev.nCells).map(nearest).filter((c) => c >= 0))];
		const profiles = this.experiment.profiles.map((p) => ({ ...p, cells: map(p.cells) }));
		if (JSON.stringify(profiles) !== JSON.stringify($state.snapshot(this.experiment.profiles))) {
			this.experiment.profiles = profiles;
			this.post({ type: 'update', experiment: $state.snapshot(this.experiment) });
			this.scheduleHash();
		}
		const probes = map(this.probes);
		if (probes.length !== this.probes.length || probes.some((c, i) => c !== this.probes[i])) {
			const colors: Record<number, string> = {};
			this.probes.forEach((c) => { const n = nearest(c); if (n >= 0) colors[n] = this.probeColors[c]; });
			this.probes = probes;
			this.probeColors = colors;
			this.post({ type: 'probes', cells: probes });
			this.syncProbes();
		}
	}

	private remapAfterCut(cellMap: Int32Array): void {
		this.probes = this.probes.map((c) => cellMap[c]).filter((c) => c >= 0);
		const traces = new Map<number, Trace>();
		const colors: Record<number, string> = {};
		for (const [c, tr] of this.traces) if (cellMap[c] >= 0) traces.set(cellMap[c], tr);
		for (const [c, col] of Object.entries(this.probeColors)) if (cellMap[+c] >= 0) colors[cellMap[+c]] = col;
		this.traces = traces;
		this.probeColors = colors;
		this.experiment.profiles = this.experiment.profiles.map((p) => ({
			...p,
			cells: p.cells.map((c) => cellMap[c]).filter((c) => c >= 0)
		}));
		this.syncProbes();
	}

	/** Apply an edited experiment: live update, or rebuild if geometry / initial state changed. */
	setExperiment(next: Experiment): void {
		const reload = needsReload($state.snapshot(this.experiment), next);
		const probesChanged = next.probes.join() !== this.probes.join() || next.bathProbe !== this.bathProbe;
		this.experiment = next;
		if (reload) this.reset();
		else this.post({ type: 'update', experiment: $state.snapshot(next) });
		if (probesChanged) this.applyProbes(next);
		this.scheduleHash();
	}

	/** Convenience for in-place edits: mutate a copy, then apply. */
	edit(fn: (e: Experiment) => void): void {
		const next = $state.snapshot(this.experiment) as Experiment;
		fn(next);
		this.setExperiment(next);
	}

	private scheduleHash(): void {
		if (this.hashTimer) clearTimeout(this.hashTimer);
		this.hashTimer = setTimeout(async () => {
			const h = await encodeExperiment($state.snapshot(this.experiment));
			history.replaceState(null, '', '#' + h);
		}, 300);
	}

	run(): void {
		this.error = null;
		this.playhead = null;
		if (this.snap && this.snap.t >= this.experiment.endTime) this.reset();
		this.post({ type: 'run' });
		this.running = true;
	}
	pause(): void { this.post({ type: 'pause' }); }
	step(n = 1): void { this.post({ type: 'step', n }); }
	/** Show a recorded frame while the run continues; null returns to live. */
	seek(index: number | null): void {
		this.playhead = index === null ? null : Math.max(0, Math.min(this.history.length - 1, index));
	}

	/** Drop recorded frames and traces (reset, or the initialisation phase handing over to the run). */
	private clearRecords(): void {
		this.history = [];
		this.historyBytes = 0;
		this.historyLen = 0;
		this.playhead = null;
		this.traces = new Map();
		this.traceT = [];
		this.traceBath = [];
		this.traceVersion++;
	}

	reset(): void {
		this.clearRecords();
		this.error = null;
		this.post({ type: 'load', experiment: $state.snapshot(this.experiment) });
		this.post({ type: 'probes', cells: $state.snapshot(this.probes) });
	}
	setSpeed(factor: number | 'max'): void { this.speed = factor; this.post({ type: 'speed', factor }); }

	/** Scrub to the recorded frame nearest to simulated time t. */
	seekTime(t: number): void {
		const h = this.history;
		if (h.length === 0) return;
		let lo = 0, hi = h.length - 1;
		while (lo < hi) { const mid = (lo + hi) >> 1; if (h[mid].t < t) lo = mid + 1; else hi = mid; }
		if (lo > 0 && Math.abs(h[lo - 1].t - t) < Math.abs(h[lo].t - t)) lo--;
		this.seek(lo);
	}

	private freeColor(): string {
		const used = new Set([...Object.values(this.probeColors), this.bathColor]);
		return PROBE_PALETTE.find((c) => !used.has(c)) ?? PROBE_PALETTE[(this.probes.length + 1) % PROBE_PALETTE.length];
	}

	toggleProbe(cell: number): void {
		if (this.probes.includes(cell)) {
			this.probes = this.probes.filter((c) => c !== cell);
			this.traces.delete(cell);
			const { [cell]: _gone, ...rest } = this.probeColors;
			this.probeColors = rest;
		} else {
			this.probes = [...this.probes, cell];
			this.probeColors = { ...this.probeColors, [cell]: this.freeColor() };
			this.backfill(cell);
		}
		this.traceVersion++;
		this.post({ type: 'probes', cells: $state.snapshot(this.probes) });
		this.syncProbes();
	}

	/** Fill a new probe's trace for times already simulated from the playback history
	 *  (frame resolution, linearly interpolated between frames; the live trace then continues per step). */
	private backfill(cell: number): void {
		const n = this.traceT.length, h = this.history;
		if (n === 0 || h.length === 0) return;
		const nIons = this.experiment.ions.length, extras = this.extraNames, geom = this.geom!;
		const tr: Trace = { vm: new Array(n).fill(null), cc: Array.from({ length: nIons }, () => new Array(n).fill(null)), extra: Array.from({ length: extras.length }, () => new Array(n).fill(null)) };
		// per-cell values of the extra quantities, computed once per frame
		const cache = new Map<Snapshot, (Float32Array | null)[]>();
		const extraAt = (s: Snapshot) => { let v = cache.get(s); if (!v) { v = extras.map((id) => fieldValues(s, geom, this.experiment.ions, id, false)); cache.set(s, v); } return v; };
		let f = 0;
		for (let j = 0; j < n; j++) {
			const t = this.traceT[j];
			while (f + 1 < h.length && h[f + 1].t <= t) f++;
			const a = h[f], b = h[f + 1];
			// frames from before a cut have a different cell count; skip them
			if (t < a.t || (!b && t > a.t) || cell >= a.vmAve.length || (b && b.vmAve.length !== a.vmAve.length)) continue;
			const nCells = a.vmAve.length;
			const w = b && b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
			const lerp = (x: number, y: number) => x + (y - x) * w;
			tr.vm[j] = lerp(a.vmAve[cell], b ? b.vmAve[cell] : a.vmAve[cell]);
			for (let i = 0; i < nIons; i++) tr.cc[i][j] = lerp(a.cc[i * nCells + cell], (b ?? a).cc[i * nCells + cell]);
			const ea = extraAt(a), eb = b ? extraAt(b) : ea;
			for (let k = 0; k < extras.length; k++) { const x = ea[k]?.[cell], y = eb[k]?.[cell]; tr.extra[k][j] = x === undefined || y === undefined ? null : lerp(x, y); }
		}
		this.traces.set(cell, tr);
	}

	toggleBathProbe(): void {
		this.bathProbe = !this.bathProbe;
		this.bathColor = this.bathProbe ? this.freeColor() : '';
		this.traceVersion++;
		this.syncProbes();
	}

	cut(cells: number[]): void { this.post({ type: 'cut', cells }); }
}

const KEY = Symbol('galvani-session');
export const setSession = (s: SimSession) => setContext(KEY, s);
export const getSession = () => getContext<SimSession>(KEY);
