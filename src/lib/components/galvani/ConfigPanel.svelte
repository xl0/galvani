<script lang="ts">
	import { getSession } from '$lib/sim/session.svelte';
	import { getView, PROFILE_COLORS } from '$lib/sim/view.svelte';
	import type { SimEvent } from '$lib/core/experiment';
	import NumField from './NumField.svelte';
	import Section from './Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash-2';

	const session = getSession();
	const view = getView();
	const ex = $derived(session.experiment);

	const set = (fn: (e: typeof ex) => void) => session.edit(fn);

	function addProfile() {
		const n = ex.profiles.length;
		const id = `p${Date.now().toString(36)}`;
		set((e) => e.profiles.push({ id, name: `Profile ${n + 1}`, color: PROFILE_COLORS[n % PROFILE_COLORS.length], cells: [], Dm: {}, pumpScale: 1, gjScale: 1 }));
		view.activeProfile = id;
		view.tool = 'paint';
	}
	function addEvent(kind: SimEvent['kind']) {
		const t = session.snap?.t ?? 0;
		const profile = ex.profiles[0]?.id ?? '';
		set((e) => {
			if (kind === 'cut') e.events.push({ kind, t: t + 1, profile });
			else if (kind === 'perm') e.events.push({ kind, t: t + 1, tEnd: t + 5, ion: e.ions[0].name, profile: '', factor: 10 });
			else e.events.push({ kind, t: t + 1, tEnd: t + 5, profile: '', factor: 0 });
		});
	}
</script>

