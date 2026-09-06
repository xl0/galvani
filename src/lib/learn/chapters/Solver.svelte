<script lang="ts">
	import Lesson from '$lib/components/learn/Lesson.svelte';
	import FigSolver from '$lib/learn/figures/FigSolver.svelte';
</script>

<Lesson title="10 · What the simulator does each step">
	<p>Everything in the earlier chapters is computed by one loop, repeated thousands of times. Knowing its order tells you what the numbers mean, what the time step buys you, and where the model's scope ends.</p>
	<h3>State</h3>
	<p>The cluster is a list of cells and a list of membrane segments. Per cell: the concentration of every ion and every substance. Per membrane segment: the voltage, the permeability to each ion, the gap-junction open fraction, the channel gating variables. The extracellular bath is a single well-mixed compartment. That is the entire state; fields, currents and "the tissue" are derived from it.</p>
	<FigSolver />
	<h3>One step, in order</h3>
	<ul>
		<li><b>Modifiers</b> apply: permeability values / factors and pump and junction factors for the modifiers active at this time, plus any cut due.</li>
		<li><b>Na⁺/K⁺-ATPase</b> flux on every membrane segment, from the membrane-side Na⁺ and K⁺ and the current V<sub>m</sub>.</li>
		<li><b>Per ion</b>: GHK flux across the membrane; gap-junction gating update (Harris) and GHK flux to the neighbour; then the membrane-side concentration is reset to the cell value.</li>
		<li><b>Ca²⁺-ATPase</b> flux, if calcium is present.</li>
		<li><b>Voltage-gated channels</b>: gating variables relax toward their steady state (implicit update, so large τ ratios are stable), open probability × maximal permeability × any substance regulation gives the extra flux, which is applied to the concentrations immediately.</li>
		<li><b>Substance network</b>: modulators of the pump and junctions; production, decay and reactions; substance-gated ion fluxes; substance transport across membranes and junctions; substance charge.</li>
		<li><b>Apply the queued fluxes</b>: membrane fluxes update cells and bath, junction fluxes move ions between cells; negative concentrations are clamped to zero.</li>
		<li><b>Voltage</b>: net charge per cell → surface charge density → V<sub>m</sub> = σ / C<sub>m</sub>.</li>
	</ul>
	<h3>Forward Euler and the time step</h3>
	<p>Each quantity advances by rate × dt using the values at the start of the step. That is the simplest explicit scheme and it is what BETSE does, so results can be compared number for number. The price is a stability limit: the fastest process in the system bounds the usable dt. The membrane voltage is the fastest. With default permeabilities 10 ms is fine; with a strong Na⁺ conductance you need 0.1 ms, which is why the excitable presets run slowly. If a run diverges, the simulator stops and reports it; halve dt.</p>
	<h3>What is not in the model</h3>
	<ul>
		<li><b>Extracellular space.</b> By default the bath is one stirred compartment with no geometry: no extracellular potential gradients, no applied fields. Switching on "Extracellular space" in the workbench replaces it with BETSE's environment grid (electrodiffusion, environmental voltage, tight junctions, edge voltages), at extra cost per step.</li>
		<li><b>Intracellular space.</b> A cell is one concentration (optionally a membrane-side copy for substances). No organelles, no ER calcium store, no diffusion within the cytosol.</li>
		<li><b>Mechanics.</b> No osmotic volume change, flow or deformation.</li>
		<li><b>Cable effects.</b> V<sub>m</sub> is uniform over a cell's membrane; the per-segment values differ only at the round-off level of how charge is attributed.</li>
	</ul>
	<h3>How you know it is right</h3>
	<p>Eight reference runs exported from BETSE (plain cluster, Na⁺/K⁺ channels, calcium, calcium channels, a substance network, and three with extracellular spaces including junction scaling and an applied edge voltage) are replayed by this code in the test suite, and the trajectories agree to about 10⁻¹² V and 10⁻¹³ mM over 450 steps: round-off, not modelling error.</p>
	{#snippet demo()}
		<div class="text-base leading-relaxed">
			<div class="mb-2 font-semibold">Step loop</div>
			<ol class="list-decimal space-y-1 pl-5 font-mono text-sm">
				<li>apply modifiers, fire cuts</li>
				<li>Na/K pump → queue</li>
				<li>for each ion: GHK membrane flux → queue; GJ gate; GJ flux → queue; c<sub>mem</sub> := c<sub>cell</sub></li>
				<li>Ca pump → queue</li>
				<li>channels: gates; flux applied now</li>
				<li>network: modulators; growth, reactions; gating (applied now + queued); transport; charge</li>
				<li>apply queues to cells, bath; clamp ≥ 0</li>
				<li>V<sub>m</sub> = ρ · (vol/area) / C<sub>m</sub></li>
			</ol>
			<div class="mt-4 text-sm text-muted-foreground">Same order as BETSE's <code>Simulator._run_sim_core_loop</code> and <code>MasterOfNetworks.run_loop</code>. Source: <code>src/lib/core/step.ts</code>, <code>network.ts</code>.</div>
		</div>
	{/snippet}
</Lesson>
