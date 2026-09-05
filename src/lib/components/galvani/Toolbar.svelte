<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Select from '$lib/components/ui/select';
	import { getSession } from '$lib/sim/session.svelte';
	import { getView, type Tool } from '$lib/sim/view.svelte';
	import { colormapNames } from '$lib/viz/colormap';
	import { channelModels } from '$lib/core/channels';
	import Play from '@lucide/svelte/icons/play';
	import Pause from '@lucide/svelte/icons/pause';
	import StepForward from '@lucide/svelte/icons/step-forward';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Crosshair from '@lucide/svelte/icons/crosshair';
	import Brush from '@lucide/svelte/icons/brush';
	import Scissors from '@lucide/svelte/icons/scissors';
	import Sun from '@lucide/svelte/icons/sun';
	import Moon from '@lucide/svelte/icons/moon';
	import Download from '@lucide/svelte/icons/download';
	import Upload from '@lucide/svelte/icons/upload';
	import FileSpreadsheet from '@lucide/svelte/icons/file-spreadsheet';
	import { exportExperimentJson, exportTracesCsv, importExperimentJson } from '$lib/export';

	const session = getSession();
	const view = getView();

	const fields = $derived([
		{ value: 'vm', label: 'Vm' },
		...session.experiment.ions.map((i) => ({ value: i.name, label: `[${i.name}]` })),
		...(session.view?.channels ?? []).map((ch) => ({ value: `P:${ch.id}`, label: `open ${channelModels[ch.type]?.label ?? ch.type}` }))
	]);
	const tools: { id: Tool; icon: typeof Crosshair; title: string }[] = [
		{ id: 'probe', icon: Crosshair, title: 'Probe: click a cell to trace it' },
		{ id: 'paint', icon: Brush, title: 'Paint cells into the active profile (shift: erase)' },
		{ id: 'cut', icon: Scissors, title: 'Cut: remove cells under the brush' }
	];
	let dark = $state(false);
	$effect(() => {
		dark = document.documentElement.classList.contains('dark');
	});
	function toggleDark() {
		dark = !dark;
		document.documentElement.classList.toggle('dark', dark);
		localStorage.setItem('galvani-theme', dark ? 'dark' : 'light');
	}
	const speeds = [1, 5, 25, 100, 400];
	async function doImport() {
		try {
			const exp = await importExperimentJson();
			if (exp) { session.probes = []; session.setExperiment(exp); session.reset(); }
		} catch (e) { session.error = `import failed: ${e instanceof Error ? e.message : e}`; }
	}
</script>

<div class="flex h-10 items-center gap-1 border-b border-border px-2 text-sm">
	{#if session.running}
		<Button size="sm" variant="secondary" class="h-7 px-2" onclick={() => session.pause()} title="Pause"><Pause class="size-3.5" /></Button>
	{:else}
		<Button size="sm" class="h-7 px-2" onclick={() => session.run()} title="Run"><Play class="size-3.5" /></Button>
	{/if}
	<Button size="sm" variant="ghost" class="h-7 px-2" onclick={() => session.step(1)} title="Step once" disabled={session.running}><StepForward class="size-3.5" /></Button>
	<Button size="sm" variant="ghost" class="h-7 px-2" onclick={() => session.reset()} title="Reset to t = 0"><RotateCcw class="size-3.5" /></Button>

	<span class="ml-2 font-mono tabular-nums text-muted-foreground">t = {(session.view?.t ?? 0).toFixed(3)} s</span>
	<span class="font-mono tabular-nums text-muted-foreground">step {session.view?.step ?? 0}</span>

	<div class="mx-2 h-5 w-px bg-border"></div>

	<Select.Root type="single" bind:value={view.field}>
		<Select.Trigger class="h-8 w-32 text-sm" size="sm">{fields.find((f) => f.value === view.field)?.label ?? view.field}</Select.Trigger>
		<Select.Content>
			{#each fields as f (f.value)}<Select.Item value={f.value} label={f.label} />{/each}
		</Select.Content>
	</Select.Root>
	<Select.Root type="single" bind:value={view.colormap}>
		<Select.Trigger class="h-8 w-28 text-sm" size="sm">{view.colormap}</Select.Trigger>
		<Select.Content>
			{#each colormapNames as c (c)}<Select.Item value={c} label={c} />{/each}
		</Select.Content>
	</Select.Root>
	<label class="ml-1 flex items-center gap-1 text-muted-foreground"><input type="checkbox" bind:checked={view.autoRange} /> auto range</label>
	<label class="ml-1 flex items-center gap-1 text-muted-foreground" title="Colour each membrane segment by its own value (Vm, channel open fraction) instead of the cell average"><input type="checkbox" bind:checked={view.showMembranes} /> membranes</label>

	<div class="mx-2 h-5 w-px bg-border"></div>

	{#each tools as t (t.id)}
		<Button size="sm" variant={view.tool === t.id ? 'default' : 'ghost'} class="h-7 px-2" title={t.title} onclick={() => (view.tool = t.id)}>
			<t.icon class="size-3.5" />
		</Button>
	{/each}
	{#if view.tool !== 'probe'}
		<label class="flex items-center gap-1 text-muted-foreground">brush
			<input type="range" min="0.5" max="6" step="0.5" bind:value={view.brush} class="w-16" />
		</label>
	{/if}

	<div class="mx-2 h-5 w-px bg-border"></div>
	<Select.Root type="single" value={String(session.stepsPerTick)} onValueChange={(v) => session.setSpeed(Number(v))}>
		<Select.Trigger class="h-8 w-28 text-sm" size="sm">{session.stepsPerTick} steps/tick</Select.Trigger>
		<Select.Content>
			{#each speeds as s (s)}<Select.Item value={String(s)} label={`${s} steps/tick`} />{/each}
		</Select.Content>
	</Select.Root>

	<div class="mx-2 h-5 w-px bg-border"></div>
	<Button size="sm" variant="ghost" class="h-8 px-2" onclick={() => exportExperimentJson($state.snapshot(session.experiment))} title="Download this experiment as JSON"><Download class="size-4" /></Button>
	<Button size="sm" variant="ghost" class="h-8 px-2" onclick={doImport} title="Load an experiment JSON file"><Upload class="size-4" /></Button>
	<Button size="sm" variant="ghost" class="h-8 px-2" onclick={() => exportTracesCsv(session)} title="Download probe traces as CSV" disabled={session.probes.length === 0}><FileSpreadsheet class="size-4" /></Button>
	<div class="flex-1"></div>
	{#if session.error}<span class="truncate text-destructive" title={session.error}>{session.error}</span>{/if}
	<span class="font-mono tabular-nums text-muted-foreground">{session.stepsPerSec ? `${session.stepsPerSec.toFixed(0)} steps/s` : ''}</span>
	<Button size="sm" variant="ghost" class="h-7 px-2" onclick={toggleDark} title="Toggle theme">
		{#if dark}<Sun class="size-3.5" />{:else}<Moon class="size-3.5" />{/if}
	</Button>
</div>
