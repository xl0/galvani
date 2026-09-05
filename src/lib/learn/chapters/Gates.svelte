<script lang="ts">
	import { onDestroy } from 'svelte';
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import { MiniSim } from '$lib/learn/minisim.svelte';
	import { oneCell } from '$lib/learn/meshes';
	import { channelModels } from '$lib/core/channels';
	import { fmt } from '$lib/format';
	import { Button } from '$lib/components/ui/button';

	const sim = new MiniSim({ mesh: oneCell(), params: { dt: 1e-4 }, initialVm: -0.06, channels: [{ type: 'KLeak', maxDm: 1e-17 }, { type: 'Nav1p3', maxDm: 2e-14 }, { type: 'Kv1p5', maxDm: 1e-15 }], speed: 0.2, traceEvery: 5, traceLen: 2000 });
	onDestroy(() => sim.destroy());
	let navOn = $state(true);
	let kvOn = $state(true);
	const vm = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.vm.map((v) => v[0]) }; });
	const pNa = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.open.map((o) => o[1]) }; });
	const pK = $derived.by(() => { void sim.traceVersion; return { x: sim.trace.t, y: sim.trace.open.map((o) => o[2]) }; });
	// steady-state gate curves of Nav1.3
	const curves = (() => {
		const m = channelModels.Nav1p3; const x: number[] = [], mi: number[] = [], hi: number[] = [];
		for (let V = -100; V <= 40; V += 1) { const r = m.rates(V); x.push(V); mi.push(r.mInf); hi.push(r.hInf); }
		const k = channelModels.Kv1p5; const kmi: number[] = [];
		for (let V = -100; V <= 40; V += 1) kmi.push(k.rates(V).mInf);
		return { x, mi, hi, kmi };
	})();
	function fire() { sim.stimulate('Na', 200, 0.01); }
</script>

<Lesson title="5 · Gates: how a cell fires">
	<p>A leak is a fixed permeability. A <b>voltage-gated channel</b> is a permeability that depends on the voltage itself, with a delay. That feedback is what turns a quiet membrane into one that can fire.</p>
	<h3>The Hodgkin-Huxley picture</h3>
	<p>Each channel population has an activation gate <code>m</code> and an inactivation gate <code>h</code>, numbers between 0 and 1. For any voltage each gate has a resting value it relaxes toward (the S-shaped curves on the right) and a time constant for how fast it gets there. The channel is open in proportion to <code>m<sup>a</sup>·h<sup>b</sup></code>, and that open fraction times the channel's maximum permeability is added to the ion's leak.</p>
	<h3>The spike, step by step</h3>
	<ul>
		<li>At −60 mV the sodium channel's <code>m</code> is near 0 (closed) and <code>h</code> near 1 (not inactivated). It is armed.</li>
		<li>A small depolarization raises <code>m</code> within a fraction of a millisecond. Na⁺ rushes in (its Nernst voltage is +67 mV), depolarizing further: positive feedback, the upstroke.</li>
		<li>Two slower things end it: <code>h</code> falls (the sodium channel inactivates), and the potassium channel's <code>m</code> rises, letting K⁺ out toward −89 mV. The membrane repolarizes, overshoots (the afterhyperpolarization), and the gates slowly reset.</li>
	</ul>
	<h3>Try it</h3>
	<ul>
		<li>Run, then press <b>Stimulate</b>: a 10 ms sodium-permeability pulse, enough to reach threshold. Watch V<sub>m</sub> and the two open fractions.</li>
		<li>Turn off Kv and stimulate: the cell depolarizes and stays there, because nothing brings it back. Turn off Nav: the pulse causes only a small bump.</li>
		<li>Note the time axis: everything happens in milliseconds, which is why this chapter runs at 1/5 real time and uses a 0.1 ms step.</li>
	</ul>
	{#snippet demo()}
		<div class="mb-2 flex items-center gap-2">
			{#if sim.running}<Button size="sm" variant="secondary" onclick={() => sim.pause()}>Pause</Button>{:else}<Button size="sm" onclick={() => sim.run()}>Run</Button>{/if}
			<Button size="sm" variant="ghost" onclick={() => sim.reset()}>Reset</Button>
			<Button size="sm" variant="default" onclick={fire}>Stimulate</Button>
			<span class="ml-auto font-mono text-xs text-muted-foreground">t = {(sim.t * 1e3).toFixed(0)} ms · ⅕ real time</span>
		</div>
		<div class="mb-2 flex gap-4 text-sm">
			<label class="flex items-center gap-1"><input type="checkbox" bind:checked={navOn} onchange={() => sim.setChannelMax(1, navOn ? 2e-14 : 0)} /> Nav1.3</label>
			<label class="flex items-center gap-1"><input type="checkbox" bind:checked={kvOn} onchange={() => sim.setChannelMax(2, kvOn ? 1e-15 : 0)} /> Kv1.5</label>
			<span class="ml-auto font-mono text-muted-foreground">V<sub>m</sub> {fmt(sim.vm[0] ?? 0, 3)} mV</span>
		</div>
		<MiniChart series={[{ label: 'Vm', color: '#e6194b', x: vm.x, y: vm.y }]} xlabel="time (s)" ylabel="mV" height={150} />
		<MiniChart series={[{ label: 'Nav open', color: '#f58231', x: pNa.x, y: pNa.y }, { label: 'Kv open', color: '#3cb44b', x: pK.x, y: pK.y }]} xlabel="time (s)" ylabel="open fraction" height={120} />
		<MiniChart series={[{ label: 'Nav m∞', color: '#f58231', x: curves.x, y: curves.mi }, { label: 'Nav h∞', color: '#f58231', x: curves.x, y: curves.hi, dash: [4, 3] }, { label: 'Kv m∞', color: '#3cb44b', x: curves.x, y: curves.kmi }]} xlabel="Vm (mV)" ylabel="steady state" height={140} />
	{/snippet}
</Lesson>
