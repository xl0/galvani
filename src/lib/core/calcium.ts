import type { Mesh } from './mesh';
import type { Ion, Params } from './params';
import { F } from './params';
import type { SimState } from './state';
import type { Network } from './network';

/**
 * Endoplasmic-reticulum calcium store per cell: SERCA uptake, a passive leak and a
 * release permeability gated by cytosolic Ca²⁺: fast Hill activation times a slow
 * inactivation variable h that relaxes toward a Hill function of Ca²⁺ with time
 * constant inhTau (Li–Rinzel form; the slow h is what makes release oscillate rather
 * than fire once), and optionally by an IP3 substance of the network. Exchange with the ER is treated as charge-compensated (counter-ions
 * follow), so it does not move Vm; `erRho` cancels the moved Ca²⁺ charge.
 * Our own model: BETSE's ER code is disabled upstream and has no working reference.
 */
export interface CalciumConfig {
	/** initial ER Ca²⁺ [mM] */
	cEr: number;
	/** ER volume as a fraction of cell volume; ER membrane area = cell membrane area */
	volFraction: number;
	/** passive ER leak permeability [m²/s] */
	leakDm: number;
	/** release channel permeability when fully open [m²/s] */
	releaseMax: number;
	/** cytosolic Ca²⁺ activation (Km [mM], Hill n) of release: instantaneous */
	actKm: number;
	actN: number;
	/** slow inactivation: h relaxes toward 1 / (1 + (Ca/inhKm)^inhN) with time constant inhTau [s] */
	inhKm: number;
	inhN: number;
	inhTau: number;
	/** network substance that must also be present to open release channels ('' = none) */
	ip3: string;
	ip3Km: number;
	ip3N: number;
	/** SERCA: max uptake rate [mol/m² s] and Km [mM], Hill 2 */
	sercaMax: number;
	sercaKm: number;
}

/**
 * Tuned so that a cluster with Ca permeability 5e-18 and the default Ca-ATPase rests at
 * ~0.03 µM cytosolic Ca with a ~0.4 mM store, does not fire spontaneously, and carries a
 * regenerative wave (~35 µm/s) when gap-junction Ca coupling is raised (see the preset).
 */
export const defaultCalcium: CalciumConfig = {
	cEr: 0.5, volFraction: 0.1, leakDm: 1e-18, releaseMax: 3e-15,
	actKm: 1.5e-4, actN: 4, inhKm: 1e-3, inhN: 2, inhTau: 2, ip3: '', ip3Km: 1e-3, ip3N: 2,
	sercaMax: 2e-8, sercaKm: 1e-4
};

export class ErCalcium {
	/** ER Ca²⁺ per cell [mM] */
	cEr: Float64Array;
	/** release channel open fraction per cell (for display) and its slow inactivation gate */
	open: Float64Array;
	h: Float64Array;
	constructor(public cfg: CalciumConfig, public mesh: Mesh, public iCa: number) {
		this.cEr = new Float64Array(mesh.nCells).fill(cfg.cEr);
		this.open = new Float64Array(mesh.nCells);
		this.h = new Float64Array(mesh.nCells).fill(1);
	}

	/** One explicit step of ER exchange; modifies cytosolic Ca²⁺ in place. */
	run(s: SimState, p: Params, network: Network | null): void {
		const { nCells, cellSa, cellVol } = this.mesh;
		const c = this.cfg, cc = s.ccCells[this.iCa], cEr = this.cEr;
		const ip3 = c.ip3 && network ? network.subs.find((x) => x.cfg.name === c.ip3)?.cCells : undefined;
		const erVolInv = 1 / c.volFraction;
		for (let k = 0; k < nCells; k++) {
			const ca = Math.max(cc[k], 0);
			const act = (ca / c.actKm) ** c.actN;
			const hInf = 1 / (1 + (ca / c.inhKm) ** c.inhN);
			this.h[k] += ((hInf - this.h[k]) * p.dt) / c.inhTau;
			let gate = (act / (1 + act)) * this.h[k];
			if (ip3) { const a = (ip3[k] / c.ip3Km) ** c.ip3N; gate *= a / (1 + a); }
			this.open[k] = gate;
			// mol/m² s across the ER membrane, positive into the cytosol
			const release = ((c.leakDm + c.releaseMax * gate) / p.tm) * (cEr[k] - ca);
			const h = (ca / c.sercaKm) ** 2;
			const uptake = (c.sercaMax * h) / (1 + h);
			const dCell = ((release - uptake) * cellSa[k] * p.dt) / cellVol[k];
			cc[k] += dCell;
			cEr[k] -= dCell * erVolInv;
			s.erRho[k] -= 2 * F * dCell;
			if (cEr[k] < 0) cEr[k] = 0;
		}
	}
}
