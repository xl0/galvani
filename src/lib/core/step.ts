import type { Mesh } from './mesh';
import type { Ion, Params } from './params';
import { F, R } from './params';
import type { SimState } from './state';
import { updateV } from './state';
import { runChannel, type ChannelInstance } from './channels';
import type { Network } from './network';
import type { ErCalcium } from './calcium';

/**
 * BETSE parity notes: BETSE adds 1e-25 in place to the voltage array in
 * electroflux(), so vm drifts by a few 1e-25 per step; we do the same so the
 * trajectories agree to round-off. Order of operations mirrors
 * Simulator._run_sim_core_loop for the ECM-off, full-solver case.
 */
export const NONCE = 1e-25;

// Harris et al. 1983 gap-junction gating constants (axolotl embryo).
const GJ_LAMB = 0.0013;
const GJ_A1 = 0.077;
const GJ_A2 = 0.14;

export class UnstableError extends Error {}

/** scratch for the Harris gating rates (module-level, sized to the mesh) */
let gjAlpha = new Float64Array(0);
let gjBeta = new Float64Array(0);

/** Advance the state by one forward-Euler step of length p.dt. */
export function step(mesh: Mesh, ions: Ion[], p: Params, s: SimState, channels: ChannelInstance[] = [], network: Network | null = null, calcium: ErCalcium | null = null): void {
	const { nMems, nCells } = mesh;
	const RT = R * p.T;
	const dt = p.dt;
	const nIons = ions.length;
	for (let i = 0; i < nIons; i++) {
		s.fluxesMem[i].fill(0);
		s.fluxesGj[i].fill(0);
	}
	s.iMem.fill(0);

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
			const fNa = -3 * s.nakBlock[m] * s.nakMod[m] * p.alphaNaK * fwd * (1 - Q / Keq);
			fNaArr[m] += fNa;
			fKArr[m] += -(2 / 3) * fNa;
			s.rateNaK[m] = -fNa;
		}
	} else {
		s.rateNaK.fill(0);
	}

	// ---- electrodiffusion across membranes and gap junctions -------------
	// Harris gating rates depend only on vgj, which is fixed within a step (the per-ion NONCE drift
	// cancels in the difference), so compute them once and reuse for each ion's implicit update.
	if (p.vSensitiveGj) {
		if (gjAlpha.length !== nMems) { gjAlpha = new Float64Array(nMems); gjBeta = new Float64Array(nMems); }
		const partner = mesh.memPartner;
		for (let m = 0; m < nMems; m++) {
			const V1 = 1e3 * Math.abs(s.vm[partner[m]] - s.vm[m]);
			gjAlpha[m] = GJ_LAMB * Math.exp(-GJ_A1 * (V1 - p.gjVthresh));
			const beta = GJ_LAMB * Math.exp(GJ_A2 * (V1 - p.gjVthresh));
			gjBeta[m] = beta / (1 + 50 * beta);
		}
	}
	const memToCell = mesh.memToCell, partner = mesh.memPartner, boundary = mesh.boundaryMems;
	for (let i = 0; i < nIons; i++) {
		const z = ions[i].z + NONCE;
		const cA = s.ccEnv[i];
		const cmem = s.ccAtMem[i];
		const Dm = s.Dm[i], vm = s.vm, tm = p.tm;
		const fmem = s.fluxesMem[i];
		for (let m = 0; m < nMems; m++) {
			vm[m] += NONCE;
			fmem[m] += ghkFlux(cA, cmem[m], Dm[m], tm, z, vm[m], RT);
		}

		// gap junctions
		for (let m = 0; m < nMems; m++) s.vgj[m] = s.vm[partner[m]] - s.vm[m];
		if (p.vSensitiveGj) {
			const dtms = dt * 1e3, gjMin = p.gjMin, gjOpen = s.gjOpen, gjBlock = s.gjBlock, gjMod = s.gjMod;
			for (let m = 0; m < nMems; m++) {
				const alpha = gjAlpha[m], beta = gjBeta[m];
				gjOpen[m] = ((gjOpen[m] + dtms * (alpha + beta * gjMin)) / (1 + alpha * dtms + beta * dtms)) * gjBlock[m] * gjMod[m];
			}
		} else {
			for (let m = 0; m < nMems; m++) s.gjOpen[m] = s.gjBlock[m] * s.gjMod[m] * mesh.gjWeights[m];
		}
		const Dgj = s.Dgj[i], gjOpen = s.gjOpen, vgjArr = s.vgj, gjSurface = p.gjSurface, gjLen = mesh.gjLen;
		const fgj = s.fluxesGj[i];
		for (let m = 0; m < nMems; m++) {
			fgj[m] += ghkFlux(cmem[m], cmem[partner[m]], Dgj[m] * gjSurface * gjOpen[m], gjLen, z, vgjArr[m] + NONCE, RT);
		}
		for (let k = 0; k < boundary.length; k++) fgj[boundary[k]] = 0;

		// concentration at membranes := cell-centre value (BETSE update_intra)
		const cc = s.ccCells[i];
		for (let m = 0; m < nMems; m++) cmem[m] = cc[memToCell[m]];
	}

	// ---- Ca-ATPase pump (BETSE ca_handler): flux queued like the Na/K pump --
	const iCa = ions.findIndex((x) => x.name === 'Ca');
	if (iCa >= 0 && p.alphaCa > 0) {
		const cmem = s.ccAtMem[iCa];
		for (let m = 0; m < nMems; m++) if (cmem[m] < 0) cmem[m] = 0;
		if (s.ccEnv[iCa] < 0) s.ccEnv[iCa] = 0;
		const cCao = s.ccEnv[iCa];
		const atpKm = p.cATP / p.KmCa_ATP;
		const fCa = s.fluxesMem[iCa];
		for (let m = 0; m < nMems; m++) {
			const cCai = cmem[m];
			let Qden = p.cATP * cCai;
			if (Qden === 0) Qden = 1e-16;
			const Q = (p.cADP * p.cPi * cCao) / Qden;
			const Keq = Math.exp(-(p.deltaGATP / RT - (2 * F * s.vm[m]) / RT));
			const caKm = cCai / p.KmCa_Ca;
			const frwd = (caKm * atpKm) / ((1 + caKm) * (1 + atpKm));
			fCa[m] += -p.alphaCa * frwd * (1 - Q / Keq);
		}
	}

	// ---- voltage-gated channels (BETSE network run_loop_channels) --------
	network?.runChannelModulators(channels);
	for (const ch of channels) runChannel(ch, mesh, ions, p, s);
	// ---- substance network: modulators then growth/reactions/transport (BETSE run_loop) --
	if (network) {
		network.runModulators();
		network.run(s.t);
	}
	// ---- ER calcium store (own model; after the network so IP3 is current) --
	calcium?.run(s, p, network);

	// ---- apply fluxes to concentrations (BETSE update_all_concs) ---------
	for (let i = 0; i < nIons; i++) {
		const cc = s.ccCells[i];
		const cmem = s.ccAtMem[i];
		const fmem = s.fluxesMem[i];
		const fgj = s.fluxesGj[i];
		// membrane fluxes -> cells and bath
		const saOverVol = mesh.memSaOverVol, memSa = mesh.memSa, zF = ions[i].z * F, iMem = s.iMem;
		let envSum = 0;
		for (let m = 0; m < nMems; m++) {
			cc[memToCell[m]] += fmem[m] * saOverVol[m] * dt;
			envSum -= fmem[m] * memSa[m];
			iMem[m] += zF * fmem[m];
		}
		s.ccEnv[i] += (envSum / p.volEnv / nMems) * dt;
		for (let m = 0; m < nMems; m++) cmem[m] = cc[memToCell[m]];
		// gap-junction fluxes -> cells only
		for (let m = 0; m < nMems; m++) cc[memToCell[m]] -= fgj[m] * saOverVol[m] * dt;
		for (let c = 0; c < nCells; c++) {
			const v = cc[c];
			if (v !== v) throw new UnstableError(`NaN concentration of ${ions[i].name} at step ${s.step}`);
			if (v < 0) cc[c] = 0;
		}
	}

	updateV(mesh, ions, p, s);
	let vsum = 0;
	for (let m = 0; m < nMems; m++) vsum += s.vm[m];
	if (vsum !== vsum) throw new UnstableError(`NaN vm at step ${s.step}`);
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
	const em1 = Math.expm1(-alpha); // exp(-alpha) = 1 + em1; one transcendental instead of two
	return ((D * alpha) / d) * ((cB - cA * (1 + em1)) / em1);
}
