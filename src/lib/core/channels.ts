/**
 * Hodgkin-Huxley style voltage-gated channels, ported from BETSE
 * (betse/science/channels/vg_na.py, vg_k.py; models from Channelpedia).
 * Gates m, h relax toward voltage-dependent steady states with voltage-
 * dependent time constants; open fraction P = m^mp * h^hp scales the
 * membrane permeability of the channel's ion by maxDm.
 */
import type { Mesh } from './mesh';
import type { Ion, Params } from './params';
import { R } from './params';
import type { SimState } from './state';
import { ghkFlux, NONCE } from './step';

export interface Rates { mInf: number; mTau: number; hInf: number; hTau: number }

export interface ChannelModel {
	ion: 'Na' | 'K';
	/** time-constant unit relative to seconds (1e3 = model in ms) */
	timeUnit: number;
	mPower: number;
	hPower: number;
	/** gate steady states + time constants at membrane voltage V [mV] */
	rates(V: number): Rates;
	/** initial gate values at V [mV] (defaults to steady state) */
	init?(V: number): { m: number; h: number };
	label: string;
	blurb: string;
}

const sig = (V: number, vh: number, k: number) => 1 / (1 + Math.exp((V - vh) / k));

export const channelModels: Record<string, ChannelModel> = {
	Nav1p2: {
		ion: 'Na', timeUnit: 1e3, mPower: 3, hPower: 1, label: 'Nav1.2',
		blurb: 'Fast sodium channel (Hammil 1991, rat neocortex). Classic action-potential upstroke.',
		rates(V) {
			const Vs = V - 10;
			const mA = (0.182 * (Vs + 35)) / (1 - Math.exp(-(Vs + 35) / 9));
			const mB = (0.124 * (-Vs - 35)) / (1 - Math.exp(-(-Vs - 35) / 9));
			const hTau = 1 / ((0.024 * (Vs + 50)) / (1 - Math.exp(-(Vs + 50) / 5)) + (0.0091 * (-Vs - 75.000123)) / (1 - Math.exp(-(-Vs - 75.000123) / 5)));
			return { mInf: mA / (mA + mB), mTau: 1 / (mA + mB), hInf: sig(V, -65 + 10, 6.2), hTau };
		}
	},
	Nav1p3: {
		ion: 'Na', timeUnit: 1e3, mPower: 3, hPower: 1, label: 'Nav1.3',
		blurb: 'Embryonic sodium channel (Cummins 2001): fast activation, rapid repriming, persistent component.',
		rates(V) {
			const mA = (0.182 * (V + 26)) / (1 - Math.exp(-(V + 26) / 9));
			const mB = (0.124 * (-V - 26)) / (1 - Math.exp(-(-V - 26) / 9));
			return { mInf: mA / (mA + mB), mTau: 1 / (mA + mB), hInf: sig(V, -65, 8.1), hTau: 0.4 + 0.265 * Math.exp(-V / 9.47) };
		}
	},
	NavRat1: {
		ion: 'Na', timeUnit: 1e3, mPower: 3, hPower: 1, label: 'NavRat1',
		blurb: 'Generic rat sodium channel.',
		rates(V) {
			const mA = (0.182 * (V + 35)) / (1 - Math.exp(-(V + 35) / 9));
			const mB = (0.124 * (-V - 35)) / (1 - Math.exp(-(-V - 35) / 9));
			const hTau = 1 / ((0.024 * (V + 50)) / (1 - Math.exp(-(V + 50) / 5)) + (0.0091 * (-V - 75.000123)) / (1 - Math.exp(-(-V - 75.000123) / 5)));
			return { mInf: mA / (mA + mB), mTau: 1 / (mA + mB), hInf: sig(V, -65, 6.2), hTau };
		}
	},
	NavRat2: {
		ion: 'Na', timeUnit: 1e3, mPower: 3, hPower: 1, label: 'NavRat2',
		blurb: 'Slowly inactivating sodium channel (McCormick 1992, thalamocortical relay neurons).',
		rates(V) {
			const mA = (0.091 * (V + 38)) / (1 - Math.exp((-V - 38) / 5));
			const mB = (-0.062 * (V + 38)) / (1 - Math.exp((V + 38) / 5));
			const hA = 0.016 * Math.exp((-55 - V) / 15);
			const hB = 2.07 / (Math.exp((17 - V) / 21) + 1);
			return { mInf: mA / (mA + mB), mTau: 1 / (mA + mB), hInf: hA / (hA + hB), hTau: 1 / (hA + hB) };
		}
	},
	Nav1p6: {
		ion: 'Na', timeUnit: 1e3, mPower: 1, hPower: 0, label: 'Nav1.6',
		blurb: 'Persistent, non-inactivating sodium current.',
		rates(V) { return { mInf: 1 / (1 + Math.exp(-0.03937 * 4.2 * (V + 17))), mTau: 1, hInf: 1, hTau: 1 }; },
		init(V) { return { m: 1 / (1 + Math.exp(-0.03937 * 4.2 * (V + 17))), h: 1 }; }
	},
	NaLeak: {
		ion: 'Na', timeUnit: 1, mPower: 0, hPower: 0, label: 'Na leak',
		blurb: 'Always-open sodium permeability.',
		rates() { return { mInf: 1, mTau: 1, hInf: 1, hTau: 1 }; },
		init() { return { m: 1, h: 1 }; }
	},
	Kv1p1: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 2, label: 'Kv1.1', blurb: 'Low-voltage activated delayed rectifier (Christie et al., rat brain).',
		rates(V) { return { mInf: sig(V, -30.5, -11.3943), mTau: 30 / (1 + Math.exp((V + 76.56) / 26.1479)), hInf: sig(V, -30, 27.3943), hTau: 15000 / (1 + Math.exp((V + 160.56) / -100)) }; } },
	Kv1p2: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 1, label: 'Kv1.2', blurb: 'Delayed rectifier, slow inactivation.',
		rates(V) { return { mInf: 1 / (1 + Math.exp(-(V + 21) / 11.3943)), mTau: 150 / (1 + Math.exp((V + 67.56) / 34.1479)), hInf: 1 / (1 + Math.exp((V + 22) / 11.3943)), hTau: 15000 / (1 + Math.exp(-(V + 46.56) / 44.1479)) }; } },
	Kv1p3: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 1, label: 'Kv1.3', blurb: 'Delayed rectifier found in lymphocytes and neurons.',
		rates(V) { return { mInf: sig(V, -14.1, -10.3), mTau: -0.284 * V + 19.16, hInf: sig(V, -33, 3.7), hTau: -13.76 * V + 1162.4 }; } },
	Kv1p4: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 1, label: 'Kv1.4', blurb: 'A-type transient potassium current.',
		rates(V) { return { mInf: sig(V, -21.7, -16.9), mTau: 3, hInf: sig(V, -73.6, 12.8), hTau: 119 }; } },
	Kv1p5: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 1, label: 'Kv1.5', blurb: 'Ultra-rapid delayed rectifier (Philipson 1991). Good general-purpose K channel for action potentials.',
		rates(V) { return { mInf: sig(V, -6, -6.4), mTau: -0.1163 * V + 8.33, hInf: sig(V, -25.3, 3.5), hTau: -15.5 * V + 1620 }; } },
	Kv1p6: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 1, label: 'Kv1.6', blurb: 'Delayed rectifier (Grupe 1990).',
		rates(V) { return { mInf: sig(V, -20.8, -8.1), mTau: 30 / (1 + Math.exp((V + 46.56) / 44.14)), hInf: sig(V, -22, 11.39), hTau: 5000 / (1 + Math.exp((V + 46.56) / -44.14)) }; } },
	Kv2p1: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 1, label: 'Kv2.1', blurb: 'Slow delayed rectifier.',
		rates(V) { return { mInf: sig(V, -9.2, -6.6), mTau: 100 / (1 + Math.exp((V + 46.56) / 44.14)), hInf: sig(V, -19, 5), hTau: 10000 / (1 + Math.exp((V + 46.56) / -44.14)) }; } },
	Kv2p2: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 1, label: 'Kv2.2', blurb: 'Slow delayed rectifier.',
		rates(V) { return { mInf: sig(V, 5, -12), mTau: 130 / (1 + Math.exp((V + 46.56) / -44.14)), hInf: sig(V, -16.3, 4.8), hTau: 10000 / (1 + Math.exp((V + 46.56) / -44.14)) }; } },
	Kv3p1: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 0, label: 'Kv3.1', blurb: 'High-threshold, fast potassium channel.',
		rates(V) { return { mInf: sig(V, 18.7, -9.7), mTau: 20 / (1 + Math.exp((V + 46.56) / -44.14)), hInf: 1, hTau: 1 }; }, init(V) { return { m: sig(V, 18.7, -9.7), h: 1 }; } },
	Kv3p2: { ion: 'K', timeUnit: 1e3, mPower: 2, hPower: 0, label: 'Kv3.2', blurb: 'Fast potassium channel.',
		rates(V) { return { mInf: sig(V, -0.373267, -8.568187), mTau: 3.241643 + 19.106496 / (1 + Math.exp((V - 19.220623) / 4.451533)), hInf: 1, hTau: 1 }; }, init(V) { return { m: sig(V, -0.373267, -8.568187), h: 1 }; } },
	Kv3p3: { ion: 'K', timeUnit: 1e3, mPower: 2, hPower: 1, label: 'Kv3.3', blurb: 'Fast potassium channel with partial inactivation.',
		rates(V) { return { mInf: sig(V, 35, -7.3), mTau: 0.676808 + 27.913114 / (1 + Math.exp((V - 22.414149) / 9.704638)), hInf: 0.25 + 0.75 / (1 + Math.exp((V + 28.293856) / 29.385636)), hTau: 199.786728 + 2776.119438 * Math.exp(-V / 7.309565) }; } },
	Kv3p4: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 1, label: 'Kv3.4', blurb: 'Fast, inactivating potassium channel.',
		rates(V) { return { mInf: sig(V, -3.4, -8.4), mTau: 10 / (1 + Math.exp((V - 4.44) / 38.14)), hInf: sig(V, -53.32, 7.4), hTau: 20000 / (1 + Math.exp((V + 46.56) / -44.14)) }; } },
	K_Fast: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 1, label: 'K fast', blurb: 'Fast transient potassium current.',
		rates(V) { return { mInf: 1 / (1 + Math.exp(-(V + 47) / 29)), mTau: 0.34 + 0.92 * Math.exp(-(((V + 71) / 59) ** 2)), hInf: 1 / (1 + Math.exp(-(V + 56) / -10)), hTau: 8 + 49 * Math.exp(-(((V + 73) / 23) ** 2)) }; } },
	Kir2p1: { ion: 'K', timeUnit: 1e3, mPower: 1, hPower: 2, label: 'Kir2.1', blurb: 'Inward rectifier: open at hyperpolarized voltages, closes on depolarization. Stabilizes the resting potential.',
		rates(V) { return { mInf: sig(V, -96.48, 23.26), mTau: 3.7 + -3.37 / (1 + Math.exp((V + 32.9) / 27.93)), hInf: sig(V, -168.28, -44.13), hTau: 0.85 + 306.3 / (1 + Math.exp((V + 118.29) / -27.23)) }; } },
	KLeak: {
		ion: 'K', timeUnit: 1, mPower: 0, hPower: 0, label: 'K leak',
		blurb: 'Always-open potassium permeability. The simplest way to set a negative resting potential.',
		rates() { return { mInf: 1, mTau: 1, hInf: 1, hTau: 1 }; },
		init() { return { m: 1, h: 1 }; }
	}
};
export const channelTypes = Object.keys(channelModels);

