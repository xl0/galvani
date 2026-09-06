import type { Mesh } from './mesh';
import type { Ion, Params } from './params';
import { F } from './params';
import type { SimState } from './state';

/**
 * Extracellular spaces, ported from BETSE ("simulate extracellular spaces", full solver,
 * no fluid flow / deformation). The environment is a square finite-difference grid of
 * nx × ny cells over the world; each membrane midpoint and cell centre maps to its
 * nearest grid square. Per ion the grid holds a concentration that (a) receives the
 * membrane fluxes of the membranes mapped to each square, (b) electrodiffuses across
 * the grid (Nernst–Planck with the environmental field), and (c) is clamped to the
 * bath value along the four world edges every step. The environmental voltage comes
 * from the net charge of the squares touching membranes (Debye-screened surface
 * charge, Gaussian-smoothed) plus a Laplace solution for any voltage applied at the
 * edges; its gradient drives the electrodiffusion and the edge voltage offsets Vm.
 * Tight and adherens junctions scale the grid diffusivity around the cluster.
 * Finite-difference helpers replicate BETSE's `finitediff` exactly, quirks included.
 */

/** BETSE physical constants used only by the environment code (it mixes q/kb with F/R). */
export const Q_E = 1.602e-19, KB = 1.3806e-23, NAV = 6.022e23, EPS0 = 8.854e-12, EPS_R = 80.0;

export interface EcmConfig {
	/** grid squares per side (BETSE "comp grid size") */
	gridSize: number;
	/** tight junction scaling of free diffusion at the cluster boundary (1 = none, 0.05 = tight) */
	tjScale: number;
	/** adherens junction scaling inside the cluster */
	adhScale: number;
	/** per-ion relative tight-junction permeability */
	tjRel: Record<string, number>;
}

export const defaultEcm: EcmConfig = { gridSize: 25, tjScale: 1, adhScale: 1, tjRel: {} };

/** Static grid geometry and per-ion diffusivity maps. Index k = i * nx + j (row i along y). */
export interface Ecm {
	nx: number;
	ny: number;
	delta: number;
	xmin: number;
	ymin: number;
	cellHeight: number;
	mapMem2Ecm: Int32Array;
	mapCell2Ecm: Int32Array;
	/** total membrane area mapped into each square [m2] */
	memSaPerSquare: Float64Array;
	/** grid diffusivity per ion [m2/s] */
	Denv: Float64Array[];
	/** bath concentration held at the world edges, per ion [mol/m3] */
	cBound: Float64Array;
	/** inverse Debye length of the bath [1/m] and the derived field screening factor */
	koEnv: number;
	screen: number;
	/** mean membrane area of the squares that membranes map to (BETSE's surface-charge normaliser) */
	memSaMean: number;
	T: number;
	cellRadius: number;
	trueCellSize: number;
	/** voltage applied at the world edges [V]: top, bottom, left, right */
	boundV: { T: number; B: number; L: number; R: number };
}

/** Per-ion grid concentrations and the environmental voltage / field. */
export interface EcmState {
	grid: Ecm;
	cc: Float64Array[];
	vEnv: Float64Array;
	eEnvX: Float64Array;
	eEnvY: Float64Array;
	/** Laplace solution for the edge voltages (zero unless a voltage is applied) */
	phiB: Float64Array;
}

