<script lang="ts">
	import { colormapGradient } from '$lib/viz/colormap';
	import { getView } from '$lib/sim/view.svelte';
	import { fmt } from '$lib/format';
	const view = getView();
	let { range, unit }: { range: [number, number]; unit: string } = $props();
</script>

<div class="flex items-center gap-2 px-2 py-1 font-mono text-[11px] tabular-nums text-muted-foreground">
	<span>{fmt(range[0], 4)}</span>
	<div class="h-2.5 flex-1 rounded-sm border border-border" style="background: {colormapGradient(view.colormap)}"></div>
	<span>{fmt(range[1], 4)}</span>
	<span class="w-8">{unit}</span>
</div>
