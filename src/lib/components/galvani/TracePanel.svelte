<script lang="ts">
	import { getSession } from '$lib/sim/session.svelte';
	import { getView } from '$lib/sim/view.svelte';
	import TraceChart from './TraceChart.svelte';

	const session = getSession();
	const view = getView();
	const quantities = $derived([{ id: 'vm', label: 'Vm', unit: 'mV' }, ...session.experiment.ions.map((i) => ({ id: i.name, label: `[${i.name}]`, unit: 'mM' }))]);
	const shown = $derived(quantities.filter((q) => view.traceQuantities.includes(q.id)));

	function toggle(id: string) {
		view.traceQuantities = view.traceQuantities.includes(id) ? view.traceQuantities.filter((x) => x !== id) : [...view.traceQuantities, id];
	}
</script>

<div class="flex h-full flex-col">
	<div class="flex h-10 items-center gap-1 border-b border-border px-2 text-sm">
		<span class="mr-1 font-medium">Traces</span>
		{#each quantities as q (q.id)}
			<button
				class="rounded border px-1.5 py-0.5 font-mono {view.traceQuantities.includes(q.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}"
				onclick={() => toggle(q.id)}>{q.label}</button>
		{/each}
		<span class="ml-auto text-muted-foreground">{session.probes.length ? `${session.probes.length} probe${session.probes.length > 1 ? 's' : ''}` : 'click cells to probe'}</span>
	</div>
	<div class="grid min-h-0 flex-1 gap-px" style="grid-template-rows: repeat({Math.max(1, shown.length)}, minmax(0, 1fr))">
		{#each shown as q (q.id)}
			<TraceChart quantity={q.id} label="{q.label} ({q.unit})" />
		{/each}
	</div>
</div>
