<script lang="ts">
	import { onMount } from 'svelte';
	import { SimSession, setSession } from '$lib/sim/session.svelte';
	import { ViewState, setView } from '$lib/sim/view.svelte';
	import ClusterView from './ClusterView.svelte';
	import Colorbar from './Colorbar.svelte';
	import Playback from './Playback.svelte';
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
	const unit = $derived(view.field === 'vm' ? 'mV' : view.field.startsWith('P:') ? 'open' : 'mM');
</script>

<div class="workbench grid h-screen w-screen grid-cols-[360px_minmax(0,1fr)_400px] grid-rows-[auto_minmax(0,1fr)_auto] bg-background text-foreground">
	<div class="row-span-3 border-r border-border">
		<div class="flex h-10 items-center gap-2 border-b border-border px-3">
			<span class="text-base font-semibold tracking-tight">Galvani</span>
			<input class="min-w-0 flex-1 bg-transparent text-sm outline-none" value={session.experiment.name} onchange={(e) => session.edit((x) => (x.name = (e.target as HTMLInputElement).value))} />
			<a href="/learn" class="text-xs text-muted-foreground underline decoration-dotted underline-offset-2" title="How the model works, from ions to tissues">learn</a>
		</div>
		<div class="h-[calc(100vh-2.5rem)]"><ConfigPanel /></div>
	</div>
	<div class="col-span-2"><Toolbar /></div>
	<div class="min-h-0"><ClusterView /></div>
	<div class="row-span-2 min-h-0 border-l border-border"><TracePanel /></div>
	<div>
		<Playback />
		<div class="border-t border-border"><Colorbar range={view.range} {unit} /></div>
	</div>
</div>