export function buildEcm(mesh: Mesh, ions: Ion[], cfg: EcmConfig, bounds: [number, number, number, number], cellHeight: number, cellRadius: number, T: number, trueCellSize = 1e-5): Ecm {
	const [xmin, xmax, ymin, ymax] = bounds;
	const delta = (xmax - xmin) / cfg.gridSize;
	const nx = Math.trunc((xmax - xmin) / delta), ny = Math.trunc((ymax - ymin) / delta);
	const n = nx * ny;
	// square centres, BETSE order: row i (y) then column j (x); vertex lines from linspace
	const cx = (j: number) => xmin + ((xmax - xmin) * j) / nx + ((xmax - xmin) / nx) / 2;
	const cy = (i: number) => ymin + ((ymax - ymin) * i) / ny + ((ymax - ymin) / ny) / 2;
	const nearest = (x: number, y: number) => {
		let best = 0, bd = Infinity;
		for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) { const d = (cx(j) - x) ** 2 + (cy(i) - y) ** 2; if (d < bd) { bd = d; best = i * nx + j; } }
		return best;
	};
	const mapMem2Ecm = new Int32Array(mesh.nMems), mapCell2Ecm = new Int32Array(mesh.nCells);
	for (let m = 0; m < mesh.nMems; m++) mapMem2Ecm[m] = nearest(mesh.memMids[2 * m], mesh.memMids[2 * m + 1]);
	for (let c = 0; c < mesh.nCells; c++) mapCell2Ecm[c] = nearest(mesh.cellCentres[2 * c], mesh.cellCentres[2 * c + 1]);
	const memSaPerSquare = new Float64Array(n);
	for (let m = 0; m < mesh.nMems; m++) memSaPerSquare[mapMem2Ecm[m]] += mesh.memSa[m];
	// tight-junction squares: all membranes of boundary cells, of their neighbours, and the boundary cells' own squares
	const boundaryCell = new Uint8Array(mesh.nCells);
	for (const m of mesh.boundaryMems) boundaryCell[mesh.memToCell[m]] = 1;
	const neighCell = new Uint8Array(mesh.nCells);
	for (let m = 0; m < mesh.nMems; m++) if (boundaryCell[mesh.memToCell[m]] && mesh.memPartner[m] !== m) neighCell[mesh.memToCell[mesh.memPartner[m]]] = 1;
	const tj = new Uint8Array(n);
	for (let m = 0; m < mesh.nMems; m++) { const c = mesh.memToCell[m]; if (boundaryCell[c] || neighCell[c]) tj[mapMem2Ecm[m]] = 1; }
	for (let c = 0; c < mesh.nCells; c++) if (boundaryCell[c]) tj[mapCell2Ecm[c]] = 1;
	const Denv = ions.map((ion) => {
		const D = new Float64Array(n).fill(ion.Dfree);
		for (let k = 0; k < n; k++) { if (memSaPerSquare[k] > 0) D[k] = ion.Dfree * cfg.adhScale; if (tj[k]) D[k] = ion.Dfree * cfg.tjScale * (cfg.tjRel[ion.name] ?? 1); }
		return D;
	});
	// inverse Debye length from the bath composition (BETSE ko_env; refined from the grid by setScreening)
	let ko2 = 0;
	for (const ion of ions) ko2 += (NAV * Q_E * Q_E * ion.z * ion.z * ion.cEnv) / (EPS_R * EPS0 * KB * T);
	const koEnv = Math.sqrt(ko2);
	let memSaMean = 0;
	for (let m = 0; m < mesh.nMems; m++) memSaMean += memSaPerSquare[mapMem2Ecm[m]];
	memSaMean /= mesh.nMems;
	return {
		nx, ny, delta, xmin, ymin, cellHeight, mapMem2Ecm, mapCell2Ecm, memSaPerSquare, Denv,
		cBound: Float64Array.from(ions, (i) => i.cEnv), koEnv, screen: (2 / (koEnv * delta)) * (cellRadius / trueCellSize), memSaMean,
		T, cellRadius, trueCellSize,
		boundV: { T: 0, B: 0, L: 0, R: 0 }
	};
}

/** BETSE fixes ko_env at the start of a phase from the grid as it is then: mean over squares of the local inverse Debye length. */
export function setScreening(e: EcmState, ions: Ion[]): void {
	const g = e.grid, n = g.nx * g.ny;
	let sum = 0;
	for (let k = 0; k < n; k++) { let ko2 = 0; for (let i = 0; i < ions.length; i++) ko2 += (NAV * Q_E * Q_E * ions[i].z * ions[i].z * e.cc[i][k]) / (EPS_R * EPS0 * KB * g.T); sum += Math.sqrt(ko2); }
	g.koEnv = sum / n;
	g.screen = (2 / (g.koEnv * g.delta)) * (g.cellRadius / g.trueCellSize);
}

export function createEcmState(grid: Ecm, ions: Ion[]): EcmState {
	const n = grid.nx * grid.ny;
	return { grid, cc: ions.map((i) => new Float64Array(n).fill(i.cEnv)), vEnv: new Float64Array(n), eEnvX: new Float64Array(n), eEnvY: new Float64Array(n), phiB: new Float64Array(n) };
}

