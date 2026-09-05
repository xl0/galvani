/**
 * Substance / reaction / modulator network, ported from BETSE's
 * MasterOfNetworks (betse/science/chemistry/networks.py) for the ECM-off case.
 * BETSE compiles config into Python strings and eval()s them; here the same
 * expressions are closures. Order of operations mirrors run_loop() exactly.
 */
import type { Mesh } from './mesh';
import type { Ion, Params } from './params';
import { F, R } from './params';
import type { SimState } from './state';
import type { ChannelInstance } from './channels';
import { ghkFlux, NONCE, UnstableError } from './step';

/** Hill-type regulator: name of a substance or ion, half-max Km [mM], exponent n, which pool to read. */
export interface Influencer { name: string; Km: number; n: number; zone: 'cell' | 'env' }

export interface GrowthConfig {
	/** max production [mM/s] and first-order decay [1/s] */
	rProd: number;
	rDecay: number;
	/** region id restricting production/decay, '' = all cells */
	profile: string;
	activators: Influencer[];
	inhibitors: Influencer[];
	/** optional regulated extra decay: decayMax * alpha(decay regulators) * c */
	decayMax?: number;
	decayActivators?: Influencer[];
	decayInhibitors?: Influencer[];
}

export interface GatingConfig {
	/** ions whose membrane permeability this substance opens */
	ions: string[];
	HillK: number;
	HillN: number;
	/** permeability when fully open [m2/s] */
	peak: number;
	/** read the bath concentration instead of the cell's */
	extracellular: boolean;
	activators: Influencer[];
	inhibitors: Influencer[];
}

export interface SubstanceConfig {
	name: string;
	z: number;
	/** membrane permeability, free diffusion, gap-junction diffusion [m2/s] */
	Dm: number;
	Do: number;
	Dgj: number;
	cCell: number;
	cEnv: number;
	/** charge scale factor (BETSE 'scale factor') */
	scale?: number;
	/** track a separate membrane concentration with intracellular diffusion (BETSE 'update intracellular') */
	updateIntra?: boolean;
	gjImpermeable?: boolean;
	growth?: GrowthConfig;
	gating?: GatingConfig;
}

export interface ReactionConfig {
	name: string;
	reactants: { name: string; coeff: number; Km: number }[];
	products: { name: string; coeff: number; Km: number }[];
	vmax: number;
	/** standard free energy [J/mol]; null = irreversible Michaelis-Menten form */
	deltaG: number | null;
	activators: Influencer[];
	inhibitors: Influencer[];
}

export interface ModulatorConfig {
	name: string;
	target: 'GJ' | 'NaK';
	max: number;
	activators: Influencer[];
	inhibitors: Influencer[];
}

export interface NetworkConfig {
	substances: SubstanceConfig[];
	reactions: ReactionConfig[];
	modulators: ModulatorConfig[];
	/** substances' charge enters the cell charge / Vm computation */
	affectCharge: boolean;
}

interface Substance {
	cfg: SubstanceConfig;
	cCells: Float64Array;
	cMem: Float64Array;
	cEnv: number;
	/** growth/decay target cells (BETSE growth_targets_cell) */
	targets: Int32Array;
	growthAlpha: AlphaFn | null;
	decayAlpha: AlphaFn | null;
	gatingAlpha: AlphaFn | null;
	gatingIons: number[];
	/** last membrane / GJ fluxes [mol/m2 s] */
	fMem: Float64Array;
	fGj: Float64Array;
}

/** evaluates a regulator product; length = nCells for zone 'cell', nMems for zone 'mem' */
type AlphaFn = (out: Float64Array) => Float64Array;

export class Network {
	subs: Substance[] = [];
	private byName = new Map<string, Substance>();
	/** rows = ions then substances (BETSE cell_concs order); cols = growth per substance, then reactions */
	private matrix: Float64Array;
	private nRows: number;
	private nCols: number;
	private reactionRate: ((out: Float64Array) => Float64Array)[] = [];
	private modulators: { cfg: ModulatorConfig; alpha: AlphaFn }[] = [];
	private channelAlpha = new Map<string, AlphaFn>();
	/** per-membrane multipliers written for the pump / gap junctions (BETSE NaKATP_block, gj_block) */
	private rates: Float64Array[];
	private scratchCells: Float64Array[];
	private scratchMems: Float64Array[];

