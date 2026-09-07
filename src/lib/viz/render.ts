import type { MeshGeom, Snapshot } from '$lib/sim/protocol';
import type { Ion } from '$lib/core/params';
import type { Profile } from '$lib/core/experiment';
import { colormapLut, type ColormapName } from './colormap';
import { fieldValues } from './fields';
import { si } from '$lib/format';

export interface ClusterStyle {
	colormap: ColormapName;
	range: [number, number];
	field: string;
	showMembranes: boolean;
	/** CSS colours resolved by the caller (theme-aware) */
	border: string;
	muted: string;
	foreground: string;
}

/** world -> screen for a geometry fitted into w x h with zoom/pan */
export function clusterTransform(g: MeshGeom, width: number, height: number, zoom = 1, panX = 0, panY = 0) {
	const [x0, y0, x1, y1] = g.bounds;
	const bw = x1 - x0, bh = y1 - y0;
	const scale = ((Math.min(width, height) * 0.94) / Math.max(bw, bh)) * zoom;
	const cx = width / 2 + panX, cy = height / 2 + panY;
	const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
	return { scale, toX: (x: number) => cx + (x - mx) * scale, toY: (y: number) => cy - (y - my) * scale, fromX: (sx: number) => mx + (sx - cx) / scale, fromY: (sy: number) => my - (sy - cy) / scale };
}

/** The field picture: env heatmap or bath tint, cell polygons, optional per-membrane colouring, region outlines, scale bar. */
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function drawCluster(ctx: Ctx, g: MeshGeom, s: Snapshot, ions: Ion[], profiles: Profile[], width: number, height: number, st: ClusterStyle, xf = clusterTransform(g, width, height)): void {
	const { toX, toY, scale } = xf;
	const lut = colormapLut(st.colormap);
	const [lo, hi] = st.range;
	const values = fieldValues(s, g, ions, st.field, false);
	const memValues = st.showMembranes ? fieldValues(s, g, ions, st.field, true) : null;
	const bi = ions.findIndex((x) => x.name === st.field);
	const bsub = st.field.startsWith('S:') ? s.subs.find((x) => x.name === st.field.slice(2)) : undefined;
	const env = s.env;
	if (env && (bi >= 0 || st.field === 'vm' || st.field === 'venv')) {
		const n = env.nx * env.ny, off = bi >= 0 ? bi * n : 0;
		const px = env.delta * scale + 0.5;
		ctx.globalAlpha = 0.55;
		for (let i = 0; i < env.ny; i++) for (let j = 0; j < env.nx; j++) {
			const k = i * env.nx + j;
			const v = bi >= 0 ? env.cc[off + k] : env.v[k] * 1e3;
			const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
			ctx.fillStyle = lut[Math.round(t * 255)];
			ctx.fillRect(toX(env.xmin + j * env.delta), toY(env.ymin + (i + 1) * env.delta), px, px);
		}
		ctx.globalAlpha = 1;
	} else {
		const bathVal = bi >= 0 ? s.ccEnv[bi] : bsub ? bsub.env : null;
		if (bathVal !== null) {
			const t = Math.min(1, Math.max(0, (bathVal - lo) / (hi - lo)));
			ctx.globalAlpha = 0.35; ctx.fillStyle = lut[Math.round(t * 255)]; ctx.fillRect(0, 0, width, height); ctx.globalAlpha = 1;
		}
	}
	ctx.lineWidth = Math.max(0.5, scale * 2e-7);
	const neutral = st.field === 'venv';
	for (let c = 0; c < g.nCells; c++) {
		const a = g.vertStart[c], b = g.vertStart[c + 1];
		ctx.beginPath();
		ctx.moveTo(toX(g.verts[2 * a]), toY(g.verts[2 * a + 1]));
		for (let i = a + 1; i < b; i++) ctx.lineTo(toX(g.verts[2 * i]), toY(g.verts[2 * i + 1]));
		ctx.closePath();
		const v = values ? values[c] : NaN;
		const t = Number.isFinite(v) ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0;
		ctx.fillStyle = values && !neutral ? lut[Math.round(t * 255)] : st.muted;
		ctx.fill();
		ctx.strokeStyle = st.border;
		ctx.stroke();
	}
	if (memValues) {
		ctx.lineCap = 'butt';
		ctx.lineWidth = Math.max(2, scale * 1.2e-6);
		for (let m = 0; m < g.nMems; m++) {
			const c = g.memToCell[m], a = g.vertStart[c], b = g.vertStart[c + 1], m2 = m + 1 < b ? m + 1 : a;
			const t = Math.min(1, Math.max(0, (memValues[m] - lo) / (hi - lo)));
			ctx.strokeStyle = lut[Math.round(t * 255)];
			ctx.beginPath(); ctx.moveTo(toX(g.verts[2 * m]), toY(g.verts[2 * m + 1])); ctx.lineTo(toX(g.verts[2 * m2]), toY(g.verts[2 * m2 + 1])); ctx.stroke();
		}
	}
	for (const p of profiles) {
		ctx.strokeStyle = p.color; ctx.lineWidth = 1.5;
		for (const c of p.cells) {
			if (c >= g.nCells) continue;
			const a = g.vertStart[c], b = g.vertStart[c + 1];
			ctx.beginPath(); ctx.moveTo(toX(g.verts[2 * a]), toY(g.verts[2 * a + 1]));
			for (let i = a + 1; i < b; i++) ctx.lineTo(toX(g.verts[2 * i]), toY(g.verts[2 * i + 1]));
			ctx.closePath(); ctx.stroke();
		}
	}
	// scale bar: a round length (1, 2, 5 × 10^k µm) spanning 60–150 px, bottom right
	let L = 10 ** Math.floor(Math.log10(100 / scale));
	for (const f of [1, 2, 5, 10]) if (L * f * scale >= 60) { L *= f; break; }
	const px = L * scale, x1 = width - 12, y = height - 14;
	ctx.strokeStyle = st.foreground; ctx.fillStyle = st.foreground; ctx.lineWidth = 2;
	ctx.beginPath(); ctx.moveTo(x1 - px, y); ctx.lineTo(x1, y); ctx.stroke();
	ctx.beginPath(); ctx.moveTo(x1 - px, y - 4); ctx.lineTo(x1 - px, y + 4); ctx.moveTo(x1, y - 4); ctx.lineTo(x1, y + 4); ctx.stroke();
	ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'right';
	ctx.fillText(L >= 1e-3 ? `${+(L * 1e3).toPrecision(2)} mm` : `${+(L * 1e6).toPrecision(2)} µm`, x1, y - 6);
}

