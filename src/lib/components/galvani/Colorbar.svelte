<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { colormapGradient, colormapNames, type ColormapName } from '$lib/viz/colormap';
	import Pick from './Pick.svelte';
	import { getView, type RangeSetting } from '$lib/sim/view.svelte';
	import { fmt } from '$lib/format';
	const view = getView();
	let { range, unit }: { range: [number, number]; unit: string } = $props();
</script>

<div class="flex items-center gap-2 px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground">
	{#if view.rangeSetting.mode === 'fixed'}
		<Input type="number" class="h-6 w-20 px-1 font-mono text-xs md:text-xs" value={view.rangeSetting.min} onchange={(e) => view.setRange({ min: +(e.target as HTMLInputElement).value })} title="Range minimum" />
	{:else}
		<span>{fmt(range[0], 4)}</span>
	{/if}
	<div class="h-2.5 flex-1 rounded-sm border border-border" style="background: {colormapGradient(view.colormap)}"></div>
	{#if view.rangeSetting.mode === 'fixed'}
		<Input type="number" class="h-6 w-20 px-1 font-mono text-xs md:text-xs" value={view.rangeSetting.max} onchange={(e) => view.setRange({ max: +(e.target as HTMLInputElement).value })} title="Range maximum" />
	{:else}
		<span>{fmt(range[1], 4)}</span>
	{/if}
	<span class="w-8">{unit}</span>
	<Pick class="h-6 px-1.5 text-xs" items={colormapNames.map((c) => ({ value: c, label: c }))} value={view.colormap} onchange={(v) => (view.colormap = v as ColormapName)} title="Colour map" />
	<Pick class="h-6 px-1.5 text-xs" items={[{ value: 'frame', label: 'range: frame' }, { value: 'run', label: 'range: run' }, { value: 'fixed', label: 'range: fixed' }]} value={view.rangeSetting.mode} onchange={(v) => view.setRange({ mode: v as RangeSetting['mode'] })} title="Colour range: this frame's min/max, the min/max over the run so far, or fixed values (per field)" />
	{#if view.rangeSetting.mode !== 'fixed'}<Button variant="link" size="sm" class="h-5 px-0 font-mono text-xs" onclick={() => view.setRange({ mode: 'fixed', min: +range[0].toPrecision(3), max: +range[1].toPrecision(3) })} title="Freeze the current range as this field's fixed range">freeze</Button>{/if}
</div>
