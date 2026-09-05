<script lang="ts">
	import { onMount } from 'svelte';
	import { SimSession, setSession } from '$lib/sim/session.svelte';
	import { ViewState, setView } from '$lib/sim/view.svelte';
	import ClusterView from './ClusterView.svelte';
	import Colorbar from './Colorbar.svelte';
	import ConfigPanel from './ConfigPanel.svelte';
	import Toolbar from './Toolbar.svelte';
	import TracePanel from './TracePanel.svelte';

	const session = new SimSession();
	const view = new ViewState();
	setSession(session);
	setView(view);

	onMount(() => {
		if (import.meta.env.DEV) (window as unknown as { galvani: unknown }).galvani = { session, view };
		session.start();
		return () => session.stop();
	});
	const unit = $derived(view.field === 'vm' ? 'mV' : 'mM');
</script>

<div class="grid h-screen w-screen grid-cols-[360px_minmax(0,1fr)_400px] grid-rows-[auto_minmax(0,1fr)_auto] bg-background text-foreground">
	<div class="row-span-3 border-r border-border">
		<div class="flex h-10 items-center gap-2 border-b border-border px-3">
			<span class="text-base font-semibold tracking-tight">Galvani</span>
			<input class="min-w-0 flex-1 bg-transparent text-sm outline-none" value={session.experiment.name} onchange={(e) => session.edit((x) => (x.name = (e.target as HTMLInputElement).value))} />
		</div>
		<div class="h-[calc(100vh-2.5rem)]"><ConfigPanel /></div>
	</div>
	<div class="col-span-2"><Toolbar /></div>
	<div class="min-h-0"><ClusterView /></div>
	<div class="row-span-2 min-h-0 border-l border-border"><TracePanel /></div>
	<div class="flex items-center border-t border-border">
		<div class="flex-1"><Colorbar range={view.range} {unit} /></div>
	</div>
</div>
