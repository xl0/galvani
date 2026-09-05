<script lang="ts">
	import uPlot from 'uplot';
	import 'uplot/dist/uPlot.min.css';
	import { getSession } from '$lib/sim/session.svelte';
	import { PROBE_COLORS } from '$lib/sim/view.svelte';
	import * as Select from '$lib/components/ui/select';

	const session = getSession();
	let quantity = $state('vm');
	const options = $derived([{ value: 'vm', label: 'Vm (mV)' }, ...session.experiment.ions.map((i) => ({ value: i.name, label: `[${i.name}] (mM)` }))]);

	let host: HTMLDivElement;
	let plot: uPlot | null = null;
	let width = $state(300);
	let height = $state(200);

	function css(name: string) {
		return getComputedStyle(host).getPropertyValue(name).trim();
	}

	function build() {
		plot?.destroy();
		const series: uPlot.Series[] = [{ label: 't (s)' }];
		session.probes.forEach((c, k) => series.push({ label: `cell ${c}`, stroke: PROBE_COLORS[k % PROBE_COLORS.length], width: 1.5 }));
		const fg = css('--muted-foreground'), grid = css('--border');
		plot = new uPlot(
			{
				width, height,
				series,
				legend: { show: true },
				cursor: { drag: { x: true, y: false } },
				axes: [
					{ stroke: fg, grid: { stroke: grid }, ticks: { stroke: grid }, font: '10px ui-monospace, monospace' },
					{ stroke: fg, grid: { stroke: grid }, ticks: { stroke: grid }, font: '10px ui-monospace, monospace', size: 44 }
				],
				scales: { x: { time: false } }
			},
			data(),
			host
		);
	}

	function data(): uPlot.AlignedData {
		const probes = session.probes;
		if (probes.length === 0) return [[]];
		const ionIdx = session.experiment.ions.findIndex((i) => i.name === quantity);
		// all probes share the same time base (sampled together); take the shortest
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
		const ro = new ResizeObserver(([e]) => { width = e.contentRect.width; height = Math.max(120, e.contentRect.height - 40); });
		ro.observe(host.parentElement!);
		return () => ro.disconnect();
	});
</script>

<div class="flex h-full flex-col">
	<div class="flex items-center gap-2 border-b border-border px-2 py-1 text-xs">
		<span class="font-medium">Traces</span>
		<Select.Root type="single" bind:value={quantity}>
			<Select.Trigger class="h-6 w-28 text-xs" size="sm">{options.find((o) => o.value === quantity)?.label}</Select.Trigger>
			<Select.Content>{#each options as o (o.value)}<Select.Item value={o.value} label={o.label} />{/each}</Select.Content>
		</Select.Root>
		<span class="ml-auto text-muted-foreground">{session.probes.length ? '' : 'click cells to probe'}</span>
	</div>
	<div class="min-h-0 flex-1 p-1"><div bind:this={host} class="trace-host"></div></div>
</div>

<style>
	:global(.trace-host .u-legend) { font: 10px ui-monospace, monospace; }
</style>