/** A channel population on the cluster: gates per membrane, mask of membranes it is expressed on. */
export interface ChannelInstance {
	id: string;
	type: string;
	model: ChannelModel;
	ionIndex: number;
	/** permeability when fully open [m2/s] */
	maxDm: number;
	/** 1 on membranes that express the channel, else 0 */
	mask: Float64Array;
	m: Float64Array;
	h: Float64Array;
	/** last computed open fraction (for display) */
	P: Float64Array;
	/** scratch: flux into cells [mol/m2 s] */
	flux: Float64Array;
}

export function createChannel(id: string, type: string, maxDm: number, ions: Ion[], vm: Float64Array): ChannelInstance {
	const model = channelModels[type];
	if (!model) throw new Error(`unknown channel type ${type}`);
	const ionIndex = ions.findIndex((i) => i.name === model.ion);
	if (ionIndex < 0) throw new Error(`channel ${type} needs ion ${model.ion}`);
	const n = vm.length;
	const ch: ChannelInstance = {
		id, type, model, ionIndex, maxDm,
		mask: new Float64Array(n).fill(1), m: new Float64Array(n), h: new Float64Array(n), P: new Float64Array(n), flux: new Float64Array(n)
	};
	for (let k = 0; k < n; k++) {
		const V = vm[k] * 1e3;
		if (model.init) {
			const g = model.init(V);
			ch.m[k] = g.m; ch.h[k] = g.h;
		} else {
			const r = model.rates(V);
			ch.m[k] = r.mInf; ch.h[k] = r.hInf;
		}
	}
	return ch;
}