	constructor(
		public cfg: NetworkConfig,
		private mesh: Mesh,
		private ions: Ion[],
		private p: Params,
		private s: SimState,
		/** region id -> cell indices, for growth targets */
		profileCells: (id: string) => number[] | null
	) {
		const { nCells, nMems } = mesh;
		for (const sc of cfg.substances) {
			const sub: Substance = {
				cfg: sc,
				cCells: new Float64Array(nCells).fill(sc.cCell),
				cMem: new Float64Array(nMems).fill(sc.cCell),
				cEnv: sc.cEnv,
				targets: Int32Array.from(sc.growth && sc.growth.profile !== '' ? (profileCells(sc.growth.profile) ?? []) : Array.from({ length: nCells }, (_, i) => i)),
				growthAlpha: null, decayAlpha: null, gatingAlpha: null,
				gatingIons: (sc.gating?.ions ?? []).map((n) => { const i = ions.findIndex((x) => x.name === n); if (i < 0) throw new Error(`gating ion ${n} not in experiment`); return i; }),
				fMem: new Float64Array(nMems), fGj: new Float64Array(nMems)
			};
			this.subs.push(sub);
			this.byName.set(sc.name, sub);
		}
		// regulators are compiled after all substances exist
		for (const sub of this.subs) {
			const g = sub.cfg.growth;
			if (g) {
				sub.growthAlpha = this.compileAlpha(g.activators, g.inhibitors, 'cell');
				sub.decayAlpha = this.compileAlpha(g.decayActivators ?? [], g.decayInhibitors ?? [], 'cell');
			}
			if (sub.cfg.gating) sub.gatingAlpha = this.compileAlpha(sub.cfg.gating.activators, sub.cfg.gating.inhibitors, 'mem');
		}
		this.nRows = ions.length + this.subs.length;
		this.nCols = this.subs.length + cfg.reactions.length;
		this.matrix = new Float64Array(this.nRows * this.nCols);
		const row = (name: string) => { const i = ions.findIndex((x) => x.name === name); if (i >= 0) return i; const j = this.subs.findIndex((x) => x.cfg.name === name); if (j < 0) throw new Error(`unknown species ${name}`); return ions.length + j; };
		this.subs.forEach((sub, j) => { this.matrix[(ions.length + j) * this.nCols + j] += 1; });
		cfg.reactions.forEach((rx, k) => {
			const col = this.subs.length + k;
			for (const r of rx.reactants) this.matrix[row(r.name) * this.nCols + col] += -r.coeff;
			for (const q of rx.products) this.matrix[row(q.name) * this.nCols + col] += q.coeff;
			this.reactionRate.push(this.compileReaction(rx));
		});
		for (const m of cfg.modulators) this.modulators.push({ cfg: m, alpha: this.compileAlpha(m.activators, m.inhibitors, 'mem') });
		this.rates = Array.from({ length: this.nCols }, () => new Float64Array(nCells));
		this.scratchCells = Array.from({ length: 4 }, () => new Float64Array(nCells));
		this.scratchMems = Array.from({ length: 4 }, () => new Float64Array(nMems));
		this.updateCharge();
	}

	/** regulators on a voltage-gated channel (BETSE channel activators/inhibitors, membrane zone) */
	setChannelRegulators(channelId: string, activators: Influencer[], inhibitors: Influencer[]): void {
		if (activators.length === 0 && inhibitors.length === 0) { this.channelAlpha.delete(channelId); return; }
		this.channelAlpha.set(channelId, this.compileAlpha(activators, inhibitors, 'mem'));
	}

	/** BETSE run_loop_channels' `moddy`: evaluated right before each channel runs */
	runChannelModulators(channels: ChannelInstance[]): void {
		for (const ch of channels) {
			const fn = this.channelAlpha.get(ch.id);
			if (fn) fn(ch.modulator); else ch.modulator.fill(1);
		}
	}

	/** substances' charge into state.extraRho (BETSE extra_rho_cells) */
	private updateCharge(): void {
		const { s, mesh } = this;
		s.extraRho.fill(0);
		if (!this.cfg.affectCharge) return;
		for (const sub of this.subs) {
			const zF = sub.cfg.z * F * (sub.cfg.scale ?? 1);
			for (let c = 0; c < mesh.nCells; c++) s.extraRho[c] += zF * sub.cCells[c];
		}
	}

	/** overwrite substance pools (fixture loading) */
	setConcentrations(name: string, cells: ArrayLike<number>, mem: ArrayLike<number>, env: number): void {
		const sub = this.byName.get(name);
		if (!sub) throw new Error(`unknown substance ${name}`);
		sub.cCells.set(cells); sub.cMem.set(mem); sub.cEnv = env;
		this.updateCharge();
	}

