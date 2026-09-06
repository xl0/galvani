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
import { Network, type NetworkConfig } from '$lib/core/network';
import { buildEcm, createEcmState, setScreening, type EcmConfig } from '$lib/core/ecm';
import { defaultGenerator } from '$lib/core/generator';

export interface MiniSimOptions {
	mesh: Mesh;
	ions?: Ion[];
	params?: Partial<Params>;
	initialVm?: number;
	channels?: { type: string; maxDm: number }[];
	/** substance network and the named cell sets it may target */
	network?: NetworkConfig;
	profiles?: Record<string, number[]>;
	/** extracellular grid instead of the well-mixed bath */
	ecm?: EcmConfig;
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
	state!: SimState;
	channels: ChannelInstance[] = [];
	network: Network | null = null;
	running = $state(false);
	t = $state(0);
	/** cell-average Vm [mV] per cell, refreshed each frame */
	vm = $state.raw<Float64Array>(new Float64Array(0));
	/** concentrations per ion per cell [mM] */
	cc = $state.raw<Float64Array[]>([]);
	ccEnv = $state.raw<Float64Array>(new Float64Array(0));
	/** open fraction per channel (cell 0) */
	open = $state.raw<number[]>([]);
	/** network substance concentrations per cell [mM], in `subNames` order */
	subs = $state.raw<Float64Array[]>([]);
	subNames: string[] = [];
	/** extracellular grid: per-ion concentrations and voltage, or null */
	env = $state.raw<{ nx: number; ny: number; xmin: number; ymin: number; delta: number; cc: Float64Array[]; v: Float64Array } | null>(null);
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
		this.build();
		this.publish();
	}

	private build(): void {
		const opts = this.opts;
		this.state = createState(this.mesh, this.ions, opts.initialVm ?? 0, this.params.cm);
		if (opts.ecm) {
			let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
			for (let i = 0; i < this.mesh.verts.length; i += 2) { xmin = Math.min(xmin, this.mesh.verts[i]); xmax = Math.max(xmax, this.mesh.verts[i]); ymin = Math.min(ymin, this.mesh.verts[i + 1]); ymax = Math.max(ymax, this.mesh.verts[i + 1]); }
			const pad = 3 * defaultGenerator.cellRadius;
			const es = createEcmState(buildEcm(this.mesh, this.ions, opts.ecm, [xmin - pad, xmax + pad, ymin - pad, ymax + pad], defaultGenerator.cellHeight, defaultGenerator.cellRadius, this.params.T), this.ions);
			setScreening(es, this.ions);
			this.state.ecm = es;
		}
		this.network = opts.network ? new Network(opts.network, this.mesh, this.ions, this.params, this.state, (id) => opts.profiles?.[id] ?? null) : null;
		this.network?.balanceCharge();
		this.subNames = this.network ? this.network.subs.map((x) => x.cfg.name) : [];
		updateV(this.mesh, this.ions, this.params, this.state);
		this.channels = (opts.channels ?? []).map((c, k) => createChannel(`c${k}`, c.type, c.maxDm, this.ions, this.state.vm));
	}

	/** change construction options (ions, network, grid…) and start over */
	rebuild(patch: Partial<MiniSimOptions>): void { Object.assign(this.opts, patch); this.reset(); }

	reset(): void {
		this.pause();
		this.build();
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
			step(this.mesh, this.ions, this.params, this.state, this.channels, this.network);
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
		this.subs = this.network ? this.network.subs.map((x) => Float64Array.from(x.cCells)) : [];
		const e = this.state.ecm;
		this.env = e ? { nx: e.grid.nx, ny: e.grid.ny, xmin: e.grid.xmin, ymin: e.grid.ymin, delta: e.grid.delta, cc: e.cc.map((a) => Float64Array.from(a)), v: Float64Array.from(e.vEnv) } : null;
		this.traceVersion++;
	}
}
