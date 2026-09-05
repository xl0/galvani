<script lang="ts">
	/** Draws a small mesh coloured by a per-cell value; click reports the cell. */
	import type { Mesh } from '$lib/core/mesh';
	import { colormapLut } from '$lib/viz/colormap';
	let { mesh, values, range, height = 120, onclick = undefined as ((cell: number) => void) | undefined, labels = false }:
		{ mesh: Mesh; values: ArrayLike<number>; range: [number, number]; height?: number; onclick?: (cell: number) => void; labels?: boolean } = $props();
	let wrap: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let width = $state(400);
	const lut = colormapLut('viridis');
	const css = (n: string) => getComputedStyle(wrap).getPropertyValue(n).trim();
	function xf() {
		let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
		for (let i = 0; i < mesh.verts.length; i += 2) { xmin = Math.min(xmin, mesh.verts[i]); xmax = Math.max(xmax, mesh.verts[i]); ymin = Math.min(ymin, mesh.verts[i + 1]); ymax = Math.max(ymax, mesh.verts[i + 1]); }
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
		ctx.strokeStyle = css('--border'); ctx.lineWidth = 1; ctx.font = '10px ui-monospace, monospace';
		for (let c = 0; c < mesh.nCells; c++) {
			const a = mesh.vertStart[c], b = mesh.vertStart[c + 1];
			ctx.beginPath(); ctx.moveTo(X(mesh.verts[2 * a]), Y(mesh.verts[2 * a + 1]));
			for (let i = a + 1; i < b; i++) ctx.lineTo(X(mesh.verts[2 * i]), Y(mesh.verts[2 * i + 1]));
			ctx.closePath();
			const t = Math.min(1, Math.max(0, (values[c] - range[0]) / (range[1] - range[0])));
			ctx.fillStyle = lut[Math.round(t * 255)]; ctx.fill(); ctx.stroke();
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
	$effect(() => { void values; void range; void width; void mesh; draw(); });
	$effect(() => { const ro = new ResizeObserver(([e]) => (width = e.contentRect.width)); ro.observe(wrap); return () => ro.disconnect(); });
</script>

<div bind:this={wrap} class="w-full">
	<canvas bind:this={canvas} class="block w-full {onclick ? 'cursor-pointer' : ''}" style="height: {height}px" onclick={(e) => { const c = cellAt(e.offsetX, e.offsetY); if (c !== null) onclick?.(c); }}></canvas>
</div>
