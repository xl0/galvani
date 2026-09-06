<script lang="ts">
	import { onDestroy } from 'svelte';
	import { fmt } from '$lib/format';
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import FigEcm from '$lib/learn/figures/FigEcm.svelte';
	import MiniCluster from '$lib/components/learn/MiniCluster.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import Slider from '$lib/components/learn/Slider.svelte';
	import { MiniSim } from '$lib/learn/minisim.svelte';
	import { disc } from '$lib/learn/meshes';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';

	const mesh = disc(22e-6);
	const sim = new MiniSim({ mesh, params: { dt: 5e-3 }, initialVm: -0.02, speed: 20, traceEvery: 20, traceLen: 600, ecm: { gridSize: 10, tjScale: 1, adhScale: 1, tjRel: {} } });
	onDestroy(() => sim.destroy());
	const iK = sim.ions.findIndex((i) => i.name === 'K');
	let tj = $state(1);
	let volt = $state(false);
	function applyVolt(on: boolean) { const b = sim.state.ecm!.grid.boundV; b.T = on ? 1e-3 : 0; b.B = on ? -1e-3 : 0; }
	const envK = $derived.by(() => { void sim.traceVersion; return sim.env ? sim.env.cc[iK] : new Float64Array(0); });
	const envV = $derived.by(() => { void sim.traceVersion; return sim.env ? Float64Array.from(sim.env.v, (v) => v * 1e3) : new Float64Array(0); });
	const kRange = $derived.by(() => { let lo = Infinity, hi = -Infinity; for (const v of envK) { if (v < lo) lo = v; if (v > hi) hi = v; } return (hi > lo ? [lo, hi] : [4.9, 5.1]) as [number, number]; });
	const vRange = $derived.by(() => { let m = 0; for (const v of envV) m = Math.max(m, Math.abs(v)); return [-Math.max(m, 0.01), Math.max(m, 0.01)] as [number, number]; });
	const grid = $derived(sim.env ? { nx: sim.env.nx, ny: sim.env.ny, xmin: sim.env.xmin, ymin: sim.env.ymin, delta: sim.env.delta } : null);
	/** extracellular K⁺ in the squares touching cells vs at the world edge */
	const readout = $derived.by(() => {
		void sim.traceVersion;
		const e = sim.state.ecm; if (!e) return '';
		const seen = new Set<number>(); let sum = 0;
		for (let m = 0; m < mesh.nMems; m++) { const k = e.grid.mapMem2Ecm[m]; if (!seen.has(k)) { seen.add(k); sum += e.cc[iK][k]; } }
		return `K⁺ around the cells ${fmt(sum / seen.size, 5)} mM · at the edge ${fmt(e.cc[iK][0], 5)} mM · env voltage max ${fmt(Math.max(...envV), 3)} mV`;
	});
	const series = $derived.by(() => { void sim.traceVersion; return [{ label: 'Vm cell 0', color: '#e6194b', x: sim.trace.t, y: sim.trace.vm.map((v) => v[0]) }]; });
</script>

<Lesson title="9 · The extracellular space">
	<p>Chapters 1–8 treated the outside of the cells as one stirred bath: every membrane sees the same concentration, and "outside" has no voltage. Real tissue is not like that. Between cells there are clefts a few tens of nanometres wide; the tissue surface faces a medium of finite size; and the extracellular fluid conducts, so currents through it set up voltage differences. Those extracellular voltages are what electrodes measure, and applying a field to a tissue works entirely through them.</p>
	<FigEcm />
	<h3>The grid</h3>
	<p>BETSE, and Galvani when "Extracellular space" is on, replaces the bath with a square grid. Each membrane exchanges with the square its midpoint falls in, so what a cell pumps out accumulates locally rather than vanishing into a reservoir. Between squares, ions move by <b>electrodiffusion</b>: down their concentration gradient and along the environmental electric field, with the free-solution diffusion coefficient. The four world edges are held at the bath composition, so far away everything relaxes to the reservoir.</p>
	<h3>Junctions</h3>
	<p>Epithelia seal the paracellular path with <b>tight junctions</b> at their boundary, and narrow it inside with adherens junctions. The model represents both as a scaling of the diffusivity in the affected squares: the ring of squares around the cluster boundary for tight junctions, the interior squares for adherens junctions. With tight junctions at a few per cent of free diffusion, the cluster keeps an extracellular composition of its own while its cells pump.</p>
	<h3>Environmental voltage</h3>
	<p>The net charge in the squares that touch membranes is treated as a surface charge screened over a Debye length (a few nanometres at physiological ionic strength), which gives a local voltage; it is smoothed and added to the solution of Laplace's equation for any voltage held at the edges. The gradient of that voltage is the field that drives the drift term above, and the applied part offsets every membrane's voltage: this is how an <b>external field</b> reaches the cells.</p>
	<h3>Try it</h3>
	<ul>
		<li>Run. The cells pump K⁺ in, so the squares around them deplete slightly; the readout compares K⁺ near the cells with K⁺ at the edge.</li>
		<li>Lower the tight-junction scaling to 0.05: the depletion is larger and stays, because the boundary now seals the interior from the reservoir.</li>
		<li>Tick "apply 1 mV top ↔ bottom": the environment shows a linear voltage gradient (right-hand map), and cell 0's Vm shifts by the local environmental voltage.</li>
		<li>The workbench's "Applied field" preset does the same on the full cluster, with the voltage as a timed modifier.</li>
	</ul>
	{#snippet demo()}
		<div class="mb-2 flex items-center gap-2">
			{#if sim.running}<Button size="sm" variant="secondary" onclick={() => sim.pause()}>Pause</Button>{:else}<Button size="sm" onclick={() => sim.run()}>Run</Button>{/if}
			<Button size="sm" variant="ghost" onclick={() => { sim.reset(); applyVolt(volt); }}>Reset</Button>
			<span class="ml-auto font-mono text-sm text-muted-foreground">t = {sim.t.toFixed(1)} s · 20× real time</span>
		</div>
		<div class="grid grid-cols-2 gap-2">
			<div>
				<div class="mb-1 text-xs text-muted-foreground">extracellular K⁺ (mM), cells by Vm</div>
				{#if grid}<MiniCluster {mesh} values={sim.vm} range={[-80, 0]} height={150} env={{ ...grid, values: envK, range: kRange }} />{/if}
			</div>
			<div>
				<div class="mb-1 text-xs text-muted-foreground">environment voltage (mV)</div>
				{#if grid}<MiniCluster {mesh} values={sim.vm} range={[-80, 0]} height={150} env={{ ...grid, values: envV, range: vRange }} neutral />{/if}
			</div>
		</div>
		<Slider label="tight junctions" bind:value={tj} min={0.02} max={1} log format={(v) => fmt(v, 2)} onchange={(v) => { sim.rebuild({ ecm: { gridSize: 10, tjScale: v, adhScale: 1, tjRel: {} } }); applyVolt(volt); }} />
		<Label class="gap-2 py-1 text-sm font-normal"><Checkbox bind:checked={volt} onCheckedChange={(v) => applyVolt(v === true)} /> apply 1 mV top ↔ bottom</Label>
		<div class="my-1 font-mono text-xs text-muted-foreground">{readout}</div>
		<MiniChart {series} xlabel="time (s)" ylabel="mV" height={140} />
	{/snippet}
</Lesson>
