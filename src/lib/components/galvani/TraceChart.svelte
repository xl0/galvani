<script lang="ts">
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import { getSession } from '$lib/sim/session.svelte';
	import { PROBE_COLORS } from '$lib/sim/view.svelte';

	/** One stacked chart: a series per probe for one quantity ('vm' or an ion name). */
	let { quantity, label }: { quantity: string; label: string } = $props();
	const session = getSession();

	let host: HTMLDivElement;
	let wrap: HTMLDivElement;
	let plot: uPlot | null = null;
	let width = $state(300);
	let height = $state(120);

	const css = (name: string) => getComputedStyle(host).getPropertyValue(name).trim();

	function data(): uPlot.AlignedData {
		const probes = session.probes;
		if (probes.length === 0) return [[]];
		const ionIdx = session.experiment.ions.findIndex((i) => i.name === quantity);
		const ref = probes.map((c) => session.traces.get(c)?.t ?? []);
		const n = Math.min(...ref.map((r) => r.length));
		const t = ref[0].slice(0, n);
		const ys = probes.map((c) => {
			const tr = session.traces.get(c);
			if (!tr) return new Array(n).fill(null);
			const src = quantity === 'vm' ? tr.vm.map((v) => v * 1e3) : tr.cc[ionIdx];
			return src.slice(0, n);
		});
		return [t, ...ys];
	}

	function build() {
		plot?.destroy();
		const series: uPlot.Series[] = [{ label: 't' }];
		session.probes.forEach((c, k) => series.push({ label: `${c}`, stroke: PROBE_COLORS[k % PROBE_COLORS.length], width: 1.5 }));
		const fg = css('--muted-foreground'), grid = css('--border');
		const font = '10px ui-monospace, monospace';
		plot = new uPlot(
			{
				width, height, series,
				legend: { show: false },
				cursor: { drag: { x: true, y: false } },
				axes: [
					{ stroke: fg, grid: { stroke: grid }, ticks: { stroke: grid }, font, size: 22 },
					{ stroke: fg, grid: { stroke: grid }, ticks: { stroke: grid }, font, size: 46 }
				],
				scales: { x: { time: false } }
			},
			data(),
			host
		);
	}

	$effect(() => {
		void session.probes.length; void quantity; void width; void height;
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
