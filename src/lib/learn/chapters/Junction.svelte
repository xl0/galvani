<script lang="ts">
	import { onDestroy } from 'svelte';
	import Lesson from '$lib/components/learn/Lesson.svelte';
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
	<p>Cells in a tissue are not islands. Where two cells touch, <b>gap junctions</b> connect their interiors: pores wide enough for ions and small molecules. In the model the two facing membrane segments exchange ions by the same GHK electrodiffusion as the outer membrane, using the ion's free diffusion constant over the tiny cell gap, through the fraction of membrane area that is junction.</p>
	<h3>Voltage spreads</h3>
	<p>A voltage difference between neighbours drives current through the junctions, so a depolarized cell pulls its neighbour up. Whether the neighbour fires depends on the coupling: strong coupling shares the depolarization fast enough to reach the neighbour's threshold; weak coupling only nudges it.</p>
	<h3>Gating</h3>
	<p>Real junctions close when the voltage across them gets large (Harris et al., 1983). The model gives each junction an open fraction relaxing toward a voltage-dependent steady state: open below the threshold, closing above it, never below a minimum. This is how tissues can isolate an injured, strongly depolarized region.</p>
	<h3>Try it</h3>
	<ul>
		<li>Run and click cell 0 (or Stimulate). With default coupling the second cell fires a moment later.</li>
		<li>Reduce the junction area by 10× and stimulate again: cell 1 only twitches.</li>
		<li>Turn gating off at strong coupling: junctions stay open during the spike, so the neighbour follows more closely.</li>
	</ul>
	{#snippet demo()}
		<div class="mb-2 flex items-center gap-2">
			{#if sim.running}<Button size="sm" variant="secondary" onclick={() => sim.pause()}>Pause</Button>{:else}<Button size="sm" onclick={() => sim.run()}>Run</Button>{/if}
			<Button size="sm" variant="ghost" onclick={() => sim.reset()}>Reset</Button>
			<Button size="sm" onclick={() => sim.stimulate('Na', 200, 0.01, [0])}>Stimulate cell 0</Button>
			<span class="ml-auto font-mono text-xs text-muted-foreground">t = {(sim.t * 1e3).toFixed(0)} ms</span>
		</div>
		<MiniCluster mesh={sim.mesh} values={sim.vm} range={[-80, 40]} height={90} labels onclick={(c) => sim.stimulate('Na', 200, 0.01, [c])} />
		<Slider label="junction area" bind:value={gj} min={1e-9} max={1e-6} log format={(v) => v.toExponential(1)} onchange={(v) => (sim.params.gjSurface = v)} />
		<label class="flex items-center gap-2 py-1 text-sm"><input type="checkbox" bind:checked={gated} onchange={() => (sim.params.vSensitiveGj = gated)} /> voltage-gated junctions</label>
		<MiniChart series={[{ label: 'cell 0', color: '#e6194b', x: v0.x, y: v0.y }, { label: 'cell 1', color: '#4363d8', x: v1.x, y: v1.y }]} xlabel="time (s)" ylabel="mV" height={180} />
	{/snippet}
</Lesson>
