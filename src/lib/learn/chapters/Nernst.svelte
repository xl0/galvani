<script lang="ts">
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import Slider from '$lib/components/learn/Slider.svelte';
	import { F, R } from '$lib/core/params';
	import { fmt } from '$lib/format';

	const T = 310;
	let ion = $state<'K' | 'Na' | 'Ca'>('K');
	const z = $derived(ion === 'Ca' ? 2 : 1);
	let cIn = $state(139);
	let cOut = $state(5);
	const E = $derived(((R * T) / (z * F)) * Math.log(cOut / cIn) * 1e3);
	const curve = $derived.by(() => {
		const x: number[] = [], y: number[] = [];
		for (let r = -3; r <= 3; r += 0.02) { x.push(r); y.push(((R * T) / (z * F)) * Math.log(10 ** r) * 1e3); }
		return { x, y };
	});
	function pick(name: 'K' | 'Na' | 'Ca') {
		ion = name;
		if (name === 'K') { cIn = 139; cOut = 5; } else if (name === 'Na') { cIn = 12; cOut = 145; } else { cIn = 0.0001; cOut = 2; }
	}
</script>

<Lesson title="1 · Ions, gradients and the Nernst voltage">
	<p>Every living cell keeps the salt water inside it different from the salt water outside. Potassium (K⁺) is about 30 times more concentrated inside than out; sodium (Na⁺) about 12 times more concentrated outside than in. Those differences are stored energy, and the membrane voltage is how the cell spends it.</p>
	<h3>Why a gradient is a voltage</h3>
	<p>Imagine the membrane lets only K⁺ through. K⁺ diffuses out because there is more of it inside. But each K⁺ that leaves carries a positive charge out, leaving the inside slightly negative. That negative inside pulls K⁺ back. Very quickly the pull balances the push, and the net flow stops. The voltage at which that happens is the <b>Nernst potential</b> of the ion:</p>
	<div class="eq">E<sub>N</sub> = (R·T / z·F) · ln(c<sub>out</sub> / c<sub>in</sub>)</div>
	<p>R·T/F is the "thermal voltage", about 26.7 mV at body temperature; z is the ion's charge. For K⁺ with 139 mM in and 5 mM out, E<sub>N</sub> ≈ −89 mV. For Na⁺ it is about +67 mV. Ca²⁺, at 2 mM outside and a tiny 0.1 µM inside, has E<sub>N</sub> near +130 mV.</p>
	<h3>What to take from this</h3>
	<ul>
		<li>Each ion "wants" the membrane at its own voltage. K⁺ pulls toward −89 mV, Na⁺ toward +67 mV.</li>
		<li>Only a minuscule number of ions need to move to set the voltage; the concentrations barely change (chapter 4 says how few).</li>
		<li>The actual membrane voltage is a tug-of-war between ions, weighted by how easily each crosses. That is chapter 2.</li>
	</ul>
	<p>Try it: drag the concentrations. Notice that a factor of 10 always adds the same 61 mV for a monovalent ion, half that for Ca²⁺.</p>
	{#snippet demo()}
		<div class="mb-2 flex gap-2 text-sm">
			{#each ['K', 'Na', 'Ca'] as n (n)}
				<button class="rounded border px-2 py-0.5 {ion === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}" onclick={() => pick(n as 'K' | 'Na' | 'Ca')}>{n}{n === 'Ca' ? '²⁺' : '⁺'}</button>
			{/each}
		</div>
		<Slider label="inside" bind:value={cIn} min={ion === 'Ca' ? 1e-5 : 1} max={ion === 'Ca' ? 10 : 200} log unit="mM" format={(v) => fmt(v, 3)} />
		<Slider label="outside" bind:value={cOut} min={ion === 'Ca' ? 1e-5 : 1} max={ion === 'Ca' ? 10 : 200} log unit="mM" format={(v) => fmt(v, 3)} />
		<div class="my-3 text-center font-mono text-2xl tabular-nums">E<sub>N</sub> = {E.toFixed(1)} mV</div>
		<MiniChart series={[{ label: 'Nernst', color: '#4363d8', x: curve.x, y: curve.y }]} xlabel="log10(out / in)" ylabel="mV" marker={{ x: Math.log10(cOut / cIn), y: E, color: '#e6194b' }} height={200} />
	{/snippet}
</Lesson>
