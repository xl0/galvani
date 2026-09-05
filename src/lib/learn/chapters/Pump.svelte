<script lang="ts">
	import { onDestroy } from 'svelte';
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import Slider from '$lib/components/learn/Slider.svelte';
	import { MiniSim } from '$lib/learn/minisim.svelte';
	import { oneCell } from '$lib/learn/meshes';
	import { fmt } from '$lib/format';
	import { Button } from '$lib/components/ui/button';

	const sim = new MiniSim({ mesh: oneCell(), params: { dt: 0.01, alphaNaK: 1e-7 }, speed: 40, traceEvery: 2 });
	onDestroy(() => sim.destroy());
	let rate = $state(1e-7);
	const vm = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.vm.map((v) => v[0]) }; });
	const na = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.cc.map((c) => c[0][0]) }; });
	const k = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.cc.map((c) => c[1][0]) }; });
</script>

<Lesson title="3 · The pump: where the gradients come from">
	<p>Leaks alone would let the gradients run down, and with them the voltage. Cells spend a large share of their energy on one enzyme that pushes back: the <b>Na⁺/K⁺-ATPase</b>. Each cycle burns one ATP, throws three Na⁺ out and pulls two K⁺ in.</p>
	<h3>Two consequences</h3>
	<ul>
		<li><b>Gradients.</b> Sodium stays low inside and potassium high, however leaky the membrane is, as long as ATP lasts.</li>
		<li><b>Charge.</b> 3 out, 2 in: every cycle removes one positive charge from the cell. The pump is <i>electrogenic</i>: it makes the inside negative directly, on top of what the leaks do. With BETSE's default permeabilities this is the main reason the cell rests at about −20 mV rather than the GHK prediction of ≈0.</li>
	</ul>
	<h3>How the model runs it</h3>
	<p>The rate is a Michaelis-Menten law in intracellular Na⁺, extracellular K⁺ and ATP (it saturates), multiplied by a thermodynamic factor <code>1 − Q/K<sub>eq</sub></code>. Q grows as the gradients and the voltage store energy; when the stored energy equals what ATP hydrolysis releases, the factor hits zero and the pump stalls. So the pump does not run away; it settles at a steady state where its work exactly replaces what leaks back.</p>
	<h3>Try it</h3>
	<ul>
		<li>Run at the default rate and watch V<sub>m</sub> go negative while Na⁺ inside falls and K⁺ rises.</li>
		<li>Set the rate to 0: the gradients and voltage decay toward the leak-only state of chapter 2.</li>
		<li>Raise the rate tenfold: same destination, reached faster. The endpoint is set by thermodynamics, the speed by enzyme rate.</li>
	</ul>
	{#snippet demo()}
		<div class="mb-2 flex items-center gap-2">
			{#if sim.running}<Button size="sm" variant="secondary" onclick={() => sim.pause()}>Pause</Button>{:else}<Button size="sm" onclick={() => sim.run()}>Run</Button>{/if}
			<Button size="sm" variant="ghost" onclick={() => sim.reset()}>Reset</Button>
			<span class="ml-auto font-mono text-xs text-muted-foreground">t = {sim.t.toFixed(1)} s · 40× real time</span>
		</div>
		<Slider label="pump max rate" bind:value={rate} min={1e-9} max={1e-6} log unit="mol/m²·s" format={(v) => v.toExponential(1)} onchange={(v) => (sim.params.alphaNaK = v)} />
		<div class="my-2 grid grid-cols-3 gap-2 text-center font-mono text-sm">
			<div class="rounded border border-border p-2">V<sub>m</sub><br /><span class="text-lg">{fmt(sim.vm[0] ?? 0, 3)} mV</span></div>
			<div class="rounded border border-border p-2">Na⁺ in<br /><span class="text-lg">{fmt(sim.cc[0]?.[0] ?? 0, 4)} mM</span></div>
			<div class="rounded border border-border p-2">K⁺ in<br /><span class="text-lg">{fmt(sim.cc[1]?.[0] ?? 0, 4)} mM</span></div>
		</div>
		<MiniChart series={[{ label: 'Vm', color: '#e6194b', x: vm.x, y: vm.y }]} xlabel="time (s)" ylabel="mV" height={150} />
		<MiniChart series={[{ label: 'Na⁺ in', color: '#f58231', x: na.x, y: na.y }]} xlabel="time (s)" ylabel="mM" height={120} />
		<MiniChart series={[{ label: 'K⁺ in', color: '#3cb44b', x: k.x, y: k.y }]} xlabel="time (s)" ylabel="mM" height={120} />
	{/snippet}
</Lesson>