// ---- BETSE finitediff replicas (grid F[i * nx + j], i along y) --------------------

/** central differences inside, one-sided at the edges (BETSE fd.gradient) */
function gradient(F: Float64Array, nx: number, ny: number, d: number, gx: Float64Array, gy: Float64Array): void {
	for (let i = 0; i < ny; i++) {
		for (let j = 0; j < nx; j++) {
			const k = i * nx + j;
			gx[k] = j === 0 ? (F[k + 1] - F[k]) / d : j === nx - 1 ? (F[k] - F[k - 1]) / d : (F[k + 1] - F[k - 1]) / (2 * d);
			gy[k] = i === 0 ? (F[k + nx] - F[k]) / d : i === ny - 1 ? (F[k] - F[k - nx]) / d : (F[k + nx] - F[k - nx]) / (2 * d);
		}
	}
}

/** BETSE fd.divergence: central inside; at the edges the one-sided differences carry the opposite sign (kept for parity) */
function divergence(Fx: Float64Array, Fy: Float64Array, nx: number, ny: number, d: number, out: Float64Array): void {
	for (let i = 0; i < ny; i++) {
		for (let j = 0; j < nx; j++) {
			const k = i * nx + j;
			const dx = j === 0 ? (Fx[k] - Fx[k + 1]) / d : j === nx - 1 ? (Fx[k - 1] - Fx[k]) / d : (Fx[k + 1] - Fx[k - 1]) / (2 * d);
			const dy = i === 0 ? -(Fy[k + nx] - Fy[k]) / d : i === ny - 1 ? -(Fy[k] - Fy[k - nx]) / d : (Fy[k + nx] - Fy[k - nx]) / (2 * d);
			out[k] = dx + dy;
		}
	}
}

/** scipy.ndimage.gaussian_filter(sigma=1, mode='constant', cval=0): separable, kernel radius 4 */
const GK = (() => { const w = Array.from({ length: 9 }, (_, i) => Math.exp(-0.5 * (i - 4) ** 2)); const s = w.reduce((a, b) => a + b, 0); return w.map((x) => x / s); })();
function gaussian(F: Float64Array, nx: number, ny: number, tmp: Float64Array, out: Float64Array): void {
	for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) { let a = 0; for (let t = -4; t <= 4; t++) { const jj = j + t; if (jj >= 0 && jj < nx) a += GK[t + 4] * F[i * nx + jj]; } tmp[i * nx + j] = a; }
	for (let i = 0; i < ny; i++) for (let j = 0; j < nx; j++) { let a = 0; for (let t = -4; t <= 4; t++) { const ii = i + t; if (ii >= 0 && ii < ny) a += GK[t + 4] * tmp[ii * nx + j]; } out[i * nx + j] = a; }
}

// ---- per-step operations ------------------------------------------------------

let gcx = new Float64Array(0), gcy = new Float64Array(0), fx = new Float64Array(0), fy = new Float64Array(0), div = new Float64Array(0), tmp = new Float64Array(0);
function scratch(n: number): void {
	if (gcx.length !== n) { gcx = new Float64Array(n); gcy = new Float64Array(n); fx = new Float64Array(n); fy = new Float64Array(n); div = new Float64Array(n); tmp = new Float64Array(n); }
}

/** BETSE update_ecm: clamp the edges to the bath, electrodiffuse one ion across the grid. */
export function updateEnvIon(e: EcmState, i: number, z: number, p: Params): void {
	const { nx, ny, delta } = e.grid, n = nx * ny, c = e.cc[i], D = e.grid.Denv[i], cb = e.grid.cBound[i];
	scratch(n);
	for (let i2 = 0; i2 < ny; i2++) { c[i2 * nx] = cb; c[i2 * nx + nx - 1] = cb; }
	for (let j = 0; j < nx; j++) { c[j] = cb; c[(ny - 1) * nx + j] = cb; }
	gradient(c, nx, ny, delta, gcx, gcy);
	const zq = (z * Q_E) / (KB * p.T);
	// Nernst–Planck with gv = -E: f = -D grad c + (D z q / kT) E c
	for (let k = 0; k < n; k++) { const a = D[k] * zq; fx[k] = -D[k] * gcx[k] + a * e.eEnvX[k] * c[k]; fy[k] = -D[k] * gcy[k] + a * e.eEnvY[k] * c[k]; }
	for (let k = 0; k < n; k++) { fx[k] = -fx[k]; fy[k] = -fy[k]; }
	divergence(fx, fy, nx, ny, delta, div);
	for (let k = 0; k < n; k++) c[k] += div[k] * p.dt;
}

