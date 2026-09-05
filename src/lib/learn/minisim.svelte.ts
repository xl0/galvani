/**
 * Main-thread simulation for lessons: a handful of cells, real solver, runs in
 * requestAnimationFrame. Exposes reactive time, Vm, concentrations and traces.
 */
import { createChannel, type ChannelInstance } from '$lib/core/channels';
import { basicIons, basicParams } from '$lib/core/defaults';
import type { Mesh } from '$lib/core/mesh';
import type { Ion, Params } from '$lib/core/params';
import { createState, updateV, type SimState } from '$lib/core/state';
import { step, UnstableError } from '$lib/core/step';

export interface MiniSimOptions {
	mesh: Mesh;
	ions?: Ion[];
	params?: Partial<Params>;
	initialVm?: number;
	channels?: { type: string; maxDm: number }[];
	/** simulated seconds advanced per real second */
	speed?: number;
	/** keep this many trace samples (oldest dropped) */
	traceLen?: number;
	/** sample the trace every k steps */
	traceEvery?: number;
}

export class MiniSim {
	mesh: Mesh;
	ions: Ion[];
	params: Params;
	state: SimState;
	channels: ChannelInstance[] = [];
	running = $state(false);
	t = $state(0);
	/** cell-average Vm [mV] per cell, refreshed each frame */
	vm = $state.raw<Float64Array>(new Float64Array(0));
	/** concentrations per ion per cell [mM] */
	cc = $state.raw<Float64Array[]>([]);
	ccEnv = $state.raw<Float64Array>(new Float64Array(0));
	/** open fraction per channel (cell 0) */
	open = $state.raw<number[]>([]);
	trace = { t: [] as number[], vm: [] as number[][], cc: [] as number[][][], open: [] as number[][] };
	traceVersion = $state(0);
	error = $state<string | null>(null);
	private opts: MiniSimOptions;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private lastFrame = 0;
	private acc = 0;
	private sinceSample = 0;
	/** per-membrane permeability multiplier hook (lessons use it for stimulation) */
	perm: { ion: number; factor: number; until: number } | null = null;

	constructor(opts: MiniSimOptions) {
		this.opts = opts;
		this.mesh = opts.mesh;
		this.ions = structuredClone(opts.ions ?? basicIons);
		this.params = { ...basicParams, ...opts.params };
		this.state = createState(this.mesh, this.ions, opts.initialVm ?? 0, this.params.cm);
		updateV(this.mesh, this.ions, this.params, this.state);
		this.channels = (opts.channels ?? []).map((c, k) => createChannel(`c${k}`, c.type, c.maxDm, this.ions, this.state.vm));
		this.publish();
	}

	reset(): void {
		this.pause();
		this.state = createState(this.mesh, this.ions, this.opts.initialVm ?? 0, this.params.cm);
		updateV(this.mesh, this.ions, this.params, this.state);
		this.channels = (this.opts.channels ?? []).map((c, k) => createChannel(`c${k}`, c.type, c.maxDm, this.ions, this.state.vm));
		this.trace = { t: [], vm: [], cc: [], open: [] };
		this.error = null;
		this.perm = null;
		this.publish();
	}

	/** apply a membrane permeability (per ion, uniform) live */
	setDm(ionName: string, Dm: number): void {
		const i = this.ions.findIndex((x) => x.name === ionName);
		if (i < 0) return;
		this.ions[i].Dm = Dm;
		this.state.Dm[i].fill(Dm);
	}
	setChannelMax(k: number, maxDm: number): void { if (this.channels[k]) this.channels[k].maxDm = maxDm; }

	/** multiply an ion's permeability on the given cells for `dur` seconds */
	stimulate(ionName: string, factor: number, dur: number, cells?: number[]): void {
		const i = this.ions.findIndex((x) => x.name === ionName);
		if (i < 0) return;
		const base = this.ions[i].Dm;
		const set = cells ? new Set(cells) : null;
		for (let m = 0; m < this.mesh.nMems; m++) if (!set || set.has(this.mesh.memToCell[m])) this.state.Dm[i][m] = base * factor;
		this.perm = { ion: i, factor, until: this.state.t + dur };
		if (!this.running) this.run();
	}

	private stepOnce(): boolean {
		if (this.perm && this.state.t >= this.perm.until) {
			this.state.Dm[this.perm.ion].fill(this.ions[this.perm.ion].Dm);
			this.perm = null;
		}
		try {
			step(this.mesh, this.ions, this.params, this.state, this.channels);
		} catch (e) {
			this.error = e instanceof UnstableError ? e.message : String(e);
			this.pause();
			return false;
		}
		if (++this.sinceSample >= (this.opts.traceEvery ?? 1)) {
			this.sinceSample = 0;
			const tr = this.trace, n = this.mesh.nCells;
			tr.t.push(this.state.t);
			tr.vm.push(Array.from(this.state.vmAve, (v) => v * 1e3));
			tr.cc.push(this.state.ccCells.map((a) => Array.from(a)));
			tr.open.push(this.channels.map((c) => c.P[0]));
			const max = this.opts.traceLen ?? 4000;
			if (tr.t.length > max) { tr.t.shift(); tr.vm.shift(); tr.cc.shift(); tr.open.shift(); }
			void n;
		}
		return true;
	}

	step(n = 1): void { for (let i = 0; i < n; i++) if (!this.stepOnce()) break; this.publish(); }

	private frame = () => {
		if (!this.running) return;
		const now = performance.now();
		const dtWall = Math.min(0.1, (now - this.lastFrame) / 1000);
		this.lastFrame = now;
		this.acc += dtWall * (this.opts.speed ?? 1);
		const t0 = performance.now();
		while (this.acc >= this.params.dt && performance.now() - t0 < 12) {
			if (!this.stepOnce()) break;
			this.acc -= this.params.dt;
		}
		if (this.acc > 1) this.acc = 0; // can't keep up: drop backlog rather than spiral
		this.publish();
		this.timer = setTimeout(this.frame, 16);
	};

	run(): void {
		if (this.running) return;
		this.running = true;
		this.lastFrame = performance.now();
		this.acc = 0;
		this.timer = setTimeout(this.frame, 16);
	}
	pause(): void { this.running = false; if (this.timer) clearTimeout(this.timer); this.timer = null; }
	destroy(): void { this.pause(); }

	private publish(): void {
		this.t = this.state.t;
		this.vm = Float64Array.from(this.state.vmAve, (v) => v * 1e3);
		this.cc = this.state.ccCells.map((a) => Float64Array.from(a));
		this.ccEnv = Float64Array.from(this.state.ccEnv);
		this.open = this.channels.map((c) => c.P[0]);
		this.traceVersion++;
	}
}