/**
 * Advance gates one step and apply the channel's ion flux to concentrations
 * immediately (BETSE run_loop_channels: gates updated implicitly, GHK flux
 * with permeability P*maxDm, then update_Co on cells, membranes and bath).
 */
export function runChannel(ch: ChannelInstance, mesh: Mesh, ions: Ion[], p: Params, s: SimState): void {
	const { nMems } = mesh;
	const model = ch.model;
	const dtu = p.dt * model.timeUnit;
	const i = ch.ionIndex;
	const z = ions[i].z + NONCE;
	const RT = R * p.T;
	const cA = s.ccEnv[i];
	const cc = s.ccCells[i];
	const cmem = s.ccAtMem[i];
	const flux = ch.flux;
	for (let k = 0; k < nMems; k++) {
		const r = model.rates(s.vm[k] * 1e3);
		ch.m[k] = (r.mTau * ch.m[k] + dtu * r.mInf) / (r.mTau + dtu);
		ch.h[k] = (r.hTau * ch.h[k] + dtu * r.hInf) / (r.hTau + dtu);
		const P = ch.m[k] ** model.mPower * ch.h[k] ** model.hPower * ch.mask[k];
		ch.P[k] = P;
		s.vm[k] += NONCE;
		flux[k] = ghkFlux(cA, cc[mesh.memToCell[k]], P * ch.maxDm, p.tm, z, s.vm[k], RT);
	}
	let envSum = 0;
	for (let k = 0; k < nMems; k++) {
		const c = mesh.memToCell[k];
		cc[c] += (flux[k] * mesh.memSa[k] * p.dt) / mesh.cellVol[c];
		envSum += (-flux[k] * mesh.memSa[k]) / p.volEnv;
	}
	for (let k = 0; k < nMems; k++) cmem[k] = cc[mesh.memToCell[k]];
	s.ccEnv[i] += (envSum / nMems) * p.dt;
}
