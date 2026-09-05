<script lang="ts">
	import { getSession } from '$lib/sim/session.svelte';
	import { getView, PROFILE_COLORS } from '$lib/sim/view.svelte';
	import type { SimEvent } from '$lib/core/experiment';
	import { ghkVoltage, nernst } from '$lib/core/derived';
	import { presets } from '$lib/presets';
	import { fmt } from '$lib/format';
	import NumField from './NumField.svelte';
	import Section from './Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash-2';

	const session = getSession();
	const view = getView();
	const ex = $derived(session.experiment);
	const set = (fn: (e: typeof ex) => void) => session.edit(fn);

	// derived readouts that make the numbers interpretable
	const nernstMv = $derived(ex.ions.map((ion) => nernst(ion, ion.cCell, ion.cEnv, ex.params.T) * 1e3));
	const ghkMv = $derived(ghkVoltage(ex.ions, ex.ions.map((i) => i.cCell), ex.ions.map((i) => i.cEnv), ex.params.T) * 1e3);
	const ghkNowMv = $derived.by(() => {
		const s = session.snap, g = session.geom;
		if (!s || !g) return NaN;
		const n = g.nCells;
		const mean = (i: number) => { let a = 0; for (let c = 0; c < n; c++) a += s.cc[i * n + c]; return a / n; };
		return ghkVoltage(ex.ions, ex.ions.map((_, i) => mean(i)), Array.from(s.ccEnv), ex.params.T) * 1e3;
	});
	const vmMeanMv = $derived.by(() => {
		const s = session.snap;
		if (!s || s.vmAve.length === 0) return NaN;
		let a = 0; for (const v of s.vmAve) a += v;
		return (a / s.vmAve.length) * 1e3;
	});

	function loadPreset(id: string) {
		const p = presets.find((q) => q.id === id);
		if (!p) return;
		session.probes = [];
		session.setExperiment(p.make());
		session.reset();
	}
	function addProfile() {
		const n = ex.profiles.length;
		const id = `p${Date.now().toString(36)}`;
		set((e) => e.profiles.push({ id, name: `Region ${n + 1}`, color: PROFILE_COLORS[n % PROFILE_COLORS.length], cells: [], Dm: {}, pumpScale: 1, gjScale: 1 }));
		view.activeProfile = id;
		view.tool = 'paint';
	}
	function addEvent(kind: SimEvent['kind']) {
		const t = Math.ceil(session.snap?.t ?? 0);
		const profile = ex.profiles[0]?.id ?? '';
		set((e) => {
			if (kind === 'cut') e.events.push({ kind, t: t + 1, profile });
			else if (kind === 'perm') e.events.push({ kind, t: t + 1, tEnd: t + 6, ion: 'Na', profile: '', factor: 20 });
			else e.events.push({ kind, t: t + 1, tEnd: t + 6, profile: '', factor: 0 });
		});
	}
	const eventLabel: Record<SimEvent['kind'], string> = { perm: 'permeability ×', pump: 'pump rate ×', gj: 'gap junctions ×', cut: 'cut cells' };
</script>

