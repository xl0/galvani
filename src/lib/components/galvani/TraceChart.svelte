<script lang="ts">
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import { getSession } from '$lib/sim/session.svelte';
	import { getView } from '$lib/sim/view.svelte';

	/** One stacked chart: a series per probe for one quantity ('vm' or an ion name). */
	let { quantity, label }: { quantity: string; label: string } = $props();
	const session = getSession();
	const view = getView();
	const ionIdx = $derived(session.experiment.ions.findIndex((i) => i.name === quantity));
	const withBath = $derived(view.traceBath && ionIdx >= 0);

	let host: HTMLDivElement;
	let wrap: HTMLDivElement;
	let plot: uPlot | null = null;
	let width = $state(300);
	let height = $state(120);

	const css = (name: string) => getComputedStyle(host).getPropertyValue(name).trim();

	function data(): uPlot.AlignedData {
		const probes = session.probes;
		if (probes.length === 0 && !withBath) return [[]];
		const t = session.traceT;
		const n = t.length;
		const ys = probes.map((c) => {
			const tr = session.traces.get(c);
			if (!tr) return new Array(n).fill(null);
			const src = quantity === 'vm' ? tr.vm.map((v) => (v === null ? null : v * 1e3)) : tr.cc[ionIdx];
			return src.length === n ? src : [...src, ...new Array(n - src.length).fill(null)];
		});
		if (withBath) ys.push(session.traceBath[ionIdx] ?? new Array(n).fill(null));
		return [t, ...ys];
	}

	function build() {
		plot?.destroy();
		const series: uPlot.Series[] = [{ label: 't' }];
		session.probes.forEach((c) => series.push({ label: `${c}`, stroke: session.probeColors[c] ?? '#888', width: 1.5 }));
		if (withBath) series.push({ label: 'bath', stroke: css('--muted-foreground'), width: 1, dash: [4, 3], scale: 'bath' });
		const fg = css('--muted-foreground'), grid = css('--border');
		const font = '10px ui-monospace, monospace';
		plot = new uPlot(
			{
				width, height, series,
				legend: { show: false },
				cursor: { drag: { x: true, y: false } },
				axes: [
					{ stroke: fg, grid: { stroke: grid }, ticks: { stroke: grid }, font, size: 22 },
					{ stroke: fg, grid: { stroke: grid }, ticks: { stroke: grid }, font, size: 58 },
					// the bath gets its own right-hand axis so a 145 mM bath doesn't flatten a 12 mM cell trace
					...(withBath ? [{ scale: 'bath', side: 1, stroke: fg, grid: { show: false }, ticks: { stroke: grid }, font, size: 52 }] : [])
				],
				scales: { x: { time: false }, bath: { auto: true } }
			},
			data(),
			host
		);
	}

	$effect(() => {
		void session.probes; void session.probeColors; void quantity; void width; void height; void withBath;
		build();
		return () => { plot?.destroy(); plot = null; };
	});
	$effect(() => {
		void session.traceVersion;
		plot?.setData(data());
	});
	$effect(() => {
		const ro = new ResizeObserver(([e]) => { width = Math.max(50, e.contentRect.width - 4); height = Math.max(60, e.contentRect.height - 14); });
		ro.observe(wrap);
		return () => ro.disconnect();
	});
</script>

<div bind:this={wrap} class="relative min-h-0 overflow-hidden">
	<div class="pointer-events-none absolute right-2 top-0.5 z-10 font-mono text-[10px] text-muted-foreground">{label}</div>
	<div bind:this={host} class="absolute inset-x-0.5 top-3"></div>
</div>
