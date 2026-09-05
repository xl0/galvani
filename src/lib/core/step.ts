import type { Mesh } from './mesh';
import type { Ion, Params } from './params';
import { F, R } from './params';
import type { SimState } from './state';
import { updateV } from './state';

/**
 * BETSE parity notes: BETSE adds 1e-25 in place to the voltage array in
 * electroflux(), so vm drifts by a few 1e-25 per step; we do the same so the
 * trajectories agree to round-off. Order of operations mirrors
 * Simulator._run_sim_core_loop for the ECM-off, full-solver case.
 */
const NONCE = 1e-25;

// Harris et al. 1983 gap-junction gating constants (axolotl embryo).
const GJ_LAMB = 0.0013;
const GJ_A1 = 0.077;
const GJ_A2 = 0.14;

export class UnstableError extends Error {}

/** Advance the state by one forward-Euler step of length p.dt. */
export function step(mesh: Mesh, ions: Ion[], p: Params, s: SimState): void {
	const { nMems, nCells } = mesh;
	const RT = R * p.T;
	const dt = p.dt;
	const nIons = ions.length;
	for (let i = 0; i < nIons; i++) {
		s.fluxesMem[i].fill(0);
		s.fluxesGj[i].fill(0);
	}

	// ---- Na/K-ATPase pump ------------------------------------------------
	const iNa = ions.findIndex((x) => x.name === 'Na');
	const iK = ions.findIndex((x) => x.name === 'K');
	if (p.alphaNaK > 0 && iNa >= 0 && iK >= 0) {
		const cNao = s.ccEnv[iNa];
		const cKo = s.ccEnv[iK];
		const kNa3 = (cNao * 1e-3) ** 3;
		const cKoKm2 = (cKo / p.KmNK_K) ** 2;
		const atpKm = p.cATP / p.KmNK_ATP;
		const fNaArr = s.fluxesMem[iNa];
		const fKArr = s.fluxesMem[iK];
		for (let m = 0; m < nMems; m++) {
			const cNai = s.ccAtMem[iNa][m];
			const cKi = s.ccAtMem[iK][m];
			const Vm = s.vm[m];
			const Qnumo = p.cADP * 1e-3 * (p.cPi * 1e-3) * kNa3 * (cKi * 1e-3) ** 2;
			let Qdenomo = p.cATP * 1e-3 * (cNai * 1e-3) ** 3 * (cKo * 1e-3) ** 2;
			if (Qdenomo === 0) Qdenomo = 1e-15;
			const Q = Qnumo / Qdenomo;
			const Keq = Math.exp(-(p.deltaGATP / RT - (F * Vm) / RT));
			const naKm3 = (cNai / p.KmNK_Na) ** 3;
			const fwd = (naKm3 * cKoKm2 * atpKm) / ((1 + naKm3) * (1 + cKoKm2) * (1 + atpKm));
			const fNa = -3 * s.nakBlock[m] * p.alphaNaK * fwd * (1 - Q / Keq);
			fNaArr[m] += fNa;
			fKArr[m] += -(2 / 3) * fNa;
			s.rateNaK[m] = -fNa;
		}
	} else {
		s.rateNaK.fill(0);
	}

	// ---- electrodiffusion across membranes and gap junctions -------------
	for (let i = 0; i < nIons; i++) {
		const z = ions[i].z + NONCE;
		const cA = s.ccEnv[i];
		const cmem = s.ccAtMem[i];
		const Dm = s.Dm[i];
		const fmem = s.fluxesMem[i];
		for (let m = 0; m < nMems; m++) {
			s.vm[m] += NONCE;
			fmem[m] += ghkFlux(cA, cmem[m], Dm[m], p.tm, z, s.vm[m], RT);
		}

		// gap junctions
		for (let m = 0; m < nMems; m++) s.vgj[m] = s.vm[mesh.memPartner[m]] - s.vm[m];
		if (p.vSensitiveGj) {
			const dtms = dt * 1e3;
			for (let m = 0; m < nMems; m++) {
				const V1 = 1e3 * Math.abs(s.vgj[m]);
				const alpha = GJ_LAMB * Math.exp(-GJ_A1 * (V1 - p.gjVthresh));
				let beta = GJ_LAMB * Math.exp(GJ_A2 * (V1 - p.gjVthresh));
				beta = beta / (1 + 50 * beta);
				s.gjOpen[m] = (s.gjOpen[m] + dtms * (alpha + beta * p.gjMin)) / (1 + alpha * dtms + beta * dtms);
				s.gjOpen[m] *= s.gjBlock[m];
			}
		} else {
			for (let m = 0; m < nMems; m++) s.gjOpen[m] = s.gjBlock[m] * mesh.gjWeights[m];
		}
		const Dgj = s.Dgj[i];
		const fgj = s.fluxesGj[i];
		for (let m = 0; m < nMems; m++) {
			const vgj = s.vgj[m] + NONCE;
			fgj[m] += ghkFlux(cmem[m], cmem[mesh.memPartner[m]], Dgj[m] * p.gjSurface * s.gjOpen[m], mesh.gjLen, z, vgj, RT);
		}
		for (const m of mesh.boundaryMems) fgj[m] = 0;

		// concentration at membranes := cell-centre value (BETSE update_intra)
		const cc = s.ccCells[i];
		for (let m = 0; m < nMems; m++) cmem[m] = cc[mesh.memToCell[m]];
	}

	// ---- apply fluxes to concentrations (BETSE update_all_concs) ---------
	for (let i = 0; i < nIons; i++) {
		const cc = s.ccCells[i];
		const cmem = s.ccAtMem[i];
		const fmem = s.fluxesMem[i];
		const fgj = s.fluxesGj[i];
		// membrane fluxes -> cells and bath
		let envSum = 0;
		for (let m = 0; m < nMems; m++) {
			const c = mesh.memToCell[m];
			cc[c] += (fmem[m] * mesh.memSa[m] * dt) / mesh.cellVol[c];
			envSum += (-fmem[m] * mesh.memSa[m]) / p.volEnv;
		}
		s.ccEnv[i] += (envSum / nMems) * dt;
		for (let m = 0; m < nMems; m++) cmem[m] = cc[mesh.memToCell[m]];
		// gap-junction fluxes -> cells only
		for (let m = 0; m < nMems; m++) {
			const c = mesh.memToCell[m];
			cc[c] += (-fgj[m] * mesh.memSa[m] * dt) / mesh.cellVol[c];
		}
		for (let c = 0; c < nCells; c++) {
			if (Number.isNaN(cc[c])) throw new UnstableError(`NaN concentration of ${ions[i].name} at step ${s.step}`);
			if (cc[c] < 0) cc[c] = 0;
		}
	}

	updateV(mesh, ions, p, s);
	for (let m = 0; m < nMems; m++) {
		if (Number.isNaN(s.vm[m])) throw new UnstableError(`NaN vm at step ${s.step}`);
	}
	s.step++;
	s.t += dt;
}

/**
 * Goldman-Hodgkin-Katz flux from region A to region B across distance d,
 * positive into B; vBA = V_B - V_A. Falls back to Fick diffusion as vBA -> 0.
 * [mol/m2 s]
 */
export function ghkFlux(cA: number, cB: number, D: number, d: number, z: number, vBA: number, RT: number): number {
	const alpha = (z * vBA * F) / RT;
	const expAlpha = Math.exp(-alpha);
	const deno = -Math.expm1(-alpha);
	return -((D * alpha) / d) * ((cB - cA * expAlpha) / deno);
}
