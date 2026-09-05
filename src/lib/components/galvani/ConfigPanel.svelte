<script lang="ts">
	import { getSession } from '$lib/sim/session.svelte';
	import { getView, PROFILE_COLORS } from '$lib/sim/view.svelte';
	import type { SimEvent } from '$lib/core/experiment';
	import { ghkVoltage, nernst } from '$lib/core/derived';
	import { presets } from '$lib/presets';
	import { basicCaIons, basicIons } from '$lib/core/defaults';
	import { builtinShapes, maskFromFile, maskFromPath } from '$lib/mask';
	import { loadLibrary, removeFromLibrary, saveToLibrary } from '$lib/library';
	import { NetworkSchema } from '$lib/core/experiment';
	import Save from '@lucide/svelte/icons/save';
	import type { Mask } from '$lib/core/generator';
	import { channelModels, channelTypes } from '$lib/core/channels';
	import { fmt } from '$lib/format';
	import BigField from './BigField.svelte';
	import NumField from './NumField.svelte';
	import SettingsDialog from './SettingsDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash from '@lucide/svelte/icons/trash-2';

	const session = getSession();
	const view = getView();
	const ex = $derived(session.experiment);
	const set = (fn: (e: typeof ex) => void) => session.edit(fn);

	const nernstMv = $derived(ex.ions.map((ion) => nernst(ion, ion.cCell, ion.cEnv, ex.params.T) * 1e3));
	const ghkMv = $derived(ghkVoltage(ex.ions, ex.ions.map((i) => i.cCell), ex.ions.map((i) => i.cEnv), ex.params.T) * 1e3);
	const ghkNowMv = $derived.by(() => {
		const s = session.view, g = session.geom;
		if (!s || !g) return NaN;
		const n = g.nCells;
		const mean = (i: number) => { let a = 0; for (let c = 0; c < n; c++) a += s.cc[i * n + c]; return a / n; };
		return ghkVoltage(ex.ions, ex.ions.map((_, i) => mean(i)), Array.from(s.ccEnv), ex.params.T) * 1e3;
	});
	const vmMeanMv = $derived.by(() => {
		const s = session.view;
		if (!s || s.vmAve.length === 0) return NaN;
		let a = 0; for (const v of s.vmAve) a += v;
		return (a / s.vmAve.length) * 1e3;
	});

	let library = $state(loadLibrary());
	const inLibrary = $derived(library.some((e) => e.name === ex.name));
	function loadPreset(id: string) {
		const exp = id.startsWith('lib:') ? library.find((e) => e.name === id.slice(4)) : presets.find((q) => q.id === id)?.make();
		if (!exp) return;
		session.probes = [];
		session.setExperiment(structuredClone(exp));
		session.reset();
	}
	function savePreset() {
		const name = prompt('Save this experiment as', ex.name)?.trim();
		if (!name) return;
		set((e) => (e.name = name));
		library = saveToLibrary({ ...($state.snapshot(ex) as typeof ex), name });
	}
	function deletePreset() {
		if (confirm(`Remove "${ex.name}" from your saved experiments?`)) library = removeFromLibrary(ex.name);
	}
	function addProfile() {
		const n = ex.profiles.length;
		const id = `p${Date.now().toString(36)}`;
		set((e) => e.profiles.push({ id, name: `Region ${n + 1}`, color: PROFILE_COLORS[n % PROFILE_COLORS.length], cells: [], Dm: {}, pumpScale: 1, gjScale: 1 }));
		view.activeProfile = id;
		view.tool = 'paint';
	}
	function addEvent(kind: SimEvent['kind']) {
		const t = Math.ceil(session.view?.t ?? 0);
		const profile = ex.profiles[0]?.id ?? '';
		set((e) => {
			if (kind === 'cut') e.events.push({ kind, t: t + 1, profile });
			else if (kind === 'perm') e.events.push({ kind, t: t + 1, tEnd: t + 6, ion: 'Na', profile: '', factor: 20 });
			else e.events.push({ kind, t: t + 1, tEnd: t + 6, profile: '', factor: 0 });
		});
	}
	const hasCa = $derived(ex.ions.some((i) => i.name === 'Ca'));
	const maskLabel = $derived.by(() => {
		const m = ex.generator.mask;
		if (m.kind === 'circle') return `disc r ${fmt(m.radius * 1e6, 3)} µm`;
		if (m.kind === 'ellipse') return `ellipse ${fmt(m.rx * 1e6, 3)}×${fmt(m.ry * 1e6, 3)} µm`;
		if (m.kind === 'rect') return `rect ${fmt(m.w * 1e6, 3)}×${fmt(m.h * 1e6, 3)} µm`;
		return `shape "${m.name}"`;
	});
	function setShape(kind: string) {
		const W = ex.generator.worldSize;
		let mask: Mask;
		if (kind === 'circle') mask = { kind, radius: 0.43 * W };
		else if (kind === 'ellipse') mask = { kind, rx: 0.45 * W, ry: 0.28 * W };
		else if (kind === 'rect') mask = { kind, w: 0.8 * W, h: 0.5 * W };
		else mask = maskFromPath(builtinShapes[kind].path, builtinShapes[kind].label);
		set((e) => (e.generator.mask = mask));
	}
	async function uploadShape(e: Event) {
		const f = (e.target as HTMLInputElement).files?.[0];
		if (!f) return;
		try { const mask = await maskFromFile(f); set((x) => (x.generator.mask = mask)); }
		catch (err) { session.error = String(err); }
		(e.target as HTMLInputElement).value = '';
	}
	const shapeKind = $derived(ex.generator.mask.kind === 'bitmap' ? (Object.entries(builtinShapes).find(([, s]) => s.label === (ex.generator.mask as { name: string }).name)?.[0] ?? 'custom') : ex.generator.mask.kind);
	function setIonSet(withCa: boolean) {
		set((e) => { e.ions = structuredClone(withCa ? basicCaIons : basicIons); if (!withCa) e.channels = e.channels.filter((ch) => channelModels[ch.type]?.ion !== 'Ca'); });
	}
	function addChannel() {
		const id = `ch${Date.now().toString(36)}`;
		set((e) => e.channels.push({ id, type: 'Kv1p5', maxDm: 1e-15, profile: '', enabled: true, activators: [], inhibitors: [] }));
	}
	// network edited as JSON (validated with the schema)
	let netText = $state('');
	let netError = $state('');
	$effect(() => { netText = JSON.stringify(ex.network ?? { substances: [], reactions: [], modulators: [], affectCharge: true }, null, 2); });
	function applyNetwork() {
		try {
			const parsed = NetworkSchema.parse(JSON.parse(netText));
			netError = '';
			set((e) => (e.network = parsed.substances.length ? parsed : null));
		} catch (err) { netError = err instanceof Error ? err.message.split('\n').slice(0, 6).join(' ') : String(err); }
	}
	const netSummary = $derived.by(() => {
		const n = ex.network;
		if (!n || n.substances.length === 0) return 'none';
		return `${n.substances.map((s) => s.name).join(', ')}${n.reactions.length ? ` · ${n.reactions.length} reaction${n.reactions.length > 1 ? 's' : ''}` : ''}${n.modulators.length ? ` · ${n.modulators.length} modulator${n.modulators.length > 1 ? 's' : ''}` : ''}`;
	});
	const eventLabel: Record<SimEvent['kind'], string> = { perm: 'permeability ×', pump: 'pump rate ×', gj: 'gap junctions ×', cut: 'cut cells' };
	const inputCls = 'h-7 w-full min-w-0 rounded-md border border-input bg-background px-1.5 font-mono text-sm tabular-nums';