	/** initial charge balance (BETSE bal_charge): compensate substances' charge with K+/M- (cell) and Na+/M- (bath) */
	balanceCharge(): void {
		let Qc = 0, Qe = 0;
		for (const sub of this.subs) { const sc = sub.cfg.scale ?? 1; Qc += sub.cfg.cCell * sub.cfg.z * sc; Qe += sub.cfg.cEnv * sub.cfg.z * sc; }
		const iM = this.ions.findIndex((x) => x.name === 'M'), iK = this.ions.findIndex((x) => x.name === 'K'), iNa = this.ions.findIndex((x) => x.name === 'Na');
		const adjust = (i: number, dq: number) => { for (let c = 0; c < this.mesh.nCells; c++) this.s.ccCells[i][c] -= dq; for (let m = 0; m < this.mesh.nMems; m++) this.s.ccAtMem[i][m] = this.s.ccCells[i][this.mesh.memToCell[m]]; };
		if (Qc < 0 && iM >= 0) adjust(iM, -Qc); else if (Qc > 0 && iK >= 0) adjust(iK, Qc);
		if (Qe < 0 && iM >= 0) this.s.ccEnv[iM] -= -Qe; else if (Qe > 0 && iNa >= 0) this.s.ccEnv[iNa] -= Qe;
	}

	/** concentration of a named species in a pool: 'cell' = per cell, 'mem' = per membrane, 'env' = bath scalar */
	private conc(name: string, pool: 'cell' | 'mem' | 'env'): Float64Array | number {
		const i = this.ions.findIndex((x) => x.name === name);
		if (i >= 0) return pool === 'cell' ? this.s.ccCells[i] : pool === 'mem' ? this.s.ccAtMem[i] : this.s.ccEnv[i];
		const sub = this.byName.get(name);
		if (!sub) throw new Error(`unknown species ${name}`);
		return pool === 'cell' ? sub.cCells : pool === 'mem' ? sub.cMem : sub.cEnv;
	}

	/**
	 * BETSE get_influencers: alpha = (Π act_terms [+ Σ independent '!' terms]) × Π inh_terms,
	 * act term = (c/Km)^n / (1 + (c/Km)^n), inh term = 1 / (1 + (c/Km)^n). Voltage-sensitive '*' not supported.
	 */
	private compileAlpha(activators: Influencer[], inhibitors: Influencer[], zone: 'cell' | 'mem'): AlphaFn {
		const parse = (f: Influencer) => {
			let name = f.name, independent = false;
			if (name.endsWith('*')) throw new Error(`voltage-sensitive regulator ${name} not supported`);
			if (name.endsWith('!')) { name = name.slice(0, -1); independent = true; }
			if (name.endsWith('&')) throw new Error(`direct regulator ${name} not supported`);
			const pool: 'cell' | 'mem' | 'env' = f.zone === 'env' ? 'env' : zone;
			return { name, Km: f.Km, n: f.n, independent, pool };
		};
		const acts = activators.map(parse), inhs = inhibitors.map(parse);
		return (out: Float64Array) => {
			const n = out.length;
			const get = (t: ReturnType<typeof parse>) => this.conc(t.name, t.pool);
			for (let k = 0; k < n; k++) {
				let prod = 1, hasProd = false, indep = 0;
				for (const a of acts) {
					const c = get(a); const x = (typeof c === 'number' ? c : c[k]) / a.Km; const h = x ** a.n;
					const term = h / (1 + h);
					if (a.independent) indep += term; else { prod *= term; hasProd = true; }
				}
				let alpha = (hasProd ? prod : 1) + indep;
				if (!hasProd && indep === 0 && acts.length > 0) alpha = 1;
				for (const b of inhs) {
					const c = get(b); const x = (typeof c === 'number' ? c : c[k]) / b.Km;
					alpha *= 1 / (1 + x ** b.n);
				}
				out[k] = alpha;
			}
			return out;
		};
	}

