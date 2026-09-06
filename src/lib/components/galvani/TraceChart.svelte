<script lang="ts">
	import { getSession } from '$lib/sim/session.svelte';
	import { getView } from '$lib/sim/view.svelte';
	import { fmt } from '$lib/format';

	/** One stacked canvas chart: a line per probe for one quantity ('vm' or an ion name), bath on a right axis. */
	let { quantity, label }: { quantity: string; label: string } = $props();
	const session = getSession();
	const view = getView();

	let wrap: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let width = $state(300);
	let height = $state(120);

	const PAD = { l: 52, r: 8, t: 8, b: 20 };
	/** zoomed value range of the left axis (per chart), or null for auto-fit */
	let yRange = $state<[number, number] | null>(null);
	/** plot x-extent and the sim time it spans */
	function geom() {
		const t = session.traceT;
		const x0 = PAD.l, x1 = width - PAD.r;
		const tEnd = Math.max(session.experiment.endTime, t[t.length - 1] ?? 0);
		// unzoomed: the axis follows the data so far; zoom/pan windows are clamped to the full run
		const [ta, tb] = view.traceRange ?? [0, t.length > 1 ? t[t.length - 1] : tEnd];
		return { x0, x1, ta, tb, tEnd, toX: (tt: number) => x0 + ((tt - ta) / (tb - ta)) * (x1 - x0), toT: (x: number) => ta + ((x - x0) / (x1 - x0)) * (tb - ta) };
	}
	/** index of the first trace sample at or after time tt */
	function indexAt(tt: number): number {
		const t = session.traceT;
		let lo = 0, hi = t.length - 1;
		while (lo < hi) { const mid = (lo + hi) >> 1; if (t[mid] < tt) lo = mid + 1; else hi = mid; }
		return lo;
	}
	const ionIdx = $derived(session.experiment.ions.findIndex((i) => i.name === quantity));
	const withBath = $derived(session.bathProbe && ionIdx >= 0);
	const css = (name: string) => getComputedStyle(wrap).getPropertyValue(name).trim();

	const subIdx = $derived(quantity.startsWith('S:') ? session.subNames.indexOf(quantity.slice(2)) : -1);
	function seriesData(c: number): (number | null)[] {
		const tr = session.traces.get(c);
		if (!tr) return [];
		if (quantity === 'vm') return tr.vm.map((v) => (v === null ? null : v * 1e3));
		if (subIdx >= 0) return tr.sub[subIdx] ?? [];
		return tr.cc[ionIdx];
	}

	/** "nice" tick step for a range spanning `span` over ~n ticks */
	function tickStep(span: number, n: number): number {
		const raw = span / n;
		const p = 10 ** Math.floor(Math.log10(raw));
		const m = raw / p;
		return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
	}

	/** value range of the samples inside [ja, jb) */
	function extent(arrs: (number | null)[][], ja: number, jb: number): [number, number] {
		let lo = Infinity, hi = -Infinity;
		for (const a of arrs) for (let j = ja; j < Math.min(jb, a.length); j++) { const v = a[j]; if (v !== null && Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; } }
		if (!(hi > lo)) { if (!Number.isFinite(lo)) { lo = 0; hi = 1; } else { lo -= 1; hi += 1; } }
		const m = (hi - lo) * 0.05;
		return [lo - m, hi + m];
	}

	function draw() {
		if (!canvas || !wrap) return;
		const dpr = devicePixelRatio || 1;
		canvas.width = Math.round(width * dpr);
		canvas.height = Math.round(height * dpr);
		const ctx = canvas.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		const fg = css('--muted-foreground'), grid = css('--border');
		const t = session.traceT;
		const { x0, x1, ta, tb, toX } = geom();
		const y0 = PAD.t, y1 = height - PAD.b;
		const ja = indexAt(ta), jb = indexAt(tb) + 1;
		ctx.font = '10px ui-monospace, monospace';
		ctx.fillStyle = fg;
		ctx.strokeStyle = grid;
		ctx.lineWidth = 1;

		// x grid + ticks
		const xs = tickStep(tb - ta, 5);
		ctx.textAlign = 'center';
		for (let tt = Math.ceil(ta / xs) * xs; tt <= tb + 1e-12; tt += xs) {
			const x = Math.round(toX(tt)) + 0.5;
			ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
			ctx.fillText(tt.toFixed(Math.max(0, -Math.floor(Math.log10(xs)))), x, y1 + 12);
		}

		const probeSeries = session.probes.map((c) => ({ color: session.probeColors[c] ?? '#888', data: seriesData(c), dash: [] as number[] }));
		const bathSeries = withBath ? [{ color: session.bathColor, data: session.traceBath[ionIdx] ?? [], dash: [5, 3] }] : [];
		const drawAxis = (lo: number, hi: number) => {
			const ys = tickStep(hi - lo, 4);
			const decimals = Math.max(0, -Math.floor(Math.log10(ys)));
			ctx.textAlign = 'right';
			for (let v = Math.ceil(lo / ys) * ys; v <= hi + 1e-12; v += ys) {
				const y = Math.round(y1 - ((v - lo) / (hi - lo)) * (y1 - y0)) + 0.5;
				ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
				ctx.fillText(decimals > 6 ? v.toExponential(2) : v.toFixed(decimals), x0 - 4, y + 3);
			}
		};
		const drawSeries = (s: { color: string; data: (number | null)[]; dash: number[] }, lo: number, hi: number) => {
			ctx.strokeStyle = s.color;
			ctx.lineWidth = 1.5;
			ctx.setLineDash(s.dash);
			ctx.lineJoin = 'round';
			ctx.beginPath();
			let pen = false;
			const n = Math.min(t.length, s.data.length, jb + 1);
			const Y = (v: number) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
			// downsample per pixel column (min/max), so the drawn line is stable as data grows and spikes survive
			let col = -1, cmin = 0, cmax = 0, cx = 0;
			const flush = () => { if (col < 0) return; if (pen) { ctx.lineTo(cx, Y(cmin)); ctx.lineTo(cx, Y(cmax)); } else { ctx.moveTo(cx, Y(cmin)); ctx.lineTo(cx, Y(cmax)); pen = true; } col = -1; };
			for (let j = Math.max(0, ja - 1); j < n; j++) {
				const v = s.data[j];
				if (v === null || !Number.isFinite(v)) { flush(); pen = false; continue; }
				const x = toX(t[j]), c = Math.round(x * 2);
				if (c !== col) { flush(); col = c; cx = x; cmin = cmax = v; }
				else { if (v < cmin) cmin = v; if (v > cmax) cmax = v; }
			}
			flush();
			ctx.stroke();
			ctx.setLineDash([]);
		};

		// bath shares the probes' axis: one scale per chart, even if the bath dwarfs the cells
		const all = [...probeSeries, ...bathSeries];
		const [lo, hi] = yRange ?? extent(all.map((s) => s.data), ja, jb);
		drawAxis(lo, hi);
		ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
		for (const s of all) drawSeries(s, lo, hi);
		ctx.restore();

		// cursor: shared hover time, else playhead
		const cursorT = view.traceHoverT ?? (session.playhead !== null ? (session.history[session.playhead]?.t ?? null) : null);
		if (cursorT === null || cursorT < ta || cursorT > tb) return;
		const x = Math.round(toX(cursorT)) + 0.5;
		ctx.strokeStyle = css('--foreground');
		ctx.setLineDash([3, 3]);
		ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
		ctx.setLineDash([]);
		if (t.length === 0) return;
		// dots + value labels at the hovered sample, labels pushed apart vertically
		const j = indexAt(cursorT);
		const marks: { y: number; color: string; text: string }[] = [];
		probeSeries.forEach((s, k) => { const v = s.data[j]; if (v != null && Number.isFinite(v)) marks.push({ y: y1 - ((v - lo) / (hi - lo)) * (y1 - y0), color: s.color, text: `${session.probes[k]}: ${fmt(v, 4)}` }); });
		for (const s of bathSeries) { const v = s.data[j]; if (v != null && Number.isFinite(v)) marks.push({ y: y1 - ((v - lo) / (hi - lo)) * (y1 - y0), color: s.color, text: `bath: ${fmt(v, 4)}` }); }
		for (const m of marks) { ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(x, m.y, 3, 0, 2 * Math.PI); ctx.fill(); }
		marks.sort((a, b) => a.y - b.y);
		const LH = 12;
		for (let k = 1; k < marks.length; k++) if (marks[k].y < marks[k - 1].y + LH) marks[k].y = marks[k - 1].y + LH;
		for (let k = marks.length - 1; k >= 0; k--) { const cap = y1 - 8 - (marks.length - 1 - k) * LH; if (marks[k].y > cap) marks[k].y = cap; }
		const right = x < (x0 + x1) / 2;
		ctx.textAlign = right ? 'left' : 'right';
		const lx = right ? x + 7 : x - 7;
		for (const m of marks) {
			const w = ctx.measureText(m.text).width;
			ctx.fillStyle = css('--background');
			ctx.globalAlpha = 0.85;
			ctx.fillRect(right ? lx - 2 : lx - w - 2, m.y - 6, w + 4, LH);
			ctx.globalAlpha = 1;
			ctx.fillStyle = m.color;
			ctx.fillText(m.text, lx, m.y + 3);
		}
		// time under the cursor
		const tl = `t = ${fmt(t[j], 4)} s`;
		ctx.textAlign = 'center';
		ctx.fillStyle = css('--background'); ctx.fillRect(x - ctx.measureText(tl).width / 2 - 3, y1 + 2, ctx.measureText(tl).width + 6, LH);
		ctx.fillStyle = css('--foreground'); ctx.fillText(tl, x, y1 + 12);
	}

	// left button: scrub frames (drag seeks continuously); middle button: pan; wheel: zoom time about the
	// pointer; shift+wheel or wheel over the left axis: zoom values about the pointer; double-click: reset.
	let pan: { x: number; y: number; ta: number; tb: number; yr: [number, number] | null } | null = null;
	let scrubbing = false;
	function onPointerDown(e: PointerEvent) {
		canvas.setPointerCapture(e.pointerId);
		if (e.button === 0) { scrubbing = true; seekAt(e.offsetX); }
		else if (e.button === 1) { e.preventDefault(); const g = geom(); pan = { x: e.offsetX, y: e.offsetY, ta: g.ta, tb: g.tb, yr: yRange }; }
	}
	function seekAt(x: number) { if (session.traceT.length > 0) session.seekTime(geom().toT(x)); }
	function onPointerMove(e: PointerEvent) {
		const g = geom();
		view.traceHoverT = g.toT(e.offsetX);
		if (scrubbing) { seekAt(e.offsetX); return; }
		if (!pan) return;
		const span = pan.tb - pan.ta;
		const a = Math.max(0, Math.min(pan.ta + ((pan.x - e.offsetX) / (g.x1 - g.x0)) * span, g.tEnd - span));
		view.traceRange = span >= g.tEnd ? null : [a, a + span];
		if (pan.yr) { const dv = ((e.offsetY - pan.y) / (height - PAD.b - PAD.t)) * (pan.yr[1] - pan.yr[0]); yRange = [pan.yr[0] + dv, pan.yr[1] + dv]; }
	}
	function onPointerUp() { scrubbing = false; pan = null; }
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const g = geom();
		const delta = e.deltaY || e.deltaX; // shift+wheel arrives as deltaX on some platforms
		const f = Math.exp(delta * 0.002);
		if (e.shiftKey || e.offsetX < g.x0) {
			const y0 = PAD.t, y1 = height - PAD.b;
			const series = session.probes.map((c) => seriesData(c));
			if (withBath) series.push(session.traceBath[ionIdx] ?? []);
			const [lo, hi] = yRange ?? extent(series, indexAt(g.ta), indexAt(g.tb) + 1);
			const c = hi - ((e.offsetY - y0) / (y1 - y0)) * (hi - lo);
			yRange = [c - (c - lo) * f, c + (hi - c) * f];
			return;
		}
		const c = g.toT(e.offsetX);
		let a = c - (c - g.ta) * f, b = c + (g.tb - c) * f;
		if (b - a >= g.tEnd) { view.traceRange = null; return; }
		if (a < 0) { b -= a; a = 0; }
		if (b > g.tEnd) { a -= b - g.tEnd; b = g.tEnd; }
		view.traceRange = [a, b];
	}
	// wheel must be non-passive to stop the page scrolling; Svelte registers it passive
	$effect(() => { canvas.addEventListener('wheel', onWheel, { passive: false }); return () => canvas.removeEventListener('wheel', onWheel); });

	$effect(() => {
		void session.traceVersion; void session.probes; void session.probeColors; void session.bathColor; void quantity;
		void width; void height; void view.traceHoverT; void view.traceRange; void yRange; void session.playhead; void withBath;
		draw();
	});
	$effect(() => {
		const ro = new ResizeObserver(([e]) => { width = e.contentRect.width; height = e.contentRect.height; });
		ro.observe(wrap);
		return () => ro.disconnect();
	});
</script>

<div bind:this={wrap} class="relative min-h-0 overflow-hidden bg-background pt-1">
	<canvas
		bind:this={canvas}
		class="block h-full w-full cursor-crosshair"
		title="left drag: scrub frames · middle drag: pan · wheel: zoom time · shift+wheel or wheel over the axis: zoom values · double-click: reset"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerUp}
		onpointercancel={onPointerUp}
		onpointerleave={() => { if (!scrubbing && !pan) view.traceHoverT = null; }}
		onauxclick={(e) => e.preventDefault()}
		oncontextmenu={(e) => e.preventDefault()}
		ondblclick={() => { view.traceRange = null; yRange = null; }}
	></canvas>
	<div class="pointer-events-none absolute right-2 top-1 font-mono text-[10px] text-muted-foreground">{label}</div>
</div>