<div class="flex h-full flex-col overflow-x-hidden overflow-y-auto text-xs">
	<div class="flex items-center gap-2 border-b border-border px-2 py-1.5">
		<select class="h-6 min-w-0 flex-1 rounded border border-input bg-background px-1" value="" onchange={(e) => { loadPreset((e.target as HTMLSelectElement).value); (e.target as HTMLSelectElement).value = ''; }}>
			<option value="" disabled>Load preset…</option>
			{#each presets as p (p.id)}<option value={p.id} title={p.blurb}>{p.name}</option>{/each}
		</select>
		<label class="flex items-center gap-1 text-muted-foreground" title="Show every parameter, including ones you rarely need to touch">
			<input type="checkbox" bind:checked={view.advanced} /> advanced
		</label>
	</div>

	<Section title="Cluster" blurb="A 2D patch of cells built from a jittered hex lattice. Changing these rebuilds the cluster and restarts the run.">
		<NumField label="seed" value={ex.generator.seed} step={1} help="Random seed for the lattice jitter. Same seed = same cluster." onchange={(v) => set((e) => (e.generator.seed = Math.round(v)))} />
		<NumField label="cell radius" value={ex.generator.cellRadius} scale={1e6} unit="µm" help="Nominal cell size; lattice spacing is twice this." onchange={(v) => set((e) => (e.generator.cellRadius = v))} />
		<NumField label="cluster radius" value={ex.generator.clipRadius} scale={1e6} unit="µm" help="Cells beyond this distance from the centre are dropped." onchange={(v) => set((e) => (e.generator.clipRadius = v))} />
		<NumField label="disorder" value={ex.generator.disorder} step={0.05} min={0} help="0 = perfect hexagons, 1 = fully jittered lattice." onchange={(v) => set((e) => (e.generator.disorder = v))} />
		{#if view.advanced}
			<NumField label="world size" value={ex.generator.worldSize} scale={1e6} unit="µm" help="Extent of the lattice before clipping." onchange={(v) => set((e) => (e.generator.worldSize = v))} />
			<NumField label="cell gap" value={ex.generator.cellSpacing} scale={1e9} unit="nm" help="Distance between neighbouring membranes; the gap-junction length." onchange={(v) => set((e) => (e.generator.cellSpacing = v))} />
			<NumField label="cell height" value={ex.generator.cellHeight} scale={1e6} unit="µm" help="Thickness of the 2D sheet, used for volumes and membrane areas." onchange={(v) => set((e) => (e.generator.cellHeight = v))} />
		{/if}
		<div class="text-muted-foreground">{session.geom?.nCells ?? 0} cells · {session.geom?.nMems ?? 0} membranes</div>
	</Section>

	<Section title="Run" blurb="Forward-Euler stepping. dt above ~0.01 s goes unstable with the default permeabilities.">
		<NumField label="time step" value={ex.params.dt} unit="s" help="Integration step. Smaller = more accurate and slower." onchange={(v) => set((e) => (e.params.dt = v))} />
		<NumField label="end time" value={ex.endTime} unit="s" help="The run pauses when it reaches this simulated time." onchange={(v) => set((e) => (e.endTime = v))} />
		{#if view.advanced}
			<NumField label="temperature" value={ex.params.T} unit="K" help="Sets thermal voltage RT/F in every flux equation." onchange={(v) => set((e) => (e.params.T = v))} />
			<NumField label="membrane C" value={ex.params.cm} unit="F/m²" help="Membrane capacitance per area. Vm = surface charge / C: lower C → faster, larger voltage swings." onchange={(v) => set((e) => (e.params.cm = v))} />
			<NumField label="bath volume" value={ex.params.volEnv} unit="m³" help="Volume of the well-mixed extracellular bath. Small = bath concentrations drift as cells pump." onchange={(v) => set((e) => (e.params.volEnv = v))} />
		{/if}
	</Section>

	<Section title="Ions" blurb="Initial concentrations and membrane permeability per ion. E_N is the Nernst potential: the Vm at which that ion stops moving.">
		<div class="grid grid-cols-[1.6rem_1fr_1fr_1.1fr_3rem] gap-1 text-muted-foreground"><span></span><span title="Initial intracellular concentration">in mM</span><span title="Initial bath concentration">out mM</span><span title="Membrane permeability (diffusion constant through the membrane). Higher = leakier.">perm m²/s</span><span title="Nernst potential">E_N mV</span></div>
		{#each ex.ions as ion, i (ion.name)}
			<div class="grid grid-cols-[1.6rem_1fr_1fr_1.1fr_3rem] items-center gap-1">
				<span class="font-mono">{ion.name}<sup>{ion.z > 0 ? '+' : '−'}</sup></span>
				<input type="number" class="h-6 min-w-0 rounded border border-input bg-background px-1 font-mono" value={ion.cCell} onchange={(e) => set((x) => (x.ions[i].cCell = +(e.target as HTMLInputElement).value))} />
				<input type="number" class="h-6 min-w-0 rounded border border-input bg-background px-1 font-mono" value={ion.cEnv} onchange={(e) => set((x) => (x.ions[i].cEnv = +(e.target as HTMLInputElement).value))} />
				<input type="number" class="h-6 min-w-0 rounded border border-input bg-background px-1 font-mono" value={ion.Dm} onchange={(e) => set((x) => (x.ions[i].Dm = +(e.target as HTMLInputElement).value))} />
				<span class="font-mono tabular-nums text-muted-foreground">{fmt(nernstMv[i], 3)}</span>
			</div>
		{/each}
		<div class="mt-1 grid grid-cols-[auto_1fr] gap-x-2 text-muted-foreground" title="Goldman-Hodgkin-Katz estimate of the resting Vm from permeabilities and concentrations. The pump drives Vm toward it over time.">
			<span>GHK Vm (initial / now)</span><span class="font-mono tabular-nums">{fmt(ghkMv, 3)} / {fmt(ghkNowMv, 3)} mV</span>
			<span>mean Vm now</span><span class="font-mono tabular-nums">{fmt(vmMeanMv, 3)} mV</span>
			{#if session.snap}<span>bath now</span><span class="font-mono tabular-nums">{ex.ions.map((ion, i) => `${ion.name} ${session.snap!.ccEnv[i].toFixed(1)}`).join('  ')}</span>{/if}
		</div>
	</Section>

	<Section title="Na/K pump" blurb="3 Na⁺ out, 2 K⁺ in per ATP. This is what polarizes the cells; rate 0 turns it off.">
		<NumField label="max rate" value={ex.params.alphaNaK} unit="mol/m²s" help="Maximum pump flux per membrane area. Higher = faster, more negative Vm." onchange={(v) => set((e) => (e.params.alphaNaK = v))} />
		{#if view.advanced}
			<NumField label="ATP" value={ex.params.cATP} unit="mM" help="Cytosolic ATP; with ADP and Pi sets the pump's thermodynamic drive." onchange={(v) => set((e) => (e.params.cATP = v))} />
			<NumField label="ADP" value={ex.params.cADP} unit="mM" onchange={(v) => set((e) => (e.params.cADP = v))} />
			<NumField label="Pi" value={ex.params.cPi} unit="mM" onchange={(v) => set((e) => (e.params.cPi = v))} />
			<NumField label="Km Na" value={ex.params.KmNK_Na} unit="mM" help="Half-saturation for intracellular Na⁺." onchange={(v) => set((e) => (e.params.KmNK_Na = v))} />
			<NumField label="Km K" value={ex.params.KmNK_K} unit="mM" help="Half-saturation for extracellular K⁺." onchange={(v) => set((e) => (e.params.KmNK_K = v))} />
		{/if}
	</Section>

	<Section title="Gap junctions" blurb="Channels between neighbouring cells. Ions electrodiffuse through them, coupling Vm across the tissue.">
		<NumField label="area fraction" value={ex.params.gjSurface} help="Fraction of each membrane that is gap-junction channel. Higher = stronger coupling." onchange={(v) => set((e) => (e.params.gjSurface = v))} />
		<label class="flex items-center gap-2" title="Junctions close when the voltage difference between the two cells exceeds the threshold (Harris et al. 1983)"><input type="checkbox" checked={ex.params.vSensitiveGj} onchange={(e) => set((x) => (x.params.vSensitiveGj = (e.target as HTMLInputElement).checked))} /> voltage gated</label>
		{#if view.advanced}
			<NumField label="V threshold" value={ex.params.gjVthresh} unit="mV" help="Transjunctional voltage where gating kicks in." onchange={(v) => set((e) => (e.params.gjVthresh = v))} />
			<NumField label="min open" value={ex.params.gjMin} help="Open fraction that remains when fully gated shut." onchange={(v) => set((e) => (e.params.gjMin = v))} />
		{/if}
	</Section>

	<Section title="Regions" blurb="Paint cells into a region to give them different membrane properties. Blank permeability = use the ion's default.">
		{#snippet actions()}<Button size="sm" variant="ghost" class="h-5 px-1" onclick={addProfile} title="Add a region, then paint cells on the canvas"><Plus class="size-3" /></Button>{/snippet}
		{#if ex.profiles.length === 0}<div class="text-muted-foreground">none yet</div>{/if}
		{#each ex.profiles as p, pi (p.id)}
			<div class="rounded border px-1.5 py-1 {view.activeProfile === p.id ? 'border-ring' : 'border-border'}">
				<div class="flex items-center gap-1">
					<input type="color" value={p.color} class="h-4 w-5 cursor-pointer border-0 bg-transparent p-0" onchange={(e) => set((x) => (x.profiles[pi].color = (e.target as HTMLInputElement).value))} />
					<input class="h-5 min-w-0 flex-1 bg-transparent px-1 font-medium outline-none" value={p.name} onchange={(e) => set((x) => (x.profiles[pi].name = (e.target as HTMLInputElement).value))} />
					<span class="text-muted-foreground">{p.cells.length} cells</span>
					<Button size="sm" variant={view.activeProfile === p.id ? 'default' : 'ghost'} class="h-5 px-1.5" title="Select this region and switch to the paint tool" onclick={() => { view.activeProfile = p.id; view.tool = 'paint'; }}>paint</Button>
					<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => session.cut(p.cells)} title="Remove these cells from the cluster now">cut</Button>
					<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => set((x) => x.profiles.splice(pi, 1))} title="Delete region"><Trash class="size-3" /></Button>
				</div>
				<div class="mt-1 flex flex-col gap-1">
					{#each ex.ions as ion (ion.name)}
						{#if view.advanced || ion.Dm > 0 || p.Dm[ion.name] !== undefined}
							<NumField label="{ion.name} perm" value={p.Dm[ion.name] ?? ion.Dm} unit="m²/s" help="Membrane permeability to {ion.name} in this region (default {ion.Dm})" onchange={(v) => set((x) => (x.profiles[pi].Dm[ion.name] = v))} />
						{/if}
					{/each}
					<NumField label="pump ×" value={p.pumpScale} step={0.1} min={0} help="Multiplier on the Na/K pump rate in this region. 0 = no pump." onchange={(v) => set((x) => (x.profiles[pi].pumpScale = v))} />
					<NumField label="junctions ×" value={p.gjScale} step={0.1} min={0} help="Multiplier on gap-junction conductance for membranes of this region. 0 = isolated cells." onchange={(v) => set((x) => (x.profiles[pi].gjScale = v))} />
				</div>
			</div>
		{/each}
	</Section>

	<Section title="Events" blurb="Timed interventions. Factors multiply the current value between start and end; a cut removes a region's cells permanently.">
		{#snippet actions()}
			<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => addEvent('perm')} title="Change an ion's permeability for a while">+perm</Button>
			<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => addEvent('pump')} title="Scale the pump rate for a while">+pump</Button>
			<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => addEvent('gj')} title="Scale gap-junction coupling for a while">+GJ</Button>
			<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => addEvent('cut')} disabled={ex.profiles.length === 0} title="Remove a region's cells at a given time (needs a region)">+cut</Button>
		{/snippet}
		{#if ex.events.length === 0}<div class="text-muted-foreground">none</div>{/if}
		{#each ex.events as ev, i (i)}
			<div class="rounded border border-border px-1.5 py-1">
				<div class="flex items-center gap-1">
					<span class="font-medium">{eventLabel[ev.kind]}</span>
					{#if ev.kind === 'perm'}
						<select class="h-5 rounded border border-input bg-background" value={ev.ion} onchange={(e) => set((x) => { const y = x.events[i]; if (y.kind === 'perm') y.ion = (e.target as HTMLSelectElement).value; })}>
							{#each ex.ions as ion (ion.name)}<option value={ion.name}>{ion.name}</option>{/each}
						</select>
					{/if}
					<select class="h-5 min-w-0 flex-1 rounded border border-input bg-background" value={ev.profile} onchange={(e) => set((x) => (x.events[i].profile = (e.target as HTMLSelectElement).value))}>
						{#if ev.kind !== 'cut'}<option value="">all cells</option>{/if}
						{#each ex.profiles as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
					</select>
					<Button size="sm" variant="ghost" class="h-5 px-1" onclick={() => set((x) => x.events.splice(i, 1))} title="Delete event"><Trash class="size-3" /></Button>
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