	/** BETSE write_reactions (cell zone) */
	private compileReaction(rx: ReactionConfig): (out: Float64Array) => Float64Array {
		const alpha = this.compileAlpha(rx.activators, rx.inhibitors, 'cell');
		const tmp = new Float64Array(this.mesh.nCells);
		return (out: Float64Array) => {
			alpha(tmp);
			const RT = R * this.p.T;
			for (let c = 0; c < out.length; c++) {
				let rate: number;
				if (rx.deltaG !== null) {
					let num = 1, den = 1;
					for (const q of rx.products) { const cc = this.conc(q.name, 'cell') as Float64Array; num *= (1e-3 * cc[c]) ** q.coeff; }
					for (const r of rx.reactants) { const cc = this.conc(r.name, 'cell') as Float64Array; den *= (1e-3 * cc[c]) ** r.coeff; }
					const Q = num / den;
					const Keq = Math.exp(-rx.deltaG / RT);
					rate = rx.vmax * tmp[c] * (1 - Q / Keq);
				} else {
					let fwd = 1;
					for (const r of rx.reactants) { const cc = this.conc(r.name, 'cell') as Float64Array; const x = (cc[c] / r.Km) ** r.coeff; fwd *= x / (1 + x); }
					rate = rx.vmax * tmp[c] * fwd;
				}
				out[c] = rate;
			}
			return out;
		};
	}

	/** BETSE run_loop_modulators: writes per-membrane multipliers into state.nakMod / gjMod */
	runModulators(): void {
		const tmp = this.scratchMems[0];
		for (const m of this.modulators) {
			m.alpha(tmp);
			const target = m.cfg.target === 'GJ' ? this.s.gjMod : this.s.nakMod;
			for (let k = 0; k < tmp.length; k++) target[k] = m.cfg.max * tmp[k];
		}
	}

	/** BETSE run_loop: growth/decay + reactions, then per substance gating, transport, charge. */
	run(t: number): void {
		void t;
		const { mesh, ions, p, s } = this;
		const { nCells, nMems } = mesh;
		const dt = p.dt;
		// 1. update_intra for every substance, then growth/decay rates
		this.subs.forEach((sub, j) => {
			this.updateIntra(sub);
			const out = this.rates[j];
			out.fill(0);
			const g = sub.cfg.growth;
			if (!g) return;
			const a = sub.growthAlpha!(this.scratchCells[0]);
			const d = sub.decayAlpha!(this.scratchCells[1]);
			const dmax = g.decayMax ?? 0;
			for (const c of sub.targets) out[c] = g.rProd * a[c] - g.rDecay * sub.cCells[c] - dmax * d[c] * sub.cCells[c];
		});
		// 2. reactions
		this.reactionRate.forEach((fn, k) => fn(this.rates[this.subs.length + k]));
		// 3. delta = matrix · rates, applied to ions (rows 0..nIons) and substances
		for (let r = 0; r < this.nRows; r++) {
			const target = r < ions.length ? s.ccCells[r] : this.subs[r - ions.length].cCells;
			let any = false;
			for (let k = 0; k < this.nCols; k++) if (this.matrix[r * this.nCols + k] !== 0) { any = true; break; }
			if (!any) continue;
			for (let c = 0; c < nCells; c++) {
				let d = 0;
				for (let k = 0; k < this.nCols; k++) d += this.matrix[r * this.nCols + k] * this.rates[k][c];
				target[c] += d * dt;
			}
		}
		// 4. per substance: gating, transport, sanity, charge
		for (const sub of this.subs) {
			if (sub.cfg.gating) this.gate(sub);
			this.transport(sub);
			for (let c = 0; c < nCells; c++) if (Number.isNaN(sub.cCells[c])) throw new UnstableError(`NaN in substance ${sub.cfg.name}`);
		}
		this.updateCharge();
		void nMems;
	}

	/** BETSE Molecule.update_intra (z = 0 / no field case for the intracellular-diffusion branch) */
	private updateIntra(sub: Substance): void {
		const { mesh, p } = this;
		if (!sub.cfg.updateIntra) {
			for (let m = 0; m < mesh.nMems; m++) sub.cMem[m] = sub.cCells[mesh.memToCell[m]];
			return;
		}
		if (sub.cfg.z !== 0) throw new Error(`updateIntra with charged substance ${sub.cfg.name} needs the intracellular field (not supported)`);
		const Do = sub.cfg.Do, dt = p.dt;
		for (let m = 0; m < mesh.nMems; m++) {
			const cav = sub.cCells[mesh.memToCell[m]];
			const gamma = mesh.memSa[m] / (0.75 * mesh.memVol[m]);
			const k = (gamma * Do * dt) / mesh.rRads[m];
			sub.cMem[m] = (k * cav + sub.cMem[m]) / (1 + k);
			if (sub.cMem[m] < 0) throw new UnstableError(`substance ${sub.cfg.name} negative at a membrane`);
		}
	}