</script>

<div class="flex h-full flex-col overflow-x-hidden overflow-y-auto">
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<select class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" value="" onchange={(e) => { loadPreset((e.target as HTMLSelectElement).value); (e.target as HTMLSelectElement).value = ''; }}>
			<option value="" disabled>Load an experiment…</option>
			<optgroup label="Presets">
				{#each presets as p (p.id)}<option value={p.id} title={p.blurb}>{p.name}</option>{/each}
			</optgroup>
			{#if library.length}
				<optgroup label="Saved in this browser">
					{#each library as e (e.name)}<option value={'lib:' + e.name}>{e.name}</option>{/each}
				</optgroup>
			{/if}
		</select>
		<Button size="sm" variant="outline" class="h-8 px-2" onclick={savePreset} title="Save the current experiment in this browser"><Save class="size-4" /></Button>
		{#if inLibrary}<Button size="sm" variant="ghost" class="h-8 px-2" onclick={deletePreset} title="Remove this saved experiment"><Trash class="size-4" /></Button>{/if}
	</div>

	<SettingsDialog title="Cluster" blurb="The tissue: a 2D sheet of cells built from a jittered hexagonal lattice, cut to a disc. Changing anything here rebuilds the cluster and restarts the run.">
		{#snippet summary()}
			{session.geom?.nCells ?? 0} cells · {maskLabel} · cell {fmt(ex.generator.cellRadius * 1e6, 2)} µm · seed {ex.generator.seed}
		{/snippet}
		{#snippet form()}
			<BigField label="Seed" value={ex.generator.seed} step={1} description="Random seed for the lattice jitter. The same seed always gives the same cluster." onchange={(v) => set((e) => (e.generator.seed = Math.round(v)))} />
			<BigField label="Cell radius" value={ex.generator.cellRadius} scale={1e6} unit="µm" description="Nominal cell size. Lattice spacing is twice this, so it sets how many cells fit in the cluster." onchange={(v) => set((e) => (e.generator.cellRadius = v))} />
			<div class="grid grid-cols-[10rem_1fr] items-start gap-x-3 gap-y-0.5 py-2">
				<span class="pt-1.5 text-sm font-medium">Shape</span>
				<span class="flex flex-wrap items-center gap-2">
					<select class="h-8 rounded-md border border-input bg-background px-2 text-sm" value={shapeKind} onchange={(e) => { const k = (e.target as HTMLSelectElement).value; if (k !== 'custom') setShape(k); }}>
						<option value="circle">Disc</option>
						<option value="ellipse">Ellipse</option>
						<option value="rect">Rectangle</option>
						{#each Object.entries(builtinShapes) as [k, s] (k)}<option value={k}>{s.label}</option>{/each}
						<option value="custom">Custom outline…</option>
					</select>
					<label class="cursor-pointer rounded-md border border-input px-2 py-1.5 text-sm hover:bg-accent">
						upload SVG / PNG<input type="file" accept=".svg,.png,image/svg+xml,image/png" class="hidden" onchange={uploadShape} />
					</label>
				</span>
				<span class="col-start-2 text-sm leading-snug text-muted-foreground">Which lattice cells are kept. An uploaded image is fitted to the world square; opaque, non-white pixels count as tissue.</span>
			</div>
			{#if ex.generator.mask.kind === 'circle'}
				<BigField label="Cluster radius" value={ex.generator.mask.radius} scale={1e6} unit="µm" description="Cells whose centre is farther than this from the middle are dropped." onchange={(v) => set((e) => (e.generator.mask = { kind: 'circle', radius: v }))} />
			{:else if ex.generator.mask.kind === 'ellipse'}
				<BigField label="Half-width" value={ex.generator.mask.rx} scale={1e6} unit="µm" onchange={(v) => set((e) => { if (e.generator.mask.kind === 'ellipse') e.generator.mask.rx = v; })} />
				<BigField label="Half-height" value={ex.generator.mask.ry} scale={1e6} unit="µm" onchange={(v) => set((e) => { if (e.generator.mask.kind === 'ellipse') e.generator.mask.ry = v; })} />
			{:else if ex.generator.mask.kind === 'rect'}
				<BigField label="Width" value={ex.generator.mask.w} scale={1e6} unit="µm" onchange={(v) => set((e) => { if (e.generator.mask.kind === 'rect') e.generator.mask.w = v; })} />
				<BigField label="Height" value={ex.generator.mask.h} scale={1e6} unit="µm" onchange={(v) => set((e) => { if (e.generator.mask.kind === 'rect') e.generator.mask.h = v; })} />
			{/if}
			<BigField label="Disorder" value={ex.generator.disorder} step={0.05} min={0} description="0 gives perfect hexagons; 1 jitters each lattice point by up to a full cell diameter, giving irregular polygons." onchange={(v) => set((e) => (e.generator.disorder = v))} />
			<BigField label="World size" value={ex.generator.worldSize} scale={1e6} unit="µm" description="Extent of the lattice before clipping. Must exceed twice the cluster radius." onchange={(v) => set((e) => (e.generator.worldSize = v))} />
			<BigField label="Cell gap" value={ex.generator.cellSpacing} scale={1e9} unit="nm" description="Distance between neighbouring membranes; the length of a gap-junction channel. Flux through a junction scales as 1/gap." onchange={(v) => set((e) => (e.generator.cellSpacing = v))} />
			<BigField label="Cell height" value={ex.generator.cellHeight} scale={1e6} unit="µm" description="Thickness of the sheet in the third dimension. Only enters volumes and membrane areas, so it scales how fast concentrations respond to fluxes." onchange={(v) => set((e) => (e.generator.cellHeight = v))} />
		{/snippet}
		{#snippet explain()}
			<h4>What the cluster is</h4>
			<p>Each polygon is one <b>cell</b>. Each polygon edge is a <b>membrane segment</b> with its own voltage, permeabilities and pump density. Where two cells touch, their two facing membranes form a <b>gap junction</b>. Edges on the outside face the <b>bath</b>.</p>
			<h4>How it is built</h4>
			<p>Points are placed on a hexagonal lattice with spacing 2 × cell radius, jittered by <i>disorder</i>, then turned into a Voronoi tessellation. Cells inside the cluster radius are kept and shrunk slightly toward their centre to open the cell gap.</p>
			<h4>Why it matters</h4>
			<ul>
				<li>Cell size sets the surface-to-volume ratio: small cells change concentration faster for the same membrane flux.</li>
				<li>Disorder makes every cell slightly different, which is what lets patterns break symmetry.</li>
				<li>More cells = slower simulation, roughly linearly.</li>
			</ul>
			<p>This mirrors BETSE's world construction (Pietak &amp; Levin 2016) but is not numerically identical; validation cases use meshes exported from BETSE itself.</p>
		{/snippet}
	</SettingsDialog>

	<SettingsDialog title="Run" blurb="Time stepping and the physical constants that set the scale of the response.">
		{#snippet summary()}dt {fmt(ex.params.dt, 2)} s · end {fmt(ex.endTime, 3)} s · V₀ {fmt(ex.initialVm * 1e3, 3)} mV · {fmt(ex.params.T, 3)} K{/snippet}
		{#snippet form()}
			<BigField label="Time step" value={ex.params.dt} unit="s" description="Integration step. Smaller is more accurate and slower. With default permeabilities, steps above ~0.01 s go unstable (Vm explodes, run halts)." onchange={(v) => set((e) => (e.params.dt = v))} />
			<BigField label="End time" value={ex.endTime} unit="s" description="The run pauses when simulated time reaches this. Press Run again to restart from zero." onchange={(v) => set((e) => (e.endTime = v))} />
			<BigField label="Initial Vm" value={ex.initialVm} scale={1e3} unit="mV" description="Starting membrane voltage. Realized by adding a little balancing anion inside each cell so the charge-capacitor relation gives this Vm at t = 0. Saves waiting a minute for the pump to polarize the cluster." onchange={(v) => set((e) => (e.initialVm = v))} />
			<BigField label="Temperature" value={ex.params.T} unit="K" description="Sets the thermal voltage RT/F (about 26.7 mV at 310 K) that appears in every flux and Nernst equation." onchange={(v) => set((e) => (e.params.T = v))} />
			<BigField label="Membrane capacitance" value={ex.params.cm} unit="F/m²" description="Charge per area per volt. Vm = surface charge / capacitance, so lower values make Vm swing further for the same ion movement. Real membranes are ~0.01 F/m²; BETSE uses 0.05." onchange={(v) => set((e) => (e.params.cm = v))} />
			<BigField label="Bath volume" value={ex.params.volEnv} scale={1e6} unit="mL" description="The extracellular medium is one well-mixed compartment of this volume (BETSE default 2.25e-7 mL, i.e. a thin film over the cluster). Make it small to see bath concentrations drift as cells pump; large to hold them fixed." onchange={(v) => set((e) => (e.params.volEnv = v))} />
		{/snippet}
		{#snippet explain()}
			<h4>Time stepping</h4>
			<p>Every step, in order: pump fluxes → per-ion membrane and gap-junction fluxes → concentrations updated → voltage recomputed. Plain forward Euler with a fixed step, exactly as BETSE does it. That keeps the results comparable to BETSE but means <i>dt</i> is limited by the fastest process, which is voltage.</p>
			<h4>How voltage arises</h4>
			<p>There is no cable equation. Each cell's net charge is the sum over ions of <code>z·F·c</code>. That charge is treated as sitting on the membrane, and each membrane segment's voltage is <code>Vm = σ / Cm</code>, with σ the charge per membrane area. So Vm follows the concentrations directly, and capacitance sets the gain.</p>
			<h4>The bath</h4>
			<p>Outside the cells is a single stirred compartment. Fluxes out of cells raise its concentrations by (flux × membrane area / bath volume). A future version adds a spatial extracellular grid.</p>
		{/snippet}
	</SettingsDialog>

	<SettingsDialog title="Ions" blurb="Which ions exist, where they start, and how leaky the membrane is to each. This is where most of the behaviour comes from.">
		{#snippet summary()}
			<div class="flex flex-wrap gap-x-3 font-mono tabular-nums">
				{#each ex.ions as ion, i (ion.name)}<span>{ion.name} {fmt(ion.cCell, 3)}/{fmt(ion.cEnv, 3)} mM · E<sub>N</sub> {fmt(nernstMv[i], 3)} mV</span>{/each}
			</div>
			<div class="mt-0.5 font-mono tabular-nums">GHK Vm {fmt(ghkMv, 3)} mV{#if Number.isFinite(ghkNowMv)} (now {fmt(ghkNowMv, 3)}){/if} · mean Vm {fmt(vmMeanMv, 3)} mV</div>
		{/snippet}
		{#snippet form()}
			<div class="grid grid-cols-[3rem_1fr_1fr_1.3fr_4rem] items-center gap-2 pb-1 text-xs font-medium text-muted-foreground">
				<span></span><span>inside mM</span><span>bath mM</span><span>permeability m²/s</span><span>E<sub>N</sub> mV</span>
			</div>
			{#each ex.ions as ion, i (ion.name)}
				<div class="grid grid-cols-[3rem_1fr_1fr_1.3fr_4rem] items-center gap-2 py-1">
					<span class="font-mono text-sm">{ion.name}<sup>{ion.z > 0 ? '+' : '−'}</sup></span>
					<input type="number" class={inputCls} value={ion.cCell} onchange={(e) => set((x) => (x.ions[i].cCell = +(e.target as HTMLInputElement).value))} />
					<input type="number" class={inputCls} value={ion.cEnv} onchange={(e) => set((x) => (x.ions[i].cEnv = +(e.target as HTMLInputElement).value))} />
					<input type="number" class={inputCls} value={ion.Dm} onchange={(e) => set((x) => (x.ions[i].Dm = +(e.target as HTMLInputElement).value))} />
					<span class="font-mono text-sm tabular-nums text-muted-foreground">{fmt(nernstMv[i], 3)}</span>
				</div>
			{/each}
			<div class="mt-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
				<div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
					<span class="text-muted-foreground">GHK resting Vm from these values</span><span class="font-mono tabular-nums">{fmt(ghkMv, 3)} mV</span>
					<span class="text-muted-foreground">GHK Vm from current concentrations</span><span class="font-mono tabular-nums">{fmt(ghkNowMv, 3)} mV</span>
					<span class="text-muted-foreground">Mean Vm now</span><span class="font-mono tabular-nums">{fmt(vmMeanMv, 3)} mV</span>
					{#if session.view}<span class="text-muted-foreground">Bath now</span><span class="font-mono tabular-nums">{ex.ions.map((ion, k) => `${ion.name} ${session.view!.ccEnv[k].toFixed(2)}`).join('  ')} mM</span>{/if}
				</div>
			</div>
			<div class="mt-3 flex items-center gap-3">
				<span class="text-sm font-medium">Ion set</span>
				<Button size="sm" variant={hasCa ? 'outline' : 'default'} onclick={() => setIonSet(false)}>Na⁺ K⁺ P⁻ M⁻</Button>
				<Button size="sm" variant={hasCa ? 'default' : 'outline'} onclick={() => setIonSet(true)}>+ Ca²⁺</Button>
				<span class="text-sm text-muted-foreground">Switching resets concentrations to BETSE's profile values.</span>
			</div>
			<p class="mt-3 text-sm text-muted-foreground">Changing initial concentrations rebuilds the state and restarts. Changing permeabilities applies live.</p>
		{/snippet}
		{#snippet explain()}
			<h4>The ions</h4>
			<p><b>Na⁺</b> and <b>K⁺</b> are the actors. <b>P⁻</b> stands for impermeant intracellular proteins and is fixed. <b>M⁻</b> is a generic mobile anion (think Cl⁻) chosen so both compartments start electrically neutral. Concentrations are in mmol/L.</p>
			<p>Optionally <b>Ca²⁺</b>: divalent, 2 mM outside and only 0.1 µM inside, held there by a Ca-ATPase pump (see Na/K pump → Ca pump). Its Nernst potential is far positive, so any Ca²⁺ permeability depolarizes and floods the cell with calcium: the basis of calcium signalling.</p>
			<h4>Permeability</h4>
			<p>Each ion crosses a membrane segment with the Goldman-Hodgkin-Katz flux: proportional to permeability, driven by the concentration difference and the voltage. Permeability here is a diffusion constant through a 7.5 nm membrane, so the numbers are tiny; 1e-18 m²/s is a modest leak, 1e-17 a leaky channel-rich membrane.</p>
			<h4>Nernst and GHK voltages</h4>
			<p><b>E<sub>N</sub></b> for an ion is the Vm at which its inward and outward flux cancel. With inside 139 mM and bath 5 mM, K⁺ wants Vm ≈ −89 mV; Na⁺ wants +67 mV. The membrane settles near a permeability-weighted compromise, the <b>GHK voltage</b>.</p>
			<p>With BETSE's default permeabilities the GHK voltage is close to 0 mV: Na⁺ and K⁺ leaks are similar. The cells still polarize to about −20 mV because the Na/K pump is electrogenic (3 out, 2 in). Raise K⁺ permeability by 10× and the GHK voltage drops to around −60 mV; that is what a "leaky K⁺" region does.</p>
			<h4>Things to try</h4>
			<ul>
				<li>Set K⁺ permeability to 1e-17: cells rest much more negative.</li>
				<li>Raise Na⁺ permeability during a run (Events → permeability): a depolarizing pulse.</li>
				<li>Shrink the bath volume: watch K⁺ accumulate outside and E<sub>N</sub> collapse.</li>
			</ul>
		{/snippet}
	</SettingsDialog>

	<SettingsDialog title={hasCa ? 'Pumps' : 'Na/K pump'} blurb="ATP-driven pumps. Na/K-ATPase moves 3 Na⁺ out and 2 K⁺ in per cycle and builds the gradients; the Ca²⁺ pump keeps cytosolic calcium near zero.">
		{#snippet summary()}Na/K {fmt(ex.params.alphaNaK, 2)} mol/m²·s{#if hasCa} · Ca {fmt(ex.params.alphaCa, 2)}{/if} · ATP {fmt(ex.params.cATP, 2)} mM{/snippet}
		{#snippet form()}
			<BigField label="Max rate" value={ex.params.alphaNaK} unit="mol/m²·s" description="Maximum Na⁺ flux per membrane area at saturation. Set 0 to switch the pump off and watch gradients decay; 1e-6 polarizes ten times faster." onchange={(v) => set((e) => (e.params.alphaNaK = v))} />
			<BigField label="ATP" value={ex.params.cATP} unit="mM" description="Cytosolic ATP. With ADP and Pi it sets the free energy available per cycle and the pump's saturation." onchange={(v) => set((e) => (e.params.cATP = v))} />
			<BigField label="ADP" value={ex.params.cADP} unit="mM" onchange={(v) => set((e) => (e.params.cADP = v))} />
			<BigField label="Pi" value={ex.params.cPi} unit="mM" description="Inorganic phosphate." onchange={(v) => set((e) => (e.params.cPi = v))} />
			<BigField label="Km Na⁺" value={ex.params.KmNK_Na} unit="mM" description="Intracellular Na⁺ giving half-maximal activity. Lower = pump stays busy even at low internal Na⁺." onchange={(v) => set((e) => (e.params.KmNK_Na = v))} />
			<BigField label="Km K⁺" value={ex.params.KmNK_K} unit="mM" description="Extracellular K⁺ giving half-maximal activity." onchange={(v) => set((e) => (e.params.KmNK_K = v))} />
			<BigField label="Km ATP" value={ex.params.KmNK_ATP} unit="mM" onchange={(v) => set((e) => (e.params.KmNK_ATP = v))} />
			<BigField label="ΔG°(ATP)" value={ex.params.deltaGATP} unit="J/mol" description="Standard free energy of ATP hydrolysis. More negative = pump can build steeper gradients before stalling." onchange={(v) => set((e) => (e.params.deltaGATP = v))} />
			{#if hasCa}
				<div class="mt-4 mb-1 text-sm font-semibold">Ca²⁺ pump (PMCA)</div>
				<BigField label="Max rate" value={ex.params.alphaCa} unit="mol/m²·s" description="Maximum Ca²⁺ extrusion per membrane area. Keeps cytosolic Ca²⁺ at ~0.1 µM against 2 mM outside." onchange={(v) => set((e) => (e.params.alphaCa = v))} />
				<BigField label="Km Ca²⁺" value={ex.params.KmCa_Ca} unit="mM" description="Intracellular Ca²⁺ giving half-maximal pumping." onchange={(v) => set((e) => (e.params.KmCa_Ca = v))} />
				<BigField label="Km ATP" value={ex.params.KmCa_ATP} unit="mM" onchange={(v) => set((e) => (e.params.KmCa_ATP = v))} />
			{/if}
		{/snippet}
		{#snippet explain()}
			<h4>How it works</h4>
			<p>Each membrane segment carries pump activity. The rate is Michaelis-Menten in intracellular Na⁺, extracellular K⁺ and ATP (the Km values), multiplied by a thermodynamic term <code>1 − Q/K<sub>eq</sub></code> that goes to zero when the ion gradients plus the membrane voltage store as much energy as ATP hydrolysis releases. So the pump slows down and stops by itself as the cell polarizes.</p>
			<h4>Why it changes voltage</h4>
			<p>Three charges out for two in: each cycle removes one net positive charge from the cell. That alone drives Vm negative even when permeabilities give a GHK voltage near zero, which is the situation in the default cluster.</p>
			<h4>Ca²⁺ pump</h4>
			<p>Same construction with 1:1 stoichiometry (one Ca²⁺ out per ATP, two charges): Michaelis-Menten in cytosolic Ca²⁺ and ATP, times the thermodynamic term. With a 20 000-fold gradient it runs near its stall point most of the time.</p>
			<h4>Regions</h4>
			<p>The "pump ×" multiplier on a region scales the Na/K rate for its cells. A region with pump × 0 slowly depolarizes toward the GHK voltage as gradients leak away.</p>
		{/snippet}
	</SettingsDialog>

	<SettingsDialog title="Gap junctions" blurb="Channels connecting neighbouring cells. They let ions, and therefore voltage, spread through the tissue.">
		{#snippet summary()}area {fmt(ex.params.gjSurface, 2)} · {ex.params.vSensitiveGj ? `voltage gated, threshold ${fmt(ex.params.gjVthresh, 3)} mV` : 'always open'}{/snippet}
		{#snippet form()}
			<BigField label="Area fraction" value={ex.params.gjSurface} description="Fraction of each membrane segment that is gap-junction channel. Coupling strength scales linearly. 0 isolates every cell; 1e-6 couples them strongly." onchange={(v) => set((e) => (e.params.gjSurface = v))} />
			<label class="flex items-start gap-3 py-2">
				<input type="checkbox" class="mt-1" checked={ex.params.vSensitiveGj} onchange={(e) => set((x) => (x.params.vSensitiveGj = (e.target as HTMLInputElement).checked))} />
				<span><span class="text-sm font-medium">Voltage gated</span><br /><span class="text-sm text-muted-foreground">Junctions close when the voltage difference between the two cells is large (Harris et al. 1983, axolotl embryo). Off = always open.</span></span>
			</label>
			<BigField label="Threshold" value={ex.params.gjVthresh} unit="mV" description="Transjunctional voltage where closing starts." onchange={(v) => set((e) => (e.params.gjVthresh = v))} />
			<BigField label="Minimum open" value={ex.params.gjMin} description="Open fraction that remains when fully gated shut (0.1 = 10 % conductance)." onchange={(v) => set((e) => (e.params.gjMin = v))} />
		{/snippet}
		{#snippet explain()}
			<h4>Coupling</h4>
			<p>Each membrane segment that faces another cell exchanges ions with its partner segment by the same GHK electrodiffusion used at the outer membrane, but with the ion's free diffusion constant, over the cell-gap distance, through the fraction of area that is junction. Voltage differences between cells drive current through them, so a polarized region pulls its neighbours along.</p>
			<h4>Gating</h4>
			<p>With gating on, each junction has an open fraction that relaxes toward a voltage-dependent steady state: near-fully open below the threshold, closing exponentially above it. This is how tissues electrically isolate a strongly depolarized (for example injured) region.</p>
			<h4>Regions and events</h4>
			<p>The "junctions ×" multiplier on a region scales coupling for its cells; a GJ event does the same for a time window. Set it to 0 to see an isolated patch keep its own voltage.</p>
		{/snippet}
	</SettingsDialog>

	<SettingsDialog title="Ion channels" blurb="Voltage-gated channels open and close with Vm, changing an ion's permeability on the fly. This is what makes the tissue excitable.">
		{#snippet summary()}
			{#if ex.channels.length === 0}none{:else}{ex.channels.filter((c) => c.enabled).map((c) => `${channelModels[c.type]?.label ?? c.type} ${fmt(c.maxDm, 2)}`).join(' · ')}{/if}
		{/snippet}
		{#snippet actions()}<Button size="sm" variant="ghost" class="h-7 px-1.5 text-xs" onclick={addChannel} title="Add a channel population"><Plus class="size-3.5" /> add</Button>{/snippet}
		{#snippet form()}
			{#if ex.channels.length === 0}<div class="text-sm text-muted-foreground">No channels yet. Add one; Kv1.5 + Nav1.3 + a K leak on a −60 mV cluster gives action potentials.</div>{/if}
			{#each ex.channels as ch, ci (ch.id)}
				<div class="mb-3 rounded-md border border-border p-3">
					<div class="flex items-center gap-2">
						<input type="checkbox" checked={ch.enabled} onchange={(e) => set((x) => (x.channels[ci].enabled = (e.target as HTMLInputElement).checked))} title="Enabled" />
						<select class="h-8 rounded-md border border-input bg-background px-2 text-sm" value={ch.type} onchange={(e) => set((x) => (x.channels[ci].type = (e.target as HTMLSelectElement).value))}>
							{#each channelTypes as t (t)}<option value={t}>{channelModels[t].label} ({channelModels[t].ion}⁺)</option>{/each}
						</select>
						<select class="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm" value={ch.profile} onchange={(e) => set((x) => (x.channels[ci].profile = (e.target as HTMLSelectElement).value))}>
							<option value="">all cells</option>
							{#each ex.profiles as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
						</select>
						<Button size="sm" variant="ghost" class="h-8 px-1.5" onclick={() => set((x) => x.channels.splice(ci, 1))} title="Delete channel"><Trash class="size-4" /></Button>
					</div>
					<div class="mt-1 text-sm text-muted-foreground">{channelModels[ch.type]?.blurb}</div>
					<BigField label="Max permeability" value={ch.maxDm} unit="m²/s" description="Permeability of the ion when the channel is fully open. Compare with the ion's resting permeability (Na 2e-18, K 1e-18 by default): 1e-15 is a strong K channel, 2e-14 a strong Na channel." onchange={(v) => set((x) => (x.channels[ci].maxDm = v))} />
				</div>
			{/each}
			<Button size="sm" variant="outline" onclick={addChannel}><Plus class="size-4" /> add channel</Button>
		{/snippet}
		{#snippet explain()}
			<h4>Hodgkin-Huxley gating</h4>
			<p>Each channel population has two gates per membrane segment: an activation gate <code>m</code> and an inactivation gate <code>h</code>. At any voltage each gate has a steady-state value and a time constant; every step it relaxes toward that steady state. The open fraction is <code>P = m<sup>a</sup>·h<sup>b</sup></code>, and the ion's permeability on that membrane gets <code>P × max permeability</code> added.</p>
			<h4>Where the models come from</h4>
			<p>The rate functions are BETSE's, which transcribed them from Channelpedia (EPFL) fits to patch-clamp data on cloned channels. Voltages in the models are in mV and time constants in ms; the simulator converts.</p>
			<h4>Excitability recipe</h4>
			<ul>
				<li>Set <b>Initial Vm</b> (Run) to −60 mV or add a <b>K leak</b> channel so the resting potential is negative. Nav channels are inactivated at 0 mV and never open otherwise.</li>
				<li>Add <b>Nav1.3</b> (2e-14) for the upstroke and <b>Kv1.5</b> (1e-15) for repolarization.</li>
				<li>Use a small time step (1e-4 s): gates move on the millisecond scale.</li>
				<li>Trigger with an Events → permeability pulse of Na⁺ on a region. The spike propagates to neighbours through gap junctions.</li>
			</ul>
			<h4>Regions</h4>
			<p>A channel assigned to a region is expressed only on that region's membranes; elsewhere its open fraction is forced to zero. Gates keep evolving everywhere so switching regions is seamless.</p>
		{/snippet}
	</SettingsDialog>

	<SettingsDialog title="Substances & reactions" blurb="A small chemical / gene network living in every cell: substances that are produced, decay, react, diffuse through gap junctions, gate ion channels or modulate the pump. Edited as JSON for now.">
		{#snippet summary()}{netSummary}{/snippet}
		{#snippet form()}
			<textarea class="h-[52vh] w-full rounded-md border border-input bg-background p-2 font-mono text-xs leading-snug" spellcheck="false" bind:value={netText}></textarea>
			<div class="mt-2 flex items-center gap-2">
				<Button size="sm" onclick={applyNetwork}>Apply</Button>
				<Button size="sm" variant="ghost" onclick={() => { netText = JSON.stringify(ex.network ?? { substances: [], reactions: [], modulators: [], affectCharge: true }, null, 2); netError = ''; }}>Revert</Button>
				{#if netError}<span class="text-xs text-destructive">{netError}</span>{/if}
			</div>
			<p class="mt-2 text-sm text-muted-foreground">Adding or removing a substance, or changing its initial concentration or charge, restarts the run; rate constants and regulators apply live.</p>
		{/snippet}
		{#snippet explain()}
			<h4>Substances</h4>
			<p>Each substance has a concentration in every cell and in the bath. <code>Dm</code> is its membrane permeability (0 = trapped inside), <code>Dgj</code> how fast it moves to neighbouring cells through gap junctions, <code>z</code> its charge (charged substances shift V<sub>m</sub> like ions when <code>affectCharge</code> is on). <code>updateIntra</code> tracks a separate membrane-side concentration with diffusion inside the cell; <code>gjImpermeable</code> confines it to its cell.</p>
			<h4>Growth and decay</h4>
			<p><code>growth</code> makes the substance in the cells of <code>profile</code> ('' = all): rate = <code>rProd · α − rDecay · c</code>, where α is a product of Hill terms, one per regulator: activators contribute <code>(c/Km)ⁿ / (1 + (c/Km)ⁿ)</code>, inhibitors <code>1 / (1 + (c/Km)ⁿ)</code>. Regulators can be other substances or ions; <code>zone: "env"</code> reads the bath instead of the cell. That is enough to write gene regulatory networks (repressors, feed-forward loops, oscillators).</p>
			<h4>Reactions</h4>
			<p>Cell-zone reactions with reactants, products, stoichiometry and Km per species. With <code>deltaG: null</code> the rate is <code>vmax · α · Π (c/Km)ⁿ/(1+(c/Km)ⁿ)</code> over reactants (irreversible Michaelis-Menten). With a standard free energy it becomes thermodynamic: <code>vmax · α · (1 − Q/K<sub>eq</sub>)</code>, running backward if products pile up.</p>
			<h4>Coupling to bioelectricity</h4>
			<ul>
				<li><code>gating</code>: the substance opens a permeability for listed ions, <code>peak · hill(c, HillK, HillN)</code>. A K⁺ opener hyperpolarizes; a Na⁺ or Ca²⁺ opener depolarizes.</li>
				<li><code>modulators</code>: scale the Na/K pump (<code>NaK</code>) or gap junctions (<code>GJ</code>) by <code>max · α</code>.</li>
				<li>Channels (Ion channels dialog) accept <code>activators</code> / <code>inhibitors</code> of the same form, so a substance can silence a voltage-gated channel.</li>
				<li>Ions can be regulators too: a gene activated by intracellular Ca²⁺ closes the loop from voltage back to genes.</li>
			</ul>
			<h4>Same maths as BETSE</h4>
			<p>This is a port of BETSE's "general network" (MasterOfNetworks) for the no-extracellular-grid case, validated against it to round-off. Not ported: transporters, active pumping of substances, mitochondria, environment-zone reactions, voltage-sensitive regulators.</p>
			<h4>Example</h4>
			<p>Load the "Morphogen gradient" preset: one substance made in a painted source, diffusing through junctions and opening K⁺ channels, so the tissue's voltage map follows the chemical gradient. "Gene network" is BETSE's three-gene example.</p>
		{/snippet}
	</SettingsDialog>

	<div class="border-b border-border px-3 py-2.5">
		<div class="flex items-center gap-2">
			<span class="text-sm font-semibold">Regions</span>
			<Button size="sm" variant="outline" class="ml-auto h-7 gap-1 px-2 text-xs" onclick={addProfile} title="Add a region, then paint cells on the canvas"><Plus class="size-3.5" /> add</Button>
		</div>
		<div class="mt-1 text-sm text-muted-foreground">Paint cells to give them different membrane properties. Blank permeability means the ion's default.</div>
		{#each ex.profiles as p, pi (p.id)}
			<div class="mt-2 rounded-md border px-2 py-1.5 {view.activeProfile === p.id ? 'border-ring' : 'border-border'}">
				<div class="flex items-center gap-1.5">
					<input type="color" value={p.color} class="h-5 w-6 cursor-pointer border-0 bg-transparent p-0" onchange={(e) => set((x) => (x.profiles[pi].color = (e.target as HTMLInputElement).value))} />
					<input class="h-6 min-w-0 flex-1 bg-transparent px-1 text-sm font-medium outline-none" value={p.name} onchange={(e) => set((x) => (x.profiles[pi].name = (e.target as HTMLInputElement).value))} />
					<span class="text-xs text-muted-foreground">{p.cells.length} cells</span>
					<Button size="sm" variant={view.activeProfile === p.id ? 'default' : 'ghost'} class="h-6 px-1.5 text-xs" title="Select this region and switch to the paint tool" onclick={() => { view.activeProfile = p.id; view.tool = 'paint'; }}>paint</Button>
					<Button size="sm" variant="ghost" class="h-6 px-1.5 text-xs" onclick={() => session.cut(p.cells)} title="Remove these cells from the cluster now">cut</Button>
					<Button size="sm" variant="ghost" class="h-6 px-1" onclick={() => set((x) => x.profiles.splice(pi, 1))} title="Delete region"><Trash class="size-3.5" /></Button>
				</div>
				<div class="mt-1.5 flex flex-col gap-1">
					{#each ex.ions as ion (ion.name)}
						{#if ion.Dm > 0 || p.Dm[ion.name] !== undefined}
							<NumField label="{ion.name} perm" value={p.Dm[ion.name] ?? ion.Dm} unit="m²/s" help="Membrane permeability to {ion.name} in this region (default {ion.Dm})" onchange={(v) => set((x) => (x.profiles[pi].Dm[ion.name] = v))} />
						{/if}
					{/each}
					<NumField label="pump ×" value={p.pumpScale} step={0.1} min={0} help="Multiplier on the Na/K pump rate in this region. 0 = no pump." onchange={(v) => set((x) => (x.profiles[pi].pumpScale = v))} />
					<NumField label="junctions ×" value={p.gjScale} step={0.1} min={0} help="Multiplier on gap-junction conductance for membranes of this region. 0 = isolated cells." onchange={(v) => set((x) => (x.profiles[pi].gjScale = v))} />
				</div>
			</div>
		{/each}
	</div>

	<div class="border-b border-border px-3 py-2.5">
		<div class="flex items-center gap-1">
			<span class="mr-auto text-sm font-semibold">Events</span>
			<Button size="sm" variant="outline" class="h-7 px-1.5 text-xs" onclick={() => addEvent('perm')} title="Change an ion's permeability for a while">+perm</Button>
			<Button size="sm" variant="outline" class="h-7 px-1.5 text-xs" onclick={() => addEvent('pump')} title="Scale the pump rate for a while">+pump</Button>
			<Button size="sm" variant="outline" class="h-7 px-1.5 text-xs" onclick={() => addEvent('gj')} title="Scale gap-junction coupling for a while">+GJ</Button>
			<Button size="sm" variant="outline" class="h-7 px-1.5 text-xs" onclick={() => addEvent('cut')} disabled={ex.profiles.length === 0} title="Remove a region's cells at a given time (needs a region)">+cut</Button>
		</div>
		<div class="mt-1 text-sm text-muted-foreground">Timed interventions. Factors multiply the current value between start and end; a cut removes a region's cells for good.</div>
		{#each ex.events as ev, i (i)}
			<div class="mt-2 rounded-md border border-border px-2 py-1.5">
				<div class="flex items-center gap-1.5">
					<span class="text-sm font-medium">{eventLabel[ev.kind]}</span>
					{#if ev.kind === 'perm'}
						<select class="h-6 rounded border border-input bg-background text-sm" value={ev.ion} onchange={(e) => set((x) => { const y = x.events[i]; if (y.kind === 'perm') y.ion = (e.target as HTMLSelectElement).value; })}>
							{#each ex.ions as ion (ion.name)}<option value={ion.name}>{ion.name}</option>{/each}
						</select>
					{/if}
					<select class="h-6 min-w-0 flex-1 rounded border border-input bg-background text-sm" value={ev.profile} onchange={(e) => set((x) => (x.events[i].profile = (e.target as HTMLSelectElement).value))}>
						{#if ev.kind !== 'cut'}<option value="">all cells</option>{/if}
						{#each ex.profiles as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
					</select>
					<Button size="sm" variant="ghost" class="h-6 px-1" onclick={() => set((x) => x.events.splice(i, 1))} title="Delete event"><Trash class="size-3.5" /></Button>
				</div>
				<div class="mt-1.5 flex flex-col gap-1">
					<NumField label="start" value={ev.t} unit="s" onchange={(v) => set((x) => (x.events[i].t = v))} />
					{#if ev.kind !== 'cut'}
						<NumField label="end" value={ev.tEnd} unit="s" onchange={(v) => set((x) => { const y = x.events[i]; if (y.kind !== 'cut') y.tEnd = v; })} />
						<NumField label="factor ×" value={ev.factor} step={0.1} min={0} onchange={(v) => set((x) => { const y = x.events[i]; if (y.kind !== 'cut') y.factor = v; })} />
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
