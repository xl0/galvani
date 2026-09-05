<script lang="ts">
	import { colormapGradient } from '$lib/viz/colormap';
	import { getView } from '$lib/sim/view.svelte';
	import { fmt } from '$lib/format';
	const view = getView();
	let { range, unit }: { range: [number, number]; unit: string } = $props();
</script>

<div class="flex items-center gap-2 px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground">
	{#if view.autoRange}
		<span>{fmt(range[0], 4)}</span>
	{:else}
		<input type="number" class="h-6 w-20 rounded border border-input bg-background px-1" value={view.min} onchange={(e) => (view.min = +(e.target as HTMLInputElement).value)} title="Range minimum" />
	{/if}
	<div class="h-2.5 flex-1 rounded-sm border border-border" style="background: {colormapGradient(view.colormap)}"></div>
	{#if view.autoRange}
		<span>{fmt(range[1], 4)}</span>
	{:else}
		<input type="number" class="h-6 w-20 rounded border border-input bg-background px-1" value={view.max} onchange={(e) => (view.max = +(e.target as HTMLInputElement).value)} title="Range maximum" />
	{/if}
	<span class="w-8">{unit}</span>
	{#if view.autoRange}<button class="underline decoration-dotted" onclick={() => { view.min = +range[0].toPrecision(3); view.max = +range[1].toPrecision(3); view.autoRange = false; }} title="Freeze the current range so colours stay comparable across time">freeze</button>{:else}<button class="underline decoration-dotted" onclick={() => (view.autoRange = true)}>auto</button>{/if}
</div>