/** horizontal colour bar with min/max labels */
export function drawColorbar(ctx: Ctx, x: number, y: number, w: number, h: number, colormap: ColormapName, range: [number, number], label: string, fg: string): void {
	const lut = colormapLut(colormap);
	for (let i = 0; i < w; i++) { ctx.fillStyle = lut[Math.round((i / Math.max(1, w - 1)) * 255)]; ctx.fillRect(x + i, y, 1, h); }
	ctx.fillStyle = fg; ctx.font = '11px ui-monospace, monospace';
	ctx.textAlign = 'left'; ctx.fillText(fmtNum(range[0]), x, y + h + 12);
	ctx.textAlign = 'right'; ctx.fillText(fmtNum(range[1]), x + w, y + h + 12);
	ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y - 4);
}

/** probe markers (dot + cell index) at the cell centres */
export function drawProbes(ctx: Ctx, g: MeshGeom, probes: number[], colors: Record<number, string>, xf: ReturnType<typeof clusterTransform>, fg: string): void {
	ctx.font = '10px ui-monospace, monospace'; ctx.textAlign = 'left';
	for (const c of probes) {
		if (c >= g.nCells) continue;
		const x = xf.toX(g.cellCentres[2 * c]), y = xf.toY(g.cellCentres[2 * c + 1]);
		ctx.fillStyle = colors[c] ?? '#888';
		ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fill();
		ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
		ctx.fillStyle = fg; ctx.fillText(String(c), x + 6, y - 4);
	}
}

/** simple multi-series line chart with a time cursor, axes and a label; series share the y axis */
export function drawTraceStrip(ctx: Ctx, x: number, y: number, w: number, h: number, t: ArrayLike<number>, series: { color: string; y: (number | null)[]; dash?: number[] }[], tRange: [number, number], cursorT: number, label: string, fg: string, grid: string): void {
	const padL = 52, padB = 16, padT = 14;
	const x0 = x + padL, x1 = x + w - 8, y0 = y + padT, y1 = y + h - padB;
	let lo = Infinity, hi = -Infinity;
	for (const s of series) for (const v of s.y) if (v !== null && Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
	if (!(hi > lo)) { lo = Number.isFinite(lo) ? lo - 1 : 0; hi = lo + 2; }
	const m = (hi - lo) * 0.05; lo -= m; hi += m;
	const X = (tt: number) => x0 + ((tt - tRange[0]) / (tRange[1] - tRange[0])) * (x1 - x0);
	const Y = (v: number) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
	ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = fg; ctx.font = '10px ui-monospace, monospace';
	ctx.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0, y1 - y0);
	ctx.textAlign = 'right'; ctx.fillText(fmtNum(hi), x0 - 4, y0 + 4); ctx.fillText(fmtNum(lo), x0 - 4, y1 + 3);
	ctx.textAlign = 'left'; ctx.fillText(label, x0 + 4, y0 - 3);
	ctx.textAlign = 'left'; ctx.fillText(si(tRange[0], 's'), x0, y1 + 12); ctx.textAlign = 'right'; ctx.fillText(si(tRange[1], 's'), x1, y1 + 12);
	ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
	for (const s of series) {
		ctx.strokeStyle = s.color; ctx.lineWidth = 1.5; ctx.setLineDash(s.dash ?? []);
		ctx.beginPath(); let pen = false;
		const n = Math.min(t.length, s.y.length), stride = Math.max(1, Math.floor(n / (2 * (x1 - x0))));
		for (let j = 0; j < n; j += stride) { const v = s.y[j]; if (v === null || !Number.isFinite(v)) { pen = false; continue; } const px = X(t[j]), py = Y(v); if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; } }
		ctx.stroke(); ctx.setLineDash([]);
	}
	ctx.restore();
	const cx = Math.round(X(cursorT)) + 0.5;
	ctx.strokeStyle = fg; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y1); ctx.stroke(); ctx.setLineDash([]);
}

function fmtNum(v: number): string {
	if (v === 0) return '0';
	const a = Math.abs(v);
	if (a >= 1e4 || a < 1e-2) return v.toExponential(1);
	return String(+v.toPrecision(4));
}
