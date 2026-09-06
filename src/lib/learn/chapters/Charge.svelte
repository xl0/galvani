<script lang="ts">
	import Eq from '$lib/components/learn/Eq.svelte';
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import FigCharge from '$lib/learn/figures/FigCharge.svelte';
	import MiniChart from '$lib/components/learn/MiniChart.svelte';
	import Slider from '$lib/components/learn/Slider.svelte';
	import { oneCell } from '$lib/learn/meshes';
	import { F } from '$lib/core/params';
	import { fmt } from '$lib/format';

	const mesh = oneCell();
	let vm = $state(-60);
	let cm = $state(0.05);
	// rho = Vm * Cm / diviterm ; concentration offset = rho / F
	const div = mesh.diviterm[0];
	const rho = $derived((vm * 1e-3 * cm) / div);
	const dc = $derived(rho / F); // mol/m3 = mM
	const ionsPerCell = $derived(Math.abs(dc) * mesh.cellVol[0] * 6.022e23);
	const curve = $derived.by(() => { const x: number[] = [], y: number[] = []; for (let v = -100; v <= 60; v += 2) { x.push(v); y.push(((v * 1e-3 * cm) / div / F) * 1e3); } return { x, y }; });
</script>

<Lesson title="4 · Voltage from charge: the membrane as a capacitor">
	<p>Chapters 1–3 treated voltage as something separate from the ion concentrations. In this simulator it is not a separate state variable at all: there is no cable equation and no circuit model. V<sub>m</sub> is <i>computed from the charge</i> in each cell.</p>
	<h3>The rule</h3>
	<p>Sum the charge carried by every ion in a cell: <Eq inline tex={String.raw`\rho = F \sum_i z_i c_i`} />. A perfectly electroneutral cytosol gives ρ = 0 and V<sub>m</sub> = 0. Any excess is assumed to sit at the membrane, which behaves as a parallel-plate capacitor: a thin dielectric (the bilayer) between two conductors (the cytosol and the extracellular fluid). Surface charge density over specific capacitance gives the voltage:</p>
	<Eq tex={String.raw`V_m = \frac{\sigma}{C_m}, \qquad \sigma = \rho\,\frac{V_\text{cell}}{A_\text{membrane}}`} />
	<p>The specific membrane capacitance of biological membranes is close to 0.01 F/m² (the familiar 1 µF/cm²); BETSE uses 0.05. All membrane segments of a cell share the cell's charge, so in the basic model every segment of one cell reads the same V<sub>m</sub>.</p>
	<FigCharge />
	<h3>How little charge that is</h3>
	<p>To hold a 5 µm cell at −60 mV requires a net anion excess of only a few micromolar, against ionic strengths above 100 mM: on the order of 10⁵ extra ions in a cell that holds 10¹⁰. That is why bulk concentrations stay effectively constant while V<sub>m</sub> swings through its full range, why the electroneutrality approximation is safe for the concentrations but not for the voltage, and why a modest pump current can polarise a cell in seconds.</p>
	<h3>Why it matters for what you see</h3>
	<ul>
		<li>Lower C<sub>m</sub> → the same ion movement produces a larger voltage change and a faster response (the membrane time constant is C<sub>m</sub>/g).</li>
		<li>Larger cells have more volume per unit membrane area, so the same concentration imbalance yields more surface charge and more voltage.</li>
		<li>The workbench's "Initial V<sub>m</sub>" setting is literally this: it adds the required anion excess to each cell at t = 0.</li>
	</ul>
	{#snippet demo()}
		<Slider label="target Vm" bind:value={vm} min={-100} max={60} step={1} unit="mV" format={(v) => v.toFixed(0)} />
		<Slider label="Cm" bind:value={cm} min={0.005} max={0.2} log unit="F/m²" format={(v) => fmt(v, 2)} />
		<div class="my-3 grid grid-cols-2 gap-2 text-center font-mono text-sm">
			<div class="rounded border border-border p-2">net anion excess<br /><span class="text-xl">{fmt(-dc * 1e3, 3)} µM</span></div>
			<div class="rounded border border-border p-2">≈ ions per cell<br /><span class="text-xl">{ionsPerCell.toExponential(2)}</span></div>
		</div>
		<div class="mb-2 text-sm text-muted-foreground">for one cell of radius 5 µm, height 10 µm (volume {(mesh.cellVol[0] * 1e18).toFixed(0)} µm³), compared with ~150 mM of each major ion</div>
		<MiniChart series={[{ label: 'imbalance', color: '#4363d8', x: curve.x, y: curve.y }]} xlabel="Vm (mV)" ylabel="µM" marker={{ x: vm, y: dc * 1e3, color: '#e6194b' }} height={180} />
	{/snippet}
</Lesson>
