<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import Pick from './Pick.svelte';
	import BigField from './BigField.svelte';
	import { getSession } from '$lib/sim/session.svelte';
	import { getView } from '$lib/sim/view.svelte';
	import { channelModels } from '$lib/core/channels';
	import { renderVideo, downloadBlob } from '$lib/video';
	import { fmt } from '$lib/format';

	let { open = $bindable(false) }: { open?: boolean } = $props();
	const session = getSession();
	const view = getView();
	const fieldOptions = $derived([
		{ value: 'vm', label: 'Vm' },
		...session.experiment.ions.map((i) => ({ value: i.name, label: `[${i.name}]` })),
		...(session.view?.env ? [{ value: 'venv', label: 'V env' }] : []),
		{ value: 'gj', label: 'GJ open' }, { value: 'pump', label: 'pump rate' }, { value: 'imem', label: 'membrane current' },
		...(session.view?.channels ?? []).map((ch) => ({ value: `P:${ch.id}`, label: `open ${channelModels[ch.type]?.label ?? ch.type}` })),
		...(session.view?.subs ?? []).map((x) => ({ value: `S:${x.name}`, label: `[${x.name}]` }))
	]);
	const traceOptions = $derived([{ value: 'vm', label: 'Vm' }, ...session.experiment.ions.map((i) => ({ value: i.name, label: `[${i.name}]` })), ...session.subNames.map((n) => ({ value: `S:${n}`, label: n }))]);
	let fields = $state<string[]>([]);
	let traces = $state<string[]>([]);
	let speed = $state('1');
	let fps = $state(30);
	let width = $state(1280);
	let rangeMode = $state<'run' | 'frame'>('run');
	let busy = $state(false);
	let progress = $state(0);
	let error = $state('');
	$effect(() => { if (open) { fields = [view.field]; traces = session.probes.length || session.bathProbe ? [...view.traceQuantities] : []; error = ''; } });
	const span = $derived(session.history.length ? session.history[session.history.length - 1].t - session.history[0].t : 0);
	const duration = $derived(span / Number(speed));
	const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
	async function go() {
		busy = true; error = ''; progress = 0;
		try {
			const blob = await renderVideo(session, { fields, traces, speed: Number(speed), fps, width: Math.round(width / 2) * 2, colormap: view.colormap, rangeMode, dark: document.documentElement.classList.contains('dark') }, (f) => (progress = f));
			downloadBlob(`${session.experiment.name.replace(/[^\w.-]+/g, '_')}.webm`, blob);
			open = false;
		} catch (e) { error = e instanceof Error ? e.message : String(e); }
		busy = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="w-[min(96vw,44rem)] sm:max-w-none">
		<Dialog.Header>
			<Dialog.Title>Export video</Dialog.Title>
			<Dialog.Description>Renders the recorded frames ({session.history.length}, {fmt(span, 3)} s of simulation) into a WebM file. One panel per field; traces as strips below.</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4 text-sm">
			<div>
				<div class="mb-1 font-medium">Fields</div>
				<div class="flex flex-wrap gap-x-4 gap-y-1">
					{#each fieldOptions as f (f.value)}<Label class="gap-1.5 font-normal"><Checkbox checked={fields.includes(f.value)} onCheckedChange={() => (fields = toggle(fields, f.value))} /> {f.label}</Label>{/each}
				</div>
			</div>
			<div>
				<div class="mb-1 font-medium">Traces <span class="font-normal text-muted-foreground">({session.probes.length + (session.bathProbe ? 1 : 0)} probes)</span></div>
				<div class="flex flex-wrap gap-x-4 gap-y-1">
					{#each traceOptions as q (q.value)}<Label class="gap-1.5 font-normal"><Checkbox checked={traces.includes(q.value)} onCheckedChange={() => (traces = toggle(traces, q.value))} /> {q.label}</Label>{/each}
				</div>
			</div>
			<div class="grid grid-cols-[10rem_1fr] items-center gap-x-3 gap-y-2">
				<span>Speed</span>
				<div class="flex items-center gap-2"><Pick items={['0.01', '0.1', '0.5', '1', '2', '5', '10', '30', '100', '1000'].map((v) => ({ value: v, label: `${v}× real time` }))} value={speed} onchange={(v) => (speed = v)} /><span class="text-muted-foreground">→ {duration > 0 ? `${fmt(duration, 3)} s of video at ${fps} fps` : 'nothing recorded'}</span></div>
				<span>Colour range</span>
				<Pick items={[{ value: 'run', label: 'over the whole run (stable colours)' }, { value: 'frame', label: 'per frame' }]} value={rangeMode} onchange={(v) => (rangeMode = v as 'run' | 'frame')} />
			</div>
			<BigField label="Frame width" value={width} step={2} min={320} unit="px" description="Panels share the width (up to three per row); height follows." onchange={(v) => (width = v)} />
			<BigField label="Frame rate" value={fps} step={1} min={1} unit="fps" description="Frames between recorded snapshots repeat the last one, so rates above the snapshot rate only smooth the clock." onchange={(v) => (fps = v)} />
			{#if error}<div class="text-destructive">{error}</div>{/if}
		</div>
		<Dialog.Footer class="items-center">
			{#if busy}<span class="mr-auto font-mono text-xs text-muted-foreground">rendering {Math.round(progress * 100)} %</span>{/if}
			<Button variant="ghost" onclick={() => (open = false)} disabled={busy}>Cancel</Button>
			<Button onclick={go} disabled={busy || fields.length === 0 || session.history.length < 2}>Export</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
