/**
 * Seeded 2D cell-cluster generator: jittered hex lattice -> Voronoi -> keep
 * cells inside a circular mask -> shrink polygons to open a gap between cells.
 * Mirrors BETSE's world construction in spirit; not numerically identical.
 */
import { Delaunay } from 'd3-delaunay';
import { finishMesh, type Mesh } from './mesh';

export interface GeneratorConfig {
	seed: number;
	/** square world side [m] */
	worldSize: number;
	/** nominal cell radius [m]; lattice spacing = 2 * cellRadius */
	cellRadius: number;
	/** cell height for volumes/areas [m] */
	cellHeight: number;
	/** gap between neighbouring cells [m]; also the gap-junction length */
	cellSpacing: number;
	/** 0..1, fraction of lattice spacing used as random jitter */
	disorder: number;
	/** polygon shrink factor toward centroid (BETSE scale_cell) */
	scaleCell: number;
	/** keep cells whose centre lies within this radius of the world centre [m] */
	clipRadius: number;
}

export const defaultGenerator: GeneratorConfig = {
	seed: 1,
	worldSize: 150e-6,
	cellRadius: 5e-6,
	cellHeight: 10e-6,
	cellSpacing: 26e-9,
	disorder: 0.4,
	scaleCell: 0.99,
	clipRadius: 65e-6
};

/** mulberry32 PRNG: deterministic across platforms */
export function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function generateMesh(cfg: GeneratorConfig): Mesh {
	const rand = rng(cfg.seed);
	const W = cfg.worldSize;
	const dx = 2 * cfg.cellRadius;
	const dy = dx * Math.sqrt(3) / 2;
	const nx = Math.floor(W / dx) + 2;
	const ny = Math.floor(W / dy) + 2;
	const pts: number[] = [];
	for (let j = 0; j < ny; j++) {
		for (let i = 0; i < nx; i++) {
			const x = (i + (j % 2) * 0.5) * dx + (rand() - 0.5) * cfg.disorder * dx;
			const y = j * dy + (rand() - 0.5) * cfg.disorder * dx;
			pts.push(x, y);
		}
	}
	// d3-delaunay clips in absolute float tolerance; work in micrometres and scale back.
	const S = 1e6;
	const delaunay = new Delaunay(Float64Array.from(pts, (v) => v * S));
	const voronoi = delaunay.voronoi([-W * S, -W * S, 2 * W * S, 2 * W * S]);
	const nPts = pts.length / 2;

	// keep points inside the mask; a point's polygon must be finite (inside bounds)
	const cx = W / 2, cy = W / 2;
	const keep = new Int32Array(nPts).fill(-1);
	const kept: number[] = [];
	for (let i = 0; i < nPts; i++) {
		const x = pts[2 * i], y = pts[2 * i + 1];
		if ((x - cx) ** 2 + (y - cy) ** 2 <= cfg.clipRadius ** 2 && voronoi.contains(i, x * S, y * S)) {
			keep[i] = kept.length;
			kept.push(i);
		}
	}
	const nCells = kept.length;

	// raw polygons (unshrunk) and edge midpoint keys for partner matching
	const polys: number[][][] = kept.map((i) => {
		const poly = voronoi.cellPolygon(i)!;
		poly.pop(); // d3 closes the ring; drop the duplicate
		return poly.map(([x, y]) => [x / S, y / S]);
	});
	const key = (ax: number, ay: number, bx: number, by: number) =>
		`${((ax + bx) / 2).toPrecision(12)},${((ay + by) / 2).toPrecision(12)}`;
	const edgeOwner = new Map<string, [number, number][]>();
	polys.forEach((poly, c) => {
		for (let k = 0; k < poly.length; k++) {
			const a = poly[k], b = poly[(k + 1) % poly.length];
			const kk = key(a[0], a[1], b[0], b[1]);
			const list = edgeOwner.get(kk) ?? [];
			list.push([c, k]);
			edgeOwner.set(kk, list);
		}
	});

	// membranes: one per polygon edge, indexed cell-major
	const memStart = new Int32Array(nCells + 1);
	for (let c = 0; c < nCells; c++) memStart[c + 1] = memStart[c] + polys[c].length;
	const nMems = memStart[nCells];
	const cellCentres = new Float64Array(2 * nCells);
	const verts = new Float64Array(2 * nMems);
	const memMids = new Float64Array(2 * nMems);
	const memNormals = new Float64Array(2 * nMems);
	const memSa = new Float64Array(nMems);
	const rRads = new Float64Array(nMems);
	const memToCell = new Int32Array(nMems);
	const memPartner = new Int32Array(nMems);
	const boundary: number[] = [];

	polys.forEach((poly, c) => {
		// centroid of the raw polygon
		let sx = 0, sy = 0;
		for (const [x, y] of poly) (sx += x), (sy += y);
		const gx = sx / poly.length, gy = sy / poly.length;
		cellCentres[2 * c] = gx;
		cellCentres[2 * c + 1] = gy;
		const n = poly.length;
		for (let k = 0; k < n; k++) {
			const m = memStart[c] + k;
			const a = poly[k], b = poly[(k + 1) % n];
			// shrunk vertices
			const ax = gx + (a[0] - gx) * cfg.scaleCell, ay = gy + (a[1] - gy) * cfg.scaleCell;
			const bx = gx + (b[0] - gx) * cfg.scaleCell, by = gy + (b[1] - gy) * cfg.scaleCell;
			verts[2 * m] = ax;
			verts[2 * m + 1] = ay;
			const mx = (ax + bx) / 2, my = (ay + by) / 2;
			memMids[2 * m] = mx;
			memMids[2 * m + 1] = my;
			const ex = bx - ax, ey = by - ay;
			const len = Math.hypot(ex, ey);
			// outward normal: rotate edge; polygons from d3 are counter-clockwise in y-up,
			// so pick the sign that points away from the centroid.
			let nxv = ey / len, nyv = -ex / len;
			if ((mx - gx) * nxv + (my - gy) * nyv < 0) (nxv = -nxv), (nyv = -nyv);
			memNormals[2 * m] = nxv;
			memNormals[2 * m + 1] = nyv;
			memSa[m] = len * cfg.cellHeight;
			rRads[m] = Math.hypot(mx - gx, my - gy);
			memToCell[m] = c;
			// partner: the other owner of the same raw edge
			const owners = edgeOwner.get(key(a[0], a[1], b[0], b[1]))!;
			const other = owners.find(([oc]) => oc !== c);
			if (other) memPartner[m] = memStart[other[0]] + other[1];
			else {
				memPartner[m] = m;
				boundary.push(m);
			}
		}
	});

	return finishMesh({
		dim: 2,
		nCells,
		nMems,
		cellCentres,
		verts,
		vertStart: memStart,
		memMids,
		memNormals,
		memSa,
		rRads,
		memToCell,
		memPartner,
		boundaryMems: Int32Array.from(boundary),
		gjLen: cfg.cellSpacing,
		gjWeights: new Float64Array(nMems).fill(1)
	});
}
