<script lang="ts">
	import { getSession } from '$lib/sim/session.svelte';
	import { getView } from '$lib/sim/view.svelte';
	import { colormapLut } from '$lib/viz/colormap';

	const session = getSession();
	const view = getView();

	let canvas: HTMLCanvasElement;
	let wrap: HTMLDivElement;
	let width = $state(100);
	let height = $state(100);
	let dragging = $state(false);
	let panning: { x: number; y: number; px: number; py: number } | null = null;

	/** current field values per cell, in display units */
	const values = $derived.by(() => {
		const s = session.snap, g = session.geom;
		if (!s || !g) return null;
		const out = new Float32Array(g.nCells);
		if (view.field === 'vm') for (let c = 0; c < g.nCells; c++) out[c] = s.vmAve[c] * 1e3;
		else if (view.field.startsWith('P:')) {
			// channel open fraction: cell value = mean over its membranes
			const mv = memValues;
			if (!mv) return null;
			const n = new Int32Array(g.nCells);
			for (let m = 0; m < g.nMems; m++) { out[g.memToCell[m]] += mv[m]; n[g.memToCell[m]]++; }
			for (let c = 0; c < g.nCells; c++) out[c] /= Math.max(1, n[c]);
		} else {
			const i = session.experiment.ions.findIndex((x) => x.name === view.field);
			if (i < 0) return null;
			for (let c = 0; c < g.nCells; c++) out[c] = s.cc[i * g.nCells + c];
		}
		return out;
	});

	/** per-membrane field values (vm and channel open fractions are native to membranes) */
	const memValues = $derived.by(() => {
		const s = session.snap, g = session.geom;
		if (!s || !g) return null;
		if (view.field === 'vm') return Float32Array.from(s.vm, (v) => v * 1e3);
		if (view.field.startsWith('P:')) return s.channels.find((ch) => ch.id === view.field.slice(2))?.P ?? null;
		return null;
	});

	const range = $derived.by(() => {
		const src = view.showMembranes && memValues ? memValues : values;
		if (!src || view.autoRange === false) return [view.min, view.max] as [number, number];
		let lo = Infinity, hi = -Infinity;
		for (const v of src) { if (v < lo) lo = v; if (v > hi) hi = v; }
		if (!(hi > lo)) { hi = lo + 1e-9; }
		return [lo, hi] as [number, number];
	});

	// world <-> screen
	function xform() {
		const g = session.geom!;
		const [x0, y0, x1, y1] = g.bounds;
		const bw = x1 - x0, bh = y1 - y0;
		const scale = (Math.min(width, height) * 0.94 / Math.max(bw, bh)) * view.zoom;
		const cx = width / 2 + view.panX, cy = height / 2 + view.panY;
		const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
		return {
			scale,
			toX: (x: number) => cx + (x - mx) * scale,
			toY: (y: number) => cy - (y - my) * scale,
			fromX: (sx: number) => mx + (sx - cx) / scale,
			fromY: (sy: number) => my - (sy - cy) / scale
		};
	}

	function cellAt(sx: number, sy: number): number | null {
		const g = session.geom;
		if (!g) return null;
		const { fromX, fromY } = xform();
		const x = fromX(sx), y = fromY(sy);
		for (let c = 0; c < g.nCells; c++) {
			const a = g.vertStart[c], b = g.vertStart[c + 1];
			let inside = false;
			for (let i = a, j = b - 1; i < b; j = i++) {
				const xi = g.verts[2 * i], yi = g.verts[2 * i + 1], xj = g.verts[2 * j], yj = g.verts[2 * j + 1];
				if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
			}
			if (inside) return c;
		}
		return null;
	}

	function cellsInBrush(sx: number, sy: number): number[] {
		const g = session.geom;
		if (!g) return [];
		const { fromX, fromY } = xform();
		const x = fromX(sx), y = fromY(sy);
		const r = view.brush * session.experiment.generator.cellRadius;
		const out: number[] = [];
		for (let c = 0; c < g.nCells; c++) {
			if (Math.hypot(g.cellCentres[2 * c] - x, g.cellCentres[2 * c + 1] - y) <= r) out.push(c);
		}
		return out;
	}

	function css(name: string) {
		return getComputedStyle(wrap).getPropertyValue(name).trim();
	}

	function draw() {
		const g = session.geom;
		if (!canvas || !g) return;
		const dpr = devicePixelRatio || 1;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		const ctx = canvas.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		const { toX, toY, scale } = xform();
		const lut = colormapLut(view.colormap);
		const [lo, hi] = range;
		const border = css('--border');
		// the bath: everything outside the cluster, tinted by the ion's bath concentration
		const bi = session.experiment.ions.findIndex((x) => x.name === view.field);
		if (bi >= 0 && session.snap) {
			const t = Math.min(1, Math.max(0, (session.snap.ccEnv[bi] - lo) / (hi - lo)));
			ctx.globalAlpha = 0.35;
			ctx.fillStyle = lut[Math.round(t * 255)];
			ctx.fillRect(0, 0, width, height);
			ctx.globalAlpha = 1;
		}
		ctx.lineWidth = Math.max(0.5, scale * 2e-7);
		for (let c = 0; c < g.nCells; c++) {
			const a = g.vertStart[c], b = g.vertStart[c + 1];
			ctx.beginPath();
			ctx.moveTo(toX(g.verts[2 * a]), toY(g.verts[2 * a + 1]));
			for (let i = a + 1; i < b; i++) ctx.lineTo(toX(g.verts[2 * i]), toY(g.verts[2 * i + 1]));
			ctx.closePath();
			const v = values ? values[c] : NaN;
			const t = Number.isFinite(v) ? Math.min(1, Math.max(0, (v - lo) / (hi - lo))) : 0;
			ctx.fillStyle = values ? lut[Math.round(t * 255)] : css('--muted');
			ctx.fill();
			ctx.strokeStyle = border;
			ctx.stroke();
		}
		// per-membrane values: colour each polygon edge (membrane m spans verts m -> next in its cell)
		if (view.showMembranes && memValues) {
			ctx.lineCap = 'butt';
			ctx.lineWidth = Math.max(2, scale * 1.2e-6);
			for (let m = 0; m < g.nMems; m++) {
				const c = g.memToCell[m];
				const a = g.vertStart[c], b = g.vertStart[c + 1];
				const m2 = m + 1 < b ? m + 1 : a;
				const t = Math.min(1, Math.max(0, (memValues[m] - lo) / (hi - lo)));
				ctx.strokeStyle = lut[Math.round(t * 255)];
				ctx.beginPath();
				ctx.moveTo(toX(g.verts[2 * m]), toY(g.verts[2 * m + 1]));
				ctx.lineTo(toX(g.verts[2 * m2]), toY(g.verts[2 * m2 + 1]));
				ctx.stroke();
			}
		}
		// profile outlines
		for (const p of session.experiment.profiles) {
			ctx.strokeStyle = p.color;
			ctx.lineWidth = 1.5;
			for (const c of p.cells) {
				if (c >= g.nCells) continue;
				const a = g.vertStart[c], b = g.vertStart[c + 1];
				ctx.beginPath();
				ctx.moveTo(toX(g.verts[2 * a]), toY(g.verts[2 * a + 1]));
				for (let i = a + 1; i < b; i++) ctx.lineTo(toX(g.verts[2 * i]), toY(g.verts[2 * i + 1]));
				ctx.closePath();
				ctx.stroke();
			}
		}
		// hover
		if (view.hover !== null && view.hover < g.nCells) {
			const c = view.hover, a = g.vertStart[c], b = g.vertStart[c + 1];
			ctx.beginPath();
			ctx.moveTo(toX(g.verts[2 * a]), toY(g.verts[2 * a + 1]));
			for (let i = a + 1; i < b; i++) ctx.lineTo(toX(g.verts[2 * i]), toY(g.verts[2 * i + 1]));
			ctx.closePath();
			ctx.strokeStyle = css('--foreground');
			ctx.lineWidth = 1.5;
			ctx.stroke();
		}
		// probes
		ctx.font = '10px ui-monospace, monospace';
		session.probes.forEach((c) => {
			if (c >= g.nCells) return;
			const x = toX(g.cellCentres[2 * c]), y = toY(g.cellCentres[2 * c + 1]);
			ctx.fillStyle = session.probeColors[c] ?? '#888';
			ctx.beginPath();
			ctx.arc(x, y, 4, 0, 2 * Math.PI);
			ctx.fill();
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.fillStyle = css('--foreground');
			ctx.fillText(String(c), x + 6, y - 4);
		});
	}

	$effect(() => {
		view.range = range;
	});

	$effect(() => {
		// dependencies: geometry, snapshot, view state, size, probes, profiles
		void session.snap; void session.geom; void view.field; void view.colormap; void view.hover;
		void view.zoom; void view.panX; void view.panY; void width; void height; void session.probes; void view.showMembranes;
		void session.experiment.profiles; void range; void session.probeColors;
		draw();
	});

	$effect(() => {
		const ro = new ResizeObserver(([e]) => {
			width = e.contentRect.width;
			height = e.contentRect.height;
		});
		ro.observe(wrap);
		return () => ro.disconnect();
	});

	function applyTool(sx: number, sy: number, e: PointerEvent) {
		if (view.tool === 'paint') {
			const id = view.activeProfile;
			if (!id) return;
			const cells = cellsInBrush(sx, sy);
			if (cells.length === 0) return;
			session.edit((ex) => {
				const p = ex.profiles.find((q) => q.id === id);
				if (!p) return;
				if (e.shiftKey) p.cells = p.cells.filter((c) => !cells.includes(c));
				else {
					const set = new Set(p.cells);
					for (const c of cells) set.add(c);
					p.cells = [...set];
					for (const q of ex.profiles) if (q.id !== id) q.cells = q.cells.filter((c) => !set.has(c));
				}
			});
		} else if (view.tool === 'cut') {
			const cells = cellsInBrush(sx, sy);
			if (cells.length) session.cut(cells);
		}
	}

	function onPointerDown(e: PointerEvent) {
		const r = canvas.getBoundingClientRect();
		const sx = e.clientX - r.left, sy = e.clientY - r.top;
		if (e.button === 1 || (e.button === 0 && e.altKey)) {
			panning = { x: e.clientX, y: e.clientY, px: view.panX, py: view.panY };
			return;
		}
		if (e.button !== 0) return;
		canvas.setPointerCapture(e.pointerId);
		if (view.tool === 'probe') {
			const c = cellAt(sx, sy);
			if (c !== null) session.toggleProbe(c);
			return;
		}
		dragging = true;
		applyTool(sx, sy, e);
	}
	function onPointerMove(e: PointerEvent) {
		const r = canvas.getBoundingClientRect();
		const sx = e.clientX - r.left, sy = e.clientY - r.top;
		if (panning) {
			view.panX = panning.px + (e.clientX - panning.x);
			view.panY = panning.py + (e.clientY - panning.y);
			return;
		}
		view.hover = cellAt(sx, sy);
		if (dragging && view.tool !== 'probe') applyTool(sx, sy, e);
	}
	function onPointerUp() { dragging = false; panning = null; }
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		view.zoom = Math.min(20, Math.max(0.2, view.zoom * Math.exp(-e.deltaY * 0.0015)));
	}

	const hoverInfo = $derived.by(() => {
		const c = view.hover, s = session.snap, g = session.geom;
		if (c === null || !s || !g || c >= g.nCells) return null;
		const ions = session.experiment.ions.map((ion, i) => `${ion.name} ${(s.cc[i * g.nCells + c]).toFixed(2)}`).join('  ');
		return `cell ${c}  Vm ${(s.vmAve[c] * 1e3).toFixed(2)} mV  ${ions}`;
	});
	const bathInfo = $derived.by(() => {
		const s = session.snap;
		if (!s) return '';
		return 'bath  ' + session.experiment.ions.map((ion, i) => `${ion.name} ${s.ccEnv[i].toFixed(2)}`).join('  ') + ' mM';
	});
</script>

<div bind:this={wrap} class="relative h-full w-full overflow-hidden bg-card">
	<canvas
		bind:this={canvas}
		class="block h-full w-full touch-none {view.tool === 'probe' ? 'cursor-crosshair' : 'cursor-cell'}"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointerleave={() => { view.hover = null; onPointerUp(); }}
		onwheel={onWheel}
		oncontextmenu={(e) => e.preventDefault()}
	></canvas>
	<div class="pointer-events-none absolute bottom-1 left-2 flex flex-col gap-0.5 font-mono text-xs">
		<div class="rounded bg-background/80 px-1.5 py-0.5 text-muted-foreground">{bathInfo}</div>
		{#if hoverInfo}<div class="rounded bg-background/80 px-1.5 py-0.5 text-foreground">{hoverInfo}</div>{/if}
	</div>
</div>
