<script lang="ts">
	import * as ToggleGroup from '$lib/components/ui/toggle-group';
	import { Badge } from '$lib/components/ui/badge';
	import { getSession } from '$lib/sim/session.svelte';
	import { getView } from '$lib/sim/view.svelte';
	import TraceChart from './TraceChart.svelte';
	import { fieldLabel, fieldUnit } from '$lib/viz/fields';

	const session = getSession();
	const view = getView();
	const quantities = $derived([{ id: 'vm', label: 'Vm', unit: 'mV' }, ...session.experiment.ions.map((i) => ({ id: i.name, label: `[${i.name}]`, unit: 'mM' })), ...session.extraNames.map((id) => ({ id, label: fieldLabel(id, session.snap), unit: fieldUnit(id) }))]);
	const shown = $derived(quantities.filter((q) => view.traceQuantities.includes(q.id)));

	const nProbes = $derived(session.probes.length + (session.bathProbe ? 1 : 0));
</script>

<div class="flex h-full flex-col">
	<div class="flex min-h-10 flex-wrap items-center gap-1 border-b py-1 border-border px-2 text-sm">
		<span class="mr-1 font-medium">Traces</span>
		<ToggleGroup.Root type="multiple" size="sm" variant="outline" spacing={1} class="flex-wrap" bind:value={view.traceQuantities}>
			{#each quantities as q (q.id)}<ToggleGroup.Item value={q.id} class="h-6 px-1.5 font-mono text-xs">{q.label}</ToggleGroup.Item>{/each}
		</ToggleGroup.Root>
		<span class="ml-auto text-muted-foreground">{#if nProbes}<Badge variant="secondary">{nProbes} probe{nProbes > 1 ? 's' : ''}</Badge>{:else}click cells or the bath to probe{/if}</span>
	</div>
	<div class="grid min-h-0 flex-1 gap-1 bg-muted" style="grid-template-rows: repeat({Math.max(1, shown.length)}, minmax(0, 1fr))">
		{#each shown as q (q.id)}
			<TraceChart quantity={q.id} label="{q.label} ({q.unit})" />
		{/each}
	</div>
</div>
