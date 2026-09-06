<script lang="ts">
	import { untrack } from 'svelte';
	import type { Snapshot } from '$lib/sim/protocol';
	import { fieldValues as fieldValuesOf } from '$lib/viz/fields';
	import { clusterTransform, drawCluster } from '$lib/viz/render';
	import { fmt } from '$lib/format';
	import { getSession } from '$lib/sim/session.svelte';
	import { getView } from '$lib/sim/view.svelte';

	const session = getSession();
	const view = getView();

	let canvas: HTMLCanvasElement;
	let wrap: HTMLDivElement;
	let width = $state(100);
	let height = $state(100);
	let dragging = $state(false);
	let erasing = false;
	let panning: { x: number; y: number; px: number; py: number } | null = null;

	const fieldValues = (s: Snapshot, membranes: boolean) => (session.geom ? fieldValuesOf(s, session.geom, session.experiment.ions, view.field, membranes) : null);
	const values = $derived(session.view ? fieldValues(session.view, false) : null);
	const memValues = $derived(session.view ? fieldValues(session.view, true) : null);
	const fieldSource = $derived(view.showMembranes && memValues ? memValues : values);

	function extentOf(a: Float32Array | null, lo: number, hi: number): [number, number] {
		if (a) for (const v of a) { if (v < lo) lo = v; if (v > hi) hi = v; }
		return [lo, hi];
	}
	/** min/max of the field over every recorded frame; rebuilt on field change or reset, folded per live frame */
	let runExt = $state<[number, number]>([Infinity, -Infinity]);
	$effect(() => {
		void view.field; void view.showMembranes; void session.geom;
		const empty = session.historyLen === 0;
		let lo = Infinity, hi = -Infinity;
		if (!empty) for (const f of session.history) [lo, hi] = extentOf(fieldValues(f, view.showMembranes), lo, hi);
		runExt = [lo, hi];
	});
	$effect(() => {
		const s = session.snap;
		if (!s) return;
		const [lo, hi] = extentOf(fieldValues(s, untrack(() => view.showMembranes)), untrack(() => runExt[0]), untrack(() => runExt[1]));
		if (lo !== runExt[0] || hi !== runExt[1]) runExt = [lo, hi];
	});

	const range = $derived.by(() => {
		const r = view.rangeSetting;
		if (r.mode === 'fixed') return [r.min, r.max] as [number, number];
		let [lo, hi] = r.mode === 'run' ? runExt : extentOf(fieldSource, Infinity, -Infinity);
		if (!Number.isFinite(lo)) return [r.min, r.max] as [number, number];
		if (!(hi > lo)) hi = lo + 1e-9;
		return [lo, hi] as [number, number];
	});

	// world <-> screen
	function xform() { return clusterTransform(session.geom!, width, height, view.zoom, view.panX, view.panY); }

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
		const xf = xform(); const { toX, toY } = xf;
		if (!session.view) return;
		drawCluster(ctx, g, session.view, session.experiment.ions, session.experiment.profiles, width, height, { colormap: view.colormap, range, field: view.field, showMembranes: view.showMembranes, border: css('--border'), muted: css('--muted'), foreground: css('--foreground') }, xf);
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
		// bath probe marker, parked at the top-left of the cluster's bounding box
		if (session.bathProbe) {
			const bx = toX(g.bounds[0]) - 14, by = toY(g.bounds[3]) - 14;
			ctx.fillStyle = session.bathColor;
			ctx.beginPath();
			ctx.arc(bx, by, 5, 0, 2 * Math.PI);
			ctx.fill();
			ctx.strokeStyle = '#fff';
			ctx.lineWidth = 1;
			ctx.stroke();
			ctx.fillStyle = css('--foreground');
			ctx.font = '11px ui-monospace, monospace';
			ctx.fillText('bath', bx + 8, by + 4);
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
		void session.view; void session.geom; void view.field; void view.colormap; void view.hover;
		void view.zoom; void view.panX; void view.panY; void width; void height; void session.probes; void view.showMembranes;
		void session.experiment.profiles; void range; void session.probeColors; void session.bathProbe;
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

	/** paint: left button adds cells to the active region, right button (or shift) erases them */
	function applyTool(sx: number, sy: number, erase: boolean) {
		if (view.tool === 'paint') {
			const id = view.activeProfile;
			if (!id) return;
			const cells = cellsInBrush(sx, sy);
			if (cells.length === 0) return;
			session.edit((ex) => {
				const p = ex.profiles.find((q) => q.id === id);
				if (!p) return;
				if (erase) p.cells = p.cells.filter((c) => !cells.includes(c));
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
		if (e.button !== 0 && !(e.button === 2 && view.tool === 'paint')) return;
		canvas.setPointerCapture(e.pointerId);
		if (view.tool === 'probe') {
			const c = cellAt(sx, sy);
			if (c !== null) session.toggleProbe(c);
			else session.toggleBathProbe();
			return;
		}
		erasing = e.button === 2 || e.shiftKey;
		dragging = true;
		applyTool(sx, sy, erasing);
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
		const env = session.view?.env;
		if (env) { const { fromX, fromY } = xform(); const j = Math.floor((fromX(sx) - env.xmin) / env.delta), i = Math.floor((fromY(sy) - env.ymin) / env.delta); hoverEnv = j >= 0 && j < env.nx && i >= 0 && i < env.ny ? i * env.nx + j : null; }
		if (dragging && view.tool !== 'probe') applyTool(sx, sy, erasing);
	}
	function onPointerUp() { dragging = false; panning = null; }
	/** zoom about the pointer: keep the world point under the cursor fixed */
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const k = Math.min(20, Math.max(0.2, view.zoom * Math.exp(-e.deltaY * 0.0015))) / view.zoom;
		const r = canvas.getBoundingClientRect();
		const sx = e.clientX - r.left, sy = e.clientY - r.top;
		const cx = width / 2 + view.panX, cy = height / 2 + view.panY;
		view.panX = sx - (sx - cx) * k - width / 2;
		view.panY = sy - (sy - cy) * k - height / 2;
		view.zoom *= k;
	}

	const hoverInfo = $derived.by(() => {
		const c = view.hover, s = session.view, g = session.geom;
		if (c === null || !s || !g || c >= g.nCells) return null;
		const ions = session.experiment.ions.map((ion, i) => `${ion.name} ${fmt(s.cc[i * g.nCells + c], 6)}`).join('  ');
		const subs = s.subs.map((x) => `${x.name} ${x.cells[c].toPrecision(3)}`).join('  ');
		return `cell ${c}  Vm ${(s.vmAve[c] * 1e3).toFixed(2)} mV  ${ions}${subs ? '  ' + subs : ''}`;
	});
	/** extracellular grid square under the pointer (ECM only) */
	let hoverEnv = $state<number | null>(null);
	const bathInfo = $derived.by(() => {
		const s = session.view;
		if (!s) return '';
		if (s.env) {
			const k = hoverEnv;
			if (k === null) return 'extracellular grid: hover to read';
			const n = s.env.nx * s.env.ny;
			return `env square ${k}  V ${(s.env.v[k] * 1e3).toFixed(3)} mV  ` + session.experiment.ions.map((ion, i) => `${ion.name} ${fmt(s.env!.cc[i * n + k], 6)}`).join('  ') + ' mM';
		}
		return 'bath  ' + session.experiment.ions.map((ion, i) => `${ion.name} ${fmt(s.ccEnv[i], 8)}`).join('  ') + ' mM';
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
