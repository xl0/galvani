<script lang="ts">
	import { getSession } from '$lib/sim/session.svelte';
	import { fmt } from '$lib/format';

	/** One stacked canvas chart: a line per probe for one quantity ('vm' or an ion name), bath on a right axis. */
	let { quantity, label }: { quantity: string; label: string } = $props();
	const session = getSession();

	let wrap: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let width = $state(300);
	let height = $state(120);
	let hoverX = $state<number | null>(null);

	const PAD = { l: 52, r: 8, t: 8, b: 20 };
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

	function extent(arrs: (number | null)[][]): [number, number] {
		let lo = Infinity, hi = -Infinity;
		for (const a of arrs) for (const v of a) if (v !== null && Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
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
		const x0 = PAD.l, x1 = width - PAD.r - (withBath ? 44 : 0), y0 = PAD.t, y1 = height - PAD.b;
		const tEnd = Math.max(session.experiment.endTime, t[t.length - 1] ?? 0);
		const toX = (tt: number) => x0 + ((tt - 0) / tEnd) * (x1 - x0);
		ctx.font = '10px ui-monospace, monospace';
		ctx.fillStyle = fg;
		ctx.strokeStyle = grid;
		ctx.lineWidth = 1;

		// x grid + ticks
		const xs = tickStep(tEnd, 5);
		ctx.textAlign = 'center';
		for (let tt = 0; tt <= tEnd + 1e-12; tt += xs) {
			const x = Math.round(toX(tt)) + 0.5;
			ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
			ctx.fillText(tt.toFixed(Math.max(0, -Math.floor(Math.log10(xs)))), x, y1 + 12);
		}

		const probeSeries = session.probes.map((c) => ({ color: session.probeColors[c] ?? '#888', data: seriesData(c), dash: [] as number[] }));
		const bathSeries = withBath ? [{ color: session.bathColor, data: session.traceBath[ionIdx] ?? [], dash: [5, 3] }] : [];
		const drawAxis = (lo: number, hi: number, side: 'left' | 'right') => {
			const ys = tickStep(hi - lo, 4);
			const decimals = Math.max(0, -Math.floor(Math.log10(ys)));
			ctx.textAlign = side === 'left' ? 'right' : 'left';
			for (let v = Math.ceil(lo / ys) * ys; v <= hi + 1e-12; v += ys) {
				const y = Math.round(y1 - ((v - lo) / (hi - lo)) * (y1 - y0)) + 0.5;
				if (side === 'left') { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
				ctx.fillText(decimals > 6 ? v.toExponential(2) : v.toFixed(decimals), side === 'left' ? x0 - 4 : x1 + 4, y + 3);
			}
		};
		const drawSeries = (s: { color: string; data: (number | null)[]; dash: number[] }, lo: number, hi: number) => {
			ctx.strokeStyle = s.color;
			ctx.lineWidth = 1.5;
			ctx.setLineDash(s.dash);
			ctx.beginPath();
			let pen = false;
			const n = Math.min(t.length, s.data.length);
			// decimate to at most ~2 points per pixel column
			const stride = Math.max(1, Math.floor(n / (2 * (x1 - x0))));
			for (let j = 0; j < n; j += stride) {
				const v = s.data[j];
				if (v === null || !Number.isFinite(v)) { pen = false; continue; }
				const x = toX(t[j]), y = y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
				if (pen) ctx.lineTo(x, y); else { ctx.moveTo(x, y); pen = true; }
			}
			ctx.stroke();
			ctx.setLineDash([]);
		};

		const [lo, hi] = extent(probeSeries.map((s) => s.data));
		drawAxis(lo, hi, 'left');
		ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
		for (const s of probeSeries) drawSeries(s, lo, hi);
		if (bathSeries.length) {
			const [blo, bhi] = extent(bathSeries.map((s) => s.data));
			for (const s of bathSeries) drawSeries(s, blo, bhi);
			ctx.restore();
			ctx.fillStyle = fg; ctx.strokeStyle = grid; ctx.lineWidth = 1;
			drawAxis(blo, bhi, 'right');
		} else ctx.restore();

		// playhead / hover cursor
		const cursorT = hoverX !== null ? ((hoverX - x0) / (x1 - x0)) * tEnd : session.playhead !== null ? (session.history[session.playhead]?.t ?? null) : null;
		if (cursorT !== null && cursorT >= 0 && cursorT <= tEnd) {
			const x = Math.round(toX(cursorT)) + 0.5;
			ctx.strokeStyle = css('--foreground');
			ctx.setLineDash([3, 3]);
			ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
			ctx.setLineDash([]);
		}
	}

	const hoverInfo = $derived.by(() => {
		if (hoverX === null) return null;
		const t = session.traceT;
		if (t.length === 0) return null;
		const x0 = PAD.l, x1 = width - PAD.r - (withBath ? 44 : 0);
		const tEnd = Math.max(session.experiment.endTime, t[t.length - 1]);
		const tt = ((hoverX - x0) / (x1 - x0)) * tEnd;
		let lo = 0, hi = t.length - 1;
		while (lo < hi) { const mid = (lo + hi) >> 1; if (t[mid] < tt) lo = mid + 1; else hi = mid; }
		const parts = session.probes.map((c) => { const v = seriesData(c)[lo]; return `${c}: ${v == null ? '–' : fmt(v, 4)}`; });
		if (withBath) parts.push(`bath: ${fmt(session.traceBath[ionIdx]?.[lo] ?? NaN, 4)}`);
		return `t ${fmt(t[lo], 4)} s  ${parts.join('  ')}`;
	});

	function onClick(e: MouseEvent) {
		const t = session.traceT;
		if (t.length === 0) return;
		const x0 = PAD.l, x1 = width - PAD.r - (withBath ? 44 : 0);
		const tEnd = Math.max(session.experiment.endTime, t[t.length - 1]);
		session.seekTime(((e.offsetX - x0) / (x1 - x0)) * tEnd);
	}

	$effect(() => {
		void session.traceVersion; void session.probes; void session.probeColors; void session.bathColor; void quantity;
		void width; void height; void hoverX; void session.playhead; void withBath;
		draw();
	});
	$effect(() => {
		const ro = new ResizeObserver(([e]) => { width = e.contentRect.width; height = e.contentRect.height; });
		ro.observe(wrap);
		return () => ro.disconnect();
	});
</script>

<div bind:this={wrap} class="relative min-h-0 overflow-hidden">
	<canvas
		bind:this={canvas}
		class="block h-full w-full cursor-crosshair"
		onmousemove={(e) => (hoverX = e.offsetX)}
		onmouseleave={() => (hoverX = null)}
		onclick={onClick}
	></canvas>
	<div class="pointer-events-none absolute right-2 top-1 font-mono text-[10px] text-muted-foreground">{label}</div>
	{#if hoverInfo}<div class="pointer-events-none absolute left-14 top-1 rounded bg-background/80 px-1 font-mono text-[10px] text-foreground">{hoverInfo}</div>{/if}
</div>
