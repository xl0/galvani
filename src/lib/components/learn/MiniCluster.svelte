<script lang="ts">
	/** Draws a small mesh coloured by a per-cell value; click reports the cell. */
	import type { Mesh } from '$lib/core/mesh';
	import { colormapLut } from '$lib/viz/colormap';
	let { mesh, values, range, height = 120, onclick = undefined as ((cell: number) => void) | undefined, labels = false, env = undefined as { nx: number; ny: number; xmin: number; ymin: number; delta: number; values: ArrayLike<number>; range: [number, number] } | undefined, neutral = false }:
		{ mesh: Mesh; values: ArrayLike<number>; range: [number, number]; height?: number; onclick?: (cell: number) => void; labels?: boolean;
		  /** extracellular grid drawn behind the cells on its own range */
		  env?: { nx: number; ny: number; xmin: number; ymin: number; delta: number; values: ArrayLike<number>; range: [number, number] };
		  /** draw cells uncoloured (the grid is the field) */
		  neutral?: boolean } = $props();
	let wrap: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let width = $state(400);
	const lut = colormapLut('viridis');
	const css = (n: string) => getComputedStyle(wrap).getPropertyValue(n).trim();
	function xf() {
		let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
		for (let i = 0; i < mesh.verts.length; i += 2) { xmin = Math.min(xmin, mesh.verts[i]); xmax = Math.max(xmax, mesh.verts[i]); ymin = Math.min(ymin, mesh.verts[i + 1]); ymax = Math.max(ymax, mesh.verts[i + 1]); }
		if (env) { xmin = Math.min(xmin, env.xmin); ymin = Math.min(ymin, env.ymin); xmax = Math.max(xmax, env.xmin + env.nx * env.delta); ymax = Math.max(ymax, env.ymin + env.ny * env.delta); }
		const s = Math.min((width - 16) / (xmax - xmin), (height - 16) / (ymax - ymin));
		const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
		return { X: (x: number) => width / 2 + (x - cx) * s, Y: (y: number) => height / 2 - (y - cy) * s };
	}
	function draw() {
		if (!canvas || !wrap) return;
		const dpr = devicePixelRatio || 1;
		canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
		const ctx = canvas.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, width, height);
		const { X, Y } = xf();
		if (env) {
			const px = X(env.delta) - X(0) + 0.5;
			for (let i = 0; i < env.ny; i++) for (let j = 0; j < env.nx; j++) {
				const t = Math.min(1, Math.max(0, (env.values[i * env.nx + j] - env.range[0]) / (env.range[1] - env.range[0])));
				ctx.fillStyle = lut[Math.round(t * 255)];
				ctx.fillRect(X(env.xmin + j * env.delta), Y(env.ymin + (i + 1) * env.delta), px, px);
			}
		}
		ctx.strokeStyle = css('--border'); ctx.lineWidth = 1; ctx.font = '10px ui-monospace, monospace';
		for (let c = 0; c < mesh.nCells; c++) {
			const a = mesh.vertStart[c], b = mesh.vertStart[c + 1];
			ctx.beginPath(); ctx.moveTo(X(mesh.verts[2 * a]), Y(mesh.verts[2 * a + 1]));
			for (let i = a + 1; i < b; i++) ctx.lineTo(X(mesh.verts[2 * i]), Y(mesh.verts[2 * i + 1]));
			ctx.closePath();
			const t = Math.min(1, Math.max(0, (values[c] - range[0]) / (range[1] - range[0])));
			ctx.fillStyle = neutral ? css('--muted') : lut[Math.round(t * 255)]; ctx.fill(); ctx.stroke();
			if (labels) { ctx.fillStyle = t > 0.6 ? '#000' : '#fff'; ctx.textAlign = 'center'; ctx.fillText(String(c), X(mesh.cellCentres[2 * c]), Y(mesh.cellCentres[2 * c + 1]) + 3); }
		}
	}
	function cellAt(sx: number, sy: number): number | null {
		const { X, Y } = xf();
		for (let c = 0; c < mesh.nCells; c++) {
			const a = mesh.vertStart[c], b = mesh.vertStart[c + 1]; let inside = false;
			for (let i = a, j = b - 1; i < b; j = i++) { const xi = X(mesh.verts[2 * i]), yi = Y(mesh.verts[2 * i + 1]), xj = X(mesh.verts[2 * j]), yj = Y(mesh.verts[2 * j + 1]); if (yi > sy !== yj > sy && sx < ((xj - xi) * (sy - yi)) / (yj - yi) + xi) inside = !inside; }
			if (inside) return c;
		}
		return null;
	}
	$effect(() => { void values; void range; void width; void mesh; void env; void neutral; draw(); });
	$effect(() => { const ro = new ResizeObserver(([e]) => (width = e.contentRect.width)); ro.observe(wrap); return () => ro.disconnect(); });
</script>

<div bind:this={wrap} class="w-full">
	<canvas bind:this={canvas} class="block w-full {onclick ? 'cursor-pointer' : ''}" style="height: {height}px" onclick={(e) => { const c = cellAt(e.offsetX, e.offsetY); if (c !== null) onclick?.(c); }}></canvas>
</div>