/** BETSE update_Co / div_env: membrane flux (positive into the cell) leaves the mapped grid square. */
export function applyMemFluxToEnv(e: EcmState, i: number, flux: Float64Array, mesh: Mesh, dt: number): void {
	const { mapMem2Ecm, delta, cellHeight } = e.grid, c = e.cc[i], inv = dt / (cellHeight * delta * delta);
	for (let m = 0; m < mesh.nMems; m++) c[mapMem2Ecm[m]] -= flux[m] * mesh.memSa[m] * inv;
}

/** BETSE get_current, environment part: voltage from screened surface charge, smoothed, plus the edge-voltage solution; field = -grad(screen * v). */
export function updateEnvVoltage(e: EcmState, ions: Ion[], mesh: Mesh): void {
	const g = e.grid, { nx, ny, delta } = g, n = nx * ny;
	scratch(n);
	div.fill(0);
	for (let i = 0; i < ions.length; i++) { const zF = ions[i].z * F, c = e.cc[i]; for (let k = 0; k < n; k++) div[k] += zF * c[k]; }
	const surf = (g.cellHeight * delta * delta) / g.memSaMean, cedl = g.koEnv * EPS0 * EPS_R;
	tmp.fill(0);
	for (let m = 0; m < mesh.nMems; m++) { const k = g.mapMem2Ecm[m]; tmp[k] = (div[k] * surf) / cedl; }
	gaussian(tmp, nx, ny, fx, e.vEnv);
	for (let k = 0; k < n; k++) e.vEnv[k] += e.phiB[k];
	for (let k = 0; k < n; k++) fy[k] = g.screen * e.vEnv[k];
	gradient(fy, nx, ny, delta, e.eEnvX, e.eEnvY);
	for (let k = 0; k < n; k++) { e.eEnvX[k] = -e.eEnvX[k]; e.eEnvY[k] = -e.eEnvY[k]; }
}

/** BETSE toolbox.pulse: logistic on/off with 0→1 transition time `rate` (slope 10/rate). */
export function pulse(t: number, on: number, off: number, rate: number): number {
	const g = 10 / rate;
	return 1 / (1 + Math.exp(-g * (t - on))) - 1 / (1 + Math.exp(-g * (t - off)));
}

/**
 * Laplace's equation on the grid with the edge voltages as Dirichlet values (BETSE lapENVinv · rhs).
 * Gauss–Seidel with over-relaxation, iterated to round-off; all zeros when no voltage is applied.
 */
export function solvePhiB(e: EcmState): void {
	const g = e.grid, { nx, ny } = g, { T, B, L, R } = g.boundV, phi = e.phiB;
	if (T === 0 && B === 0 && L === 0 && R === 0) { phi.fill(0); return; }
	// BETSE assigns the left/right columns first, then the bottom/top rows, so corners take the row values
	for (let i = 0; i < ny; i++) { phi[i * nx] = L; phi[i * nx + nx - 1] = R; }
	for (let j = 0; j < nx; j++) { phi[j] = B; phi[(ny - 1) * nx + j] = T; }
	const w = 2 / (1 + Math.sin(Math.PI / Math.max(nx, ny)));
	for (let it = 0; it < 20000; it++) {
		let maxd = 0;
		for (let i = 1; i < ny - 1; i++) for (let j = 1; j < nx - 1; j++) {
			const k = i * nx + j;
			const v = 0.25 * (phi[k - 1] + phi[k + 1] + phi[k - nx] + phi[k + nx]);
			const d = w * (v - phi[k]);
			phi[k] += d;
			if (Math.abs(d) > maxd) maxd = Math.abs(d);
		}
		if (maxd < 1e-16) break;
	}
}
