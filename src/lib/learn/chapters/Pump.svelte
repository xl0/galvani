<script lang="ts">
	import { onDestroy } from 'svelte';
	import Eq from '$lib/components/learn/Eq.svelte';
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import FigPump from '$lib/learn/figures/FigPump.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import Slider from '$lib/components/learn/Slider.svelte';
	import { MiniSim } from '$lib/learn/minisim.svelte';
	import { oneCell } from '$lib/learn/meshes';
	import { fmt, si } from '$lib/format';
	import { Button } from '$lib/components/ui/button';

	const sim = new MiniSim({ mesh: oneCell(), params: { dt: 0.01, alphaNaK: 1e-7 }, speed: 40, traceEvery: 2 });
	onDestroy(() => sim.destroy());
	let rate = $state(1e-7);
	const vm = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.vm.map((v) => v[0]) }; });
	const na = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.cc.map((c) => c[0][0]) }; });
	const k = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.cc.map((c) => c[1][0]) }; });
</script>

<Lesson title="3 · The pump: where the gradients come from">
	<p>Passive leaks alone would let the gradients run down, and with them the resting potential. What holds them up is primary active transport, above all the <b>Na⁺/K⁺-ATPase</b>, which in many cell types consumes 20–70 % of the cell's ATP. Each catalytic cycle hydrolyses one ATP, exports three Na⁺ and imports two K⁺, both against their gradients.</p>
	<FigPump />
	<h3>Two consequences</h3>
	<ul>
		<li><b>Gradients.</b> Cytosolic Na⁺ stays low and K⁺ high regardless of leak, for as long as ATP is available. Secondary transporters (Na⁺/Ca²⁺ exchange, Na⁺-coupled uptake) all draw on the Na⁺ gradient the pump builds.</li>
		<li><b>Charge.</b> Three charges out, two in: each cycle removes one net positive charge from the cell. The pump is <i>electrogenic</i>; it contributes directly to hyperpolarisation, on top of the K⁺ gradient it maintains. In real neurons this is a few millivolts. In BETSE's default cell, where the leak permeabilities are nearly equal, it is the dominant reason the cell rests at about −20 mV instead of the GHK prediction near 0.</li>
	</ul>
	<h3>How the model runs it</h3>
	<p>The pump rate follows Michaelis-Menten saturation in cytosolic Na⁺, extracellular K⁺ and ATP, multiplied by a thermodynamic factor <Eq inline tex={String.raw`1 - Q/K_\text{eq}`} />. Q is the reaction quotient of the whole transport cycle, so it includes the Na⁺ and K⁺ gradients and the electrical work of moving one net charge across V<sub>m</sub>. When the free energy stored in gradients and voltage equals the free energy of ATP hydrolysis, the factor reaches zero and the pump stalls. The cell therefore approaches a steady state in which pump flux exactly replaces what leaks back, rather than running away.</p>
	<h3>Try it</h3>
	<ul>
		<li>Run at the default rate: V<sub>m</sub> goes negative while cytosolic Na⁺ falls and K⁺ rises.</li>
		<li>Set the rate to 0. Gradients and voltage decay toward the leak-only state of chapter 2, which is what happens to a cell under ouabain or metabolic poisoning, only slower here because the leaks are small.</li>
		<li>Raise the rate tenfold: same endpoint, reached faster. Thermodynamics sets the destination; enzyme kinetics set the speed.</li>
	</ul>
	{#snippet demo()}
		<div class="mb-2 flex items-center gap-2">
			{#if sim.running}<Button size="sm" variant="secondary" onclick={() => sim.pause()}>Pause</Button>{:else}<Button size="sm" onclick={() => sim.run()}>Run</Button>{/if}
			<Button size="sm" variant="ghost" onclick={() => sim.reset()}>Reset</Button>
			<span class="ml-auto font-mono text-sm text-muted-foreground">t = {sim.t.toFixed(1)} s · 40× real time</span>
		</div>
		<Slider label="pump max rate" bind:value={rate} min={1e-9} max={1e-6} log format={(v) => si(v, 'mol/m²·s', 2)} onchange={(v) => (sim.params.alphaNaK = v)} />
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
