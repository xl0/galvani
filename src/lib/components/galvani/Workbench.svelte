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
	import * as Resizable from '$lib/components/ui/resizable';
	import { Input } from '$lib/components/ui/input';

	const session = new SimSession();
	const view = new ViewState();
	setSession(session);
	setView(view);
	view.persist();

	onMount(() => {
		if (import.meta.env.DEV) (window as unknown as { galvani: unknown }).galvani = { session, view };
		session.start();
		return () => session.stop();
	});
	// side panes collapse by dragging past their minimum or with the [ ] keys; layout persists in localStorage
	let leftPane = $state<Resizable.Pane>();
	let rightPane = $state<Resizable.Pane>();
	function toggle(p: Resizable.Pane | undefined) { if (!p) return; if (p.isCollapsed()) p.expand(); else p.collapse(); }
	const unit = $derived(view.field === 'vm' ? 'mV' : view.field.startsWith('P:') || view.field === 'gj' ? 'open' : view.field === 'pump' ? 'mol/m²·s' : view.field === 'imem' ? 'A/m²' : view.field === 'venv' ? 'mV' : 'mM');
</script>

<svelte:window onkeydown={(e) => { if ((e.target as HTMLElement).closest?.('input,textarea,select')) return; if (e.key === '[') toggle(leftPane); if (e.key === ']') toggle(rightPane); }} />

<div class="workbench flex h-screen w-screen flex-col bg-background text-foreground">
	<div class="flex h-10 shrink-0 items-center border-b border-border">
		<div class="flex min-w-0 items-center gap-2 px-3">
			<span class="text-base font-semibold tracking-tight">Galvani</span>
			<Input class="h-7 w-44 border-0 bg-transparent px-1 shadow-none dark:bg-transparent" value={session.experiment.name} onchange={(e) => session.edit((x) => (x.name = (e.target as HTMLInputElement).value))} />
			<a href="/learn" class="text-xs text-muted-foreground underline decoration-dotted underline-offset-2" title="How the model works, from ions to tissues">learn</a>
		</div>
		<Toolbar />
	</div>
	<Resizable.PaneGroup direction="horizontal" autoSaveId="galvani-panes" class="min-h-0 flex-1">
		<Resizable.Pane bind:this={leftPane} defaultSize={20} minSize={12} collapsible collapsedSize={0} class="min-h-0 overflow-hidden">
			<ConfigPanel />
		</Resizable.Pane>
		<Resizable.Handle withHandle class="after:w-3 hover:bg-ring data-[active]:bg-ring [&>div]:h-10 [&>div]:w-1.5 [&>div]:bg-muted-foreground/60 [&>div]:hover:bg-ring" />
		<Resizable.Pane defaultSize={58} minSize={10} class="flex min-h-0 flex-col overflow-hidden">
			<div class="min-h-0 flex-1"><ClusterView /></div>
			<Playback />
			<div class="border-t border-border"><Colorbar range={view.range} {unit} /></div>
		</Resizable.Pane>
		<Resizable.Handle withHandle class="after:w-3 hover:bg-ring data-[active]:bg-ring [&>div]:h-10 [&>div]:w-1.5 [&>div]:bg-muted-foreground/60 [&>div]:hover:bg-ring" />
		<Resizable.Pane bind:this={rightPane} defaultSize={22} minSize={12} collapsible collapsedSize={0} class="min-h-0 overflow-hidden">
			<TracePanel />
		</Resizable.Pane>
	</Resizable.PaneGroup>
</div>
