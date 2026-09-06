<script lang="ts">
	/** Small canvas line chart for lessons. Series share x; y auto-ranges unless given. */
	export interface Series { label: string; color: string; x: ArrayLike<number>; y: ArrayLike<number>; dash?: number[] }
	let { series, xlabel = '', ylabel = '', yrange = undefined as [number, number] | undefined, xrange = undefined as [number, number] | undefined, height = 180, marker = undefined as { x: number; y: number; color: string } | undefined }:
		{ series: Series[]; xlabel?: string; ylabel?: string; yrange?: [number, number]; xrange?: [number, number]; height?: number; marker?: { x: number; y: number; color: string } } = $props();

	let wrap: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let width = $state(400);
	const PAD = { l: 58, r: 12, t: 10, b: 28 };
	const css = (n: string) => getComputedStyle(wrap).getPropertyValue(n).trim();
	const tickStep = (span: number, n: number) => { const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
	const label = (v: number, step: number) => { const d = Math.max(0, -Math.floor(Math.log10(step))); return d > 6 ? v.toExponential(1) : v.toFixed(d); };

	function draw() {
		if (!canvas || !wrap) return;
		const dpr = devicePixelRatio || 1;
		canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
		const ctx = canvas.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		const fg = css('--muted-foreground'), grid = css('--border');
		let [xlo, xhi] = xrange ?? [Infinity, -Infinity];
		let [ylo, yhi] = yrange ?? [Infinity, -Infinity];
		for (const s of series) for (let i = 0; i < s.x.length; i++) {
			const x = s.x[i], y = s.y[i];
			if (!xrange && Number.isFinite(x)) { xlo = Math.min(xlo, x); xhi = Math.max(xhi, x); }
			if (!yrange && Number.isFinite(y)) { ylo = Math.min(ylo, y); yhi = Math.max(yhi, y); }
		}
		if (marker) { if (!xrange) { xlo = Math.min(xlo, marker.x); xhi = Math.max(xhi, marker.x); } if (!yrange) { ylo = Math.min(ylo, marker.y); yhi = Math.max(yhi, marker.y); } }
		if (!(xhi > xlo)) { xlo = Number.isFinite(xlo) ? xlo : 0; xhi = xlo + 1; }
		if (!(yhi > ylo)) { ylo = Number.isFinite(ylo) ? ylo - 1 : 0; yhi = ylo + 2; }
		if (!yrange) { const m = (yhi - ylo) * 0.08; ylo -= m; yhi += m; }
		const x0 = PAD.l, x1 = width - PAD.r, y0 = PAD.t, y1 = height - PAD.b;
		const X = (x: number) => x0 + ((x - xlo) / (xhi - xlo)) * (x1 - x0);
		const Y = (y: number) => y1 - ((y - ylo) / (yhi - ylo)) * (y1 - y0);
		ctx.font = '12px ui-monospace, monospace'; ctx.fillStyle = fg; ctx.strokeStyle = grid; ctx.lineWidth = 1;
		const xs = tickStep(xhi - xlo, 5), ys = tickStep(yhi - ylo, 4);
		ctx.textAlign = 'center';
		for (let v = Math.ceil(xlo / xs) * xs; v <= xhi + 1e-12; v += xs) { const x = Math.round(X(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); ctx.fillText(label(v, xs), x, y1 + 14); }
		ctx.textAlign = 'right';
		for (let v = Math.ceil(ylo / ys) * ys; v <= yhi + 1e-12; v += ys) { const y = Math.round(Y(v)) + 0.5; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.fillText(label(v, ys), x0 - 4, y + 3); }
		ctx.textAlign = 'center'; ctx.fillText(xlabel, (x0 + x1) / 2, height - 3);
		ctx.save(); ctx.translate(10, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(ylabel, 0, 0); ctx.restore();
		ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
		for (const s of series) {
			ctx.strokeStyle = s.color; ctx.lineWidth = 1.6; ctx.setLineDash(s.dash ?? []);
			ctx.beginPath();
			let pen = false;
			const n = Math.min(s.x.length, s.y.length), stride = Math.max(1, Math.floor(n / (2 * (x1 - x0))));
			for (let i = 0; i < n; i += stride) { const y = s.y[i]; if (!Number.isFinite(y)) { pen = false; continue; } const px = X(s.x[i]), py = Y(y); if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; } }
			ctx.stroke();
		}
		ctx.setLineDash([]);
		if (marker) { ctx.fillStyle = marker.color; ctx.beginPath(); ctx.arc(X(marker.x), Y(marker.y), 5, 0, 2 * Math.PI); ctx.fill(); }
		ctx.restore();
		// legend
		let lx = x0 + 6;
		for (const s of series) { ctx.fillStyle = s.color; ctx.fillRect(lx, y0 + 4, 12, 2); ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.fillText(s.label, lx + 16, y0 + 8); lx += 24 + ctx.measureText(s.label).width; }
	}
	$effect(() => { void series; void width; void height; void yrange; void xrange; void marker; draw(); });
	$effect(() => { const ro = new ResizeObserver(([e]) => (width = e.contentRect.width)); ro.observe(wrap); return () => ro.disconnect(); });
</script>

<div bind:this={wrap} class="w-full"><canvas bind:this={canvas} class="block w-full" style="height: {height}px"></canvas></div>