<div class="flex h-full flex-col overflow-x-hidden overflow-y-auto text-xs">
	<Section title="Mesh">
		<NumField label="seed" value={ex.generator.seed} step={1} onchange={(v) => set((e) => (e.generator.seed = Math.round(v)))} />
		<NumField label="cell radius" value={ex.generator.cellRadius} scale={1e6} unit="µm" onchange={(v) => set((e) => (e.generator.cellRadius = v))} />
		<NumField label="cluster radius" value={ex.generator.clipRadius} scale={1e6} unit="µm" onchange={(v) => set((e) => (e.generator.clipRadius = v))} />
		<NumField label="world size" value={ex.generator.worldSize} scale={1e6} unit="µm" onchange={(v) => set((e) => (e.generator.worldSize = v))} />
		<NumField label="disorder" value={ex.generator.disorder} step={0.05} min={0} onchange={(v) => set((e) => (e.generator.disorder = v))} />
		<NumField label="cell spacing" value={ex.generator.cellSpacing} scale={1e9} unit="nm" onchange={(v) => set((e) => (e.generator.cellSpacing = v))} />
		<NumField label="cell height" value={ex.generator.cellHeight} scale={1e6} unit="µm" onchange={(v) => set((e) => (e.generator.cellHeight = v))} />
		<div class="text-muted-foreground">{session.geom?.nCells ?? 0} cells, {session.geom?.nMems ?? 0} membranes</div>
	</Section>

	<Section title="Run">
		<NumField label="dt" value={ex.params.dt} unit="s" onchange={(v) => set((e) => (e.params.dt = v))} />
		<NumField label="end time" value={ex.endTime} unit="s" onchange={(v) => set((e) => (e.endTime = v))} />
		<NumField label="temperature" value={ex.params.T} unit="K" onchange={(v) => set((e) => (e.params.T = v))} />
		<NumField label="Cm" value={ex.params.cm} unit="F/m²" onchange={(v) => set((e) => (e.params.cm = v))} />
		<NumField label="bath volume" value={ex.params.volEnv} unit="m³" onchange={(v) => set((e) => (e.params.volEnv = v))} />
	</Section>

	<Section title="Ions">
		<div class="grid grid-cols-[2rem_1fr_1fr_1fr] gap-1 text-muted-foreground"><span></span><span>cell mM</span><span>bath mM</span><span>Dm m²/s</span></div>
		{#each ex.ions as ion, i (ion.name)}
			<div class="grid grid-cols-[2rem_1fr_1fr_1fr] items-center gap-1">
				<span class="font-mono">{ion.name}<sup>{ion.z > 0 ? '+' : '−'}</sup></span>
				<input type="number" class="h-6 min-w-0 rounded border border-input bg-background px-1 font-mono" value={ion.cCell} onchange={(e) => set((x) => (x.ions[i].cCell = +(e.target as HTMLInputElement).value))} />
				<input type="number" class="h-6 min-w-0 rounded border border-input bg-background px-1 font-mono" value={ion.cEnv} onchange={(e) => set((x) => (x.ions[i].cEnv = +(e.target as HTMLInputElement).value))} />
				<input type="number" class="h-6 min-w-0 rounded border border-input bg-background px-1 font-mono" value={ion.Dm} onchange={(e) => set((x) => (x.ions[i].Dm = +(e.target as HTMLInputElement).value))} />
			</div>
		{/each}
		{#if session.snap}
			<div class="text-muted-foreground">bath now: {ex.ions.map((ion, i) => `${ion.name} ${session.snap!.ccEnv[i].toFixed(2)}`).join(', ')} mM</div>
		{/if}
	</Section>

	<Section title="Na/K pump">
		<NumField label="max rate" value={ex.params.alphaNaK} unit="mol/m²s" onchange={(v) => set((e) => (e.params.alphaNaK = v))} />
		<NumField label="ATP" value={ex.params.cATP} unit="mM" onchange={(v) => set((e) => (e.params.cATP = v))} />
		<NumField label="ADP" value={ex.params.cADP} unit="mM" onchange={(v) => set((e) => (e.params.cADP = v))} />
		<NumField label="Pi" value={ex.params.cPi} unit="mM" onchange={(v) => set((e) => (e.params.cPi = v))} />
		<NumField label="Km Na" value={ex.params.KmNK_Na} unit="mM" onchange={(v) => set((e) => (e.params.KmNK_Na = v))} />
		<NumField label="Km K" value={ex.params.KmNK_K} unit="mM" onchange={(v) => set((e) => (e.params.KmNK_K = v))} />
	</Section>

	<Section title="Gap junctions">
		<NumField label="surface frac" value={ex.params.gjSurface} onchange={(v) => set((e) => (e.params.gjSurface = v))} />
		<label class="flex items-center gap-2"><input type="checkbox" checked={ex.params.vSensitiveGj} onchange={(e) => set((x) => (x.params.vSensitiveGj = (e.target as HTMLInputElement).checked))} /> voltage gated (Harris 1983)</label>
		<NumField label="V threshold" value={ex.params.gjVthresh} unit="mV" onchange={(v) => set((e) => (e.params.gjVthresh = v))} />
		<NumField label="min open" value={ex.params.gjMin} onchange={(v) => set((e) => (e.params.gjMin = v))} />
	</Section>

	<Section title="Tissue profiles">
		{#snippet actions()}<Button size="sm" variant="ghost" class="h-5 px-1" onclick={addProfile} title="Add profile"><Plus class="size-3" /></Button>{/snippet}
		{#if ex.profiles.length === 0}<div class="text-muted-foreground">none — add one, then paint cells</div>{/if}
		{#each ex.profiles as p, pi (p.id)}
			<div class="rounded border px-1.5 py-1 {view.activeProfile === p.id ? 'border-ring' : 'border-border'}">
				<div class="flex items-center gap-1">
					<input type="color" value={p.color} class="h-4 w-5 cursor-pointer border-0 bg-transparent p-0" onchange={(e) => set((x) => (x.profiles[pi].color = (e.target as HTMLInputElement).value))} />
					<input class="h-5 min-w-0 flex-1 bg-transparent px-1 font-medium outline-none" value={p.name} onchange={(e) => set((x) => (x.profiles[pi].name = (e.target as HTMLInputElement).value))} />
					<span class="text-muted-foreground">{p.cells.length} cells</span>
					<Button size="sm" variant={view.activeProfile === p.id ? 'default' : 'ghost'} class="h-5 px-1.5" onclick={() => { view.activeProfile = p.id; view.tool = 'paint'; }}>paint</Button>
					<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => session.cut(p.cells)} title="Cut these cells now">cut</Button>
					<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => set((x) => x.profiles.splice(pi, 1))}><Trash class="size-3" /></Button>
				</div>
				<div class="mt-1 flex flex-col gap-1">
					{#each ex.ions as ion (ion.name)}
						<NumField label="Dm {ion.name}" value={p.Dm[ion.name] ?? ion.Dm} unit="m²/s" onchange={(v) => set((x) => (x.profiles[pi].Dm[ion.name] = v))} />
					{/each}
					<NumField label="pump ×" value={p.pumpScale} step={0.1} min={0} onchange={(v) => set((x) => (x.profiles[pi].pumpScale = v))} />
					<NumField label="GJ ×" value={p.gjScale} step={0.1} min={0} onchange={(v) => set((x) => (x.profiles[pi].gjScale = v))} />
				</div>
			</div>
		{/each}
	</Section>

	<Section title="Events">
		{#snippet actions()}
			<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => addEvent('perm')}>+perm</Button>
			<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => addEvent('pump')}>+pump</Button>
			<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => addEvent('gj')}>+GJ</Button>
			<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => addEvent('cut')} disabled={ex.profiles.length === 0}>+cut</Button>
		{/snippet}
		{#if ex.events.length === 0}<div class="text-muted-foreground">none</div>{/if}
		{#each ex.events as ev, i (i)}
			<div class="rounded border border-border px-1.5 py-1">
				<div class="flex items-center gap-1">
					<span class="font-medium">{ev.kind}</span>
					<select class="h-5 flex-1 rounded border border-input bg-background" value={ev.profile} onchange={(e) => set((x) => (x.events[i].profile = (e.target as HTMLSelectElement).value))}>
						{#if ev.kind !== 'cut'}<option value="">all cells</option>{/if}
						{#each ex.profiles as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
					</select>
					{#if ev.kind === 'perm'}
						<select class="h-5 rounded border border-input bg-background" value={ev.ion} onchange={(e) => set((x) => { const y = x.events[i]; if (y.kind === 'perm') y.ion = (e.target as HTMLSelectElement).value; })}>
							{#each ex.ions as ion (ion.name)}<option value={ion.name}>{ion.name}</option>{/each}
						</select>
					{/if}
					<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => set((x) => x.events.splice(i, 1))}><Trash class="size-3" /></Button>
				</div>
				<div class="mt-1 flex flex-col gap-1">
					<NumField label="start" value={ev.t} unit="s" onchange={(v) => set((x) => (x.events[i].t = v))} />
					{#if ev.kind !== 'cut'}
						<NumField label="end" value={ev.tEnd} unit="s" onchange={(v) => set((x) => { const y = x.events[i]; if (y.kind !== 'cut') y.tEnd = v; })} />
						<NumField label="factor ×" value={ev.factor} step={0.1} min={0} onchange={(v) => set((x) => { const y = x.events[i]; if (y.kind !== 'cut') y.factor = v; })} />
					{/if}
				</div>
			</div>
		{/each}
	</Section>
</div>