	/** BETSE Molecule.gating: substance opens a permeability for its target ions; flux applied at once and also queued */
	private gate(sub: Substance): void {
		const { mesh, ions, p, s } = this;
		const g = sub.cfg.gating!;
		const alpha = sub.gatingAlpha!(this.scratchMems[1]);
		const RT = R * p.T;
		const flux = this.scratchMems[2];
		for (const i of sub.gatingIons) {
			const z = ions[i].z + NONCE;
			const cA = s.ccEnv[i];
			const cc = s.ccCells[i];
			for (let m = 0; m < mesh.nMems; m++) {
				const x = g.extracellular ? sub.cEnv : sub.cMem[m];
				const hill = x ** g.HillN / (g.HillK ** g.HillN + x ** g.HillN);
				const Dchan = g.peak * hill * alpha[m];
				s.vm[m] += NONCE;
				flux[m] = ghkFlux(cA, cc[mesh.memToCell[m]], Dchan, p.tm, z, s.vm[m], RT);
				s.fluxesMem[i][m] += flux[m];
			}
			// update_Co on the ion: cells, membranes, bath
			let envSum = 0;
			for (let m = 0; m < mesh.nMems; m++) {
				const c = mesh.memToCell[m];
				cc[c] += (flux[m] * mesh.memSa[m] * p.dt) / mesh.cellVol[c];
				envSum += (-flux[m] * mesh.memSa[m]) / p.volEnv;
			}
			for (let m = 0; m < mesh.nMems; m++) s.ccAtMem[i][m] = cc[mesh.memToCell[m]];
			s.ccEnv[i] += (envSum / mesh.nMems) * p.dt;
		}
	}

	/** BETSE molecule_mover for the ECM-off case */
	private transport(sub: Substance): void {
		const { mesh, p, s } = this;
		const { nMems } = mesh;
		const sc = sub.cfg;
		const z = sc.z + NONCE;
		const RT = R * p.T;
		const fmem = sub.fMem, fgj = sub.fGj;
		// membrane flux (only if permeable), then update_Co(update_at_mems = updateIntra)
		if (sc.Dm !== 0) {
			for (let m = 0; m < nMems; m++) { s.vm[m] += NONCE; fmem[m] = ghkFlux(sub.cEnv, sub.cMem[m], sc.Dm, p.tm, z, s.vm[m], RT); }
		} else fmem.fill(0);
		let envSum = 0;
		if (sc.updateIntra) for (let m = 0; m < nMems; m++) sub.cMem[m] += fmem[m] * (mesh.memSa[m] / (0.75 * mesh.memVol[m])) * p.dt;
		for (let m = 0; m < nMems; m++) {
			const c = mesh.memToCell[m];
			sub.cCells[c] += (fmem[m] * mesh.memSa[m] * p.dt) / mesh.cellVol[c];
			envSum += (-fmem[m] * mesh.memSa[m]) / p.volEnv;
		}
		if (!sc.updateIntra) for (let m = 0; m < nMems; m++) sub.cMem[m] = sub.cCells[mesh.memToCell[m]];
		sub.cEnv += (envSum / nMems) * p.dt;
		// gap junctions
		if (!sc.gjImpermeable) {
			for (let m = 0; m < nMems; m++) {
				s.vgj[m] += NONCE;
				fgj[m] = ghkFlux(sub.cMem[m], sub.cMem[mesh.memPartner[m]], sc.Dgj * s.gjBlock[m] * s.gjMod[m] * s.gjOpen[m], mesh.gjLen, z, s.vgj[m], RT);
			}
			for (const m of mesh.boundaryMems) fgj[m] = 0;
			for (let m = 0; m < nMems; m++) {
				const c = mesh.memToCell[m];
				sub.cCells[c] += (-fgj[m] * mesh.memSa[m] * p.dt) / mesh.cellVol[c];
			}
			if (sc.updateIntra) for (let m = 0; m < nMems; m++) sub.cMem[m] += -fgj[m] * (mesh.memSa[m] / (0.75 * mesh.memVol[m])) * p.dt;
			else for (let m = 0; m < nMems; m++) sub.cMem[m] = sub.cCells[mesh.memToCell[m]];
		} else fgj.fill(0);
		for (let c = 0; c < mesh.nCells; c++) if (sub.cCells[c] < 0) throw new UnstableError(`substance ${sc.name} below zero in a cell`);
		for (let m = 0; m < nMems; m++) if (sub.cMem[m] < 0) throw new UnstableError(`substance ${sc.name} below zero on a membrane`);
		if (sub.cEnv < 0) throw new UnstableError(`substance ${sc.name} below zero in the bath`);
	}
}
