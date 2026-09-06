<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import { onDestroy } from 'svelte';
	import { fmt } from '$lib/format';
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import FigJunction from '$lib/learn/figures/FigJunction.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import MiniCluster from '$lib/components/learn/MiniCluster.svelte';
	import Slider from '$lib/components/learn/Slider.svelte';
	import { MiniSim } from '$lib/learn/minisim.svelte';
	import { twoCells } from '$lib/learn/meshes';
	import { Button } from '$lib/components/ui/button';

	const sim = new MiniSim({ mesh: twoCells(), params: { dt: 1e-4 }, initialVm: -0.06, channels: [{ type: 'KLeak', maxDm: 1e-17 }, { type: 'Nav1p3', maxDm: 2e-14 }, { type: 'Kv1p5', maxDm: 1e-15 }], speed: 0.2, traceEvery: 5, traceLen: 2000 });
	onDestroy(() => sim.destroy());
	let gj = $state(5e-8);
	let gated = $state(true);
	const v0 = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.vm.map((v) => v[0]) }; });
	const v1 = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.vm.map((v) => v[1]) }; });
</script>

<Lesson title="6 · Two cells and a gap junction">
	<p>Cells in a tissue are not isolated compartments. Where two cells touch, <b>gap junctions</b> connect their cytosols directly: each channel is a pair of connexin hexamers (connexons), one in each membrane, forming an aqueous pore about 1.5 nm wide that passes ions and small metabolites below roughly 1 kDa. In the model the two facing membrane segments exchange ions by the same GHK electrodiffusion as the outer membrane, using the ion's free-solution diffusion coefficient across the narrow intercellular gap, through the fraction of the shared membrane area that is junction.</p>
	<FigJunction />
	<h3>Electrical coupling</h3>
	<p>A voltage difference between neighbours drives ionic current through the junctions, so a depolarised cell pulls its neighbour toward its own V<sub>m</sub>. Whether the neighbour fires depends on the coupling strength relative to the neighbour's own membrane conductance: strong coupling delivers enough current to reach threshold; weak coupling only produces a subthreshold electrotonic bump. This is the basis of conduction in cardiac muscle and smooth muscle, and of electrical synapses.</p>
	<h3>Voltage gating of the junction</h3>
	<p>Junctional conductance falls when the transjunctional voltage V<sub>j</sub> becomes large in either direction (Harris, Spray & Bennett 1983). The model gives each junction an open fraction that relaxes toward a V<sub>j</sub>-dependent steady state: fully open below the gating threshold, closing above it, never below a residual minimum. Functionally this lets a tissue partially isolate an injured, strongly depolarised region rather than being dragged along with it.</p>
	<h3>Try it</h3>
	<ul>
		<li>Run and click cell 0 (or Stimulate). With default coupling the second cell fires a moment later.</li>
		<li>Reduce the junction area tenfold and stimulate again: cell 1 shows only an electrotonic response.</li>
		<li>Turn gating off at strong coupling: the junctions stay open through the spike, so the neighbour follows more closely.</li>
	</ul>
	{#snippet demo()}
		<div class="mb-2 flex items-center gap-2">
			{#if sim.running}<Button size="sm" variant="secondary" onclick={() => sim.pause()}>Pause</Button>{:else}<Button size="sm" onclick={() => sim.run()}>Run</Button>{/if}
			<Button size="sm" variant="ghost" onclick={() => sim.reset()}>Reset</Button>
			<Button size="sm" onclick={() => sim.stimulate('Na', 200, 0.01, [0])}>Stimulate cell 0</Button>
			<span class="ml-auto font-mono text-sm text-muted-foreground">t = {(sim.t * 1e3).toFixed(0)} ms</span>
		</div>
		<MiniCluster mesh={sim.mesh} values={sim.vm} range={[-80, 40]} height={90} labels onclick={(c) => sim.stimulate('Na', 200, 0.01, [c])} />
		<Slider label="junction area" bind:value={gj} min={1e-9} max={1e-6} log format={(v) => (v >= 1e-6 ? `${fmt(v * 1e6, 2)} ppm` : `${fmt(v * 1e9, 2)} ppb`)} onchange={(v) => (sim.params.gjSurface = v)} />
		<Label class="gap-2 py-1 text-sm font-normal"><Checkbox bind:checked={gated} onCheckedChange={(v) => (sim.params.vSensitiveGj = v === true)} /> voltage-gated junctions</Label>
		<MiniChart series={[{ label: 'cell 0', color: '#e6194b', x: v0.x, y: v0.y }, { label: 'cell 1', color: '#4363d8', x: v1.x, y: v1.y }]} xlabel="time (s)" ylabel="mV" height={180} />
	{/snippet}
</Lesson>
