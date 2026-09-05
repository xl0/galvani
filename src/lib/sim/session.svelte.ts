import { getContext, setContext } from 'svelte';
import { defaultExperiment, needsReload, type Experiment } from '$lib/core/experiment';
import { decodeExperiment, encodeExperiment } from '$lib/persist';
import type { FromWorker, MeshGeom, Snapshot, ToWorker } from './protocol';

export interface Trace {
	t: number[];
	/** cell-average Vm [V] */
	vm: number[];
	/** per ion, [mol/m3] */
	cc: number[][];
}

/** Owns the simulation worker and mirrors its state for the UI. */
export class SimSession {
	experiment = $state<Experiment>(structuredClone(defaultExperiment));
	geom = $state.raw<MeshGeom | null>(null);
	snap = $state.raw<Snapshot | null>(null);
	running = $state(false);
	stepsPerSec = $state(0);
	error = $state<string | null>(null);
	probes = $state<number[]>([]);
	/** bumped whenever traces get new samples (traces themselves are plain arrays) */
	traceVersion = $state(0);
	traces = new Map<number, Trace>();
	stepsPerTick = $state(25);

	private worker: Worker | null = null;
	private hashTimer: ReturnType<typeof setTimeout> | null = null;

	/** Call once from onMount (needs window). */
	async start(): Promise<void> {
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
			case 'geom':
				this.geom = msg.geom;
				if (msg.reason === 'cut' && msg.cellMap) this.remapAfterCut(msg.cellMap);
				break;
			case 'snapshot':
				this.snap = msg.snapshot;
				this.running = msg.snapshot.running;
				this.stepsPerSec = msg.snapshot.stepsPerSec;
				this.appendTrace(msg.snapshot);
				break;
			case 'error':
				this.error = msg.message;
				this.running = false;
				break;
		}
	}

	private appendTrace(s: Snapshot): void {
		const { probes, t, values } = s.trace;
		if (t.length === 0) return;
		const nIons = this.experiment.ions.length;
		const stride = 1 + nIons;
		probes.forEach((c, k) => {
			let tr = this.traces.get(c);
			if (!tr) {
				tr = { t: [], vm: [], cc: Array.from({ length: nIons }, () => []) };
				this.traces.set(c, tr);
			}
			for (let j = 0; j < t.length; j++) {
				const base = (j * probes.length + k) * stride;
				tr.t.push(t[j]);
				tr.vm.push(values[base]);
				for (let i = 0; i < nIons; i++) tr.cc[i].push(values[base + 1 + i]);
			}
		});
		this.traceVersion++;
	}

	private remapAfterCut(cellMap: Int32Array): void {
		this.probes = this.probes.map((c) => cellMap[c]).filter((c) => c >= 0);
		const traces = new Map<number, Trace>();
		for (const [c, tr] of this.traces) if (cellMap[c] >= 0) traces.set(cellMap[c], tr);
		this.traces = traces;
		this.experiment.profiles = this.experiment.profiles.map((p) => ({
			...p,
			cells: p.cells.map((c) => cellMap[c]).filter((c) => c >= 0)
		}));
		this.scheduleHash();
	}

	/** Apply an edited experiment: live update, or rebuild if geometry / initial state changed. */
	setExperiment(next: Experiment): void {
		const reload = needsReload($state.snapshot(this.experiment), next);
		this.experiment = next;
		if (reload) this.reset();
		else this.post({ type: 'update', experiment: $state.snapshot(next) });
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
		if (this.snap && this.snap.t >= this.experiment.endTime) this.reset();
		this.post({ type: 'run' });
		this.running = true;
	}
	pause(): void { this.post({ type: 'pause' }); }
	step(n = 1): void { this.post({ type: 'step', n }); }
	reset(): void {
		this.traces = new Map();
		this.traceVersion++;
		this.error = null;
		this.post({ type: 'load', experiment: $state.snapshot(this.experiment) });
		this.post({ type: 'probes', cells: $state.snapshot(this.probes) });
	}
	setSpeed(stepsPerTick: number): void { this.stepsPerTick = stepsPerTick; this.post({ type: 'speed', stepsPerTick }); }

	toggleProbe(cell: number): void {
		if (this.probes.includes(cell)) {
			this.probes = this.probes.filter((c) => c !== cell);
			this.traces.delete(cell);
		} else {
			this.probes = [...this.probes, cell];
		}
		this.traceVersion++;
		this.post({ type: 'probes', cells: $state.snapshot(this.probes) });
	}

	cut(cells: number[]): void { this.post({ type: 'cut', cells }); }
}

const KEY = Symbol('galvani-session');
export const setSession = (s: SimSession) => setContext(KEY, s);
export const getSession = () => getContext<SimSession>(KEY);
