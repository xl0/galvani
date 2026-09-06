<script lang="ts">
	/** A row of cells with a source at the left; the exponential gradient set by decay vs junctional diffusion. */
	const cells = Array.from({ length: 12 }, (_, i) => 40 + i * 40);
	const lam = 120;
	const curve = cells.map((x, i) => `${x + 20},${190 - 110 * Math.exp(-(i * 40) / lam)}`).join(' ');
</script>

<figure>
	<svg viewBox="0 0 560 230" class="text-foreground" fill="currentColor" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif">
		<defs>
			<marker id="am" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker>
			<marker id="am-9467bd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#9467bd" /></marker>
		</defs>
		{#each cells as x, i (x)}
			<rect {x} y="200" width="38" height="24" rx="4" class={i < 3 ? 'fill-violet-300/70 dark:fill-violet-900/60 stroke-foreground' : 'fill-muted stroke-foreground'} />
			{#if i < 11}<rect x={x + 36} y="206" width="6" height="12" class="fill-background stroke-border" />{/if}
		{/each}
		<text x="98" y="245" text-anchor="middle" font-size="12" fill="#9467bd" font-weight="600">source cells: production</text>
		<text x="380" y="245" text-anchor="middle" font-size="12" class="fill-muted-foreground">everywhere: decay · gap junctions: diffusion</text>
		<!-- gradient curve -->
		<line x1="40" y1="190" x2="520" y2="190" class="stroke-border" />
		<line x1="40" y1="60" x2="40" y2="190" class="stroke-border" />
		<polyline points={curve} fill="none" stroke="#9467bd" stroke-width="2.5" />
		<text x="30" y="70" text-anchor="end" font-size="12" class="fill-muted-foreground">[M]</text>
		<!-- decay length -->
		<line x1="60" y1="120" x2={60 + lam} y2="120" stroke="currentColor" stroke-width="1.5" marker-start="url(#am)" marker-end="url(#am)" />
		<text x={60 + lam / 2} y="112" text-anchor="middle" font-size="12">λ = √(D/k)</text>
		<!-- arrows: production, decay -->
		<path d="M98 150 V 196" stroke="#9467bd" stroke-width="2" marker-end="url(#am-9467bd)" />
		<text x="98" y="142" text-anchor="middle" font-size="12" fill="#9467bd">k_prod</text>
		<path d="M420 160 V 120" stroke="currentColor" stroke-width="1.5" marker-end="url(#am)" />
		<text x="420" y="112" text-anchor="middle" font-size="12">k_decay · [M]</text>
	</svg>
	<figcaption>A substance produced in a few cells, decaying everywhere and passing between cells through gap junctions settles into an exponential gradient. Its length scale λ = √(D/k) is set by the ratio of junctional diffusivity to decay rate, not by the production rate, which only sets the amplitude.</figcaption>
</figure>
