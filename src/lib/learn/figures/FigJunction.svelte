<script lang="ts">
	/** Harris steady-state open fraction vs |V_gj|. Shape only; the simulator uses BETSE's constants. */
	const pts = Array.from({ length: 60 }, (_, i) => { const v = i * 2; const o = 0.1 + 0.9 / (1 + Math.exp((v - 60) / 8)); return `${330 + v * 3.3},${140 - o * 100}`; }).join(' ');
</script>

<figure>
	<svg viewBox="0 0 560 210" class="text-foreground" fill="currentColor" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif">
		<defs>
			<marker id="aj" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker><marker id="aj-e6194b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#e6194b" /></marker>
		</defs>
		<!-- two cells -->
		<rect x="20" y="40" width="120" height="130" rx="18" class="fill-muted/60 stroke-foreground" stroke-width="1.5" />
		<rect x="160" y="40" width="120" height="130" rx="18" class="fill-muted/60 stroke-foreground" stroke-width="1.5" />
		<text x="80" y="65" text-anchor="middle" font-weight="600">cell 0</text>
		<text x="220" y="65" text-anchor="middle" font-weight="600">cell 1</text>
		<text x="80" y="160" text-anchor="middle" font-size="12" fill="#e6194b">−20 mV</text>
		<text x="220" y="160" text-anchor="middle" font-size="12" fill="#4363d8">−60 mV</text>
		<!-- connexons: paired tubes bridging the gap -->
		{#each [90, 110, 130] as y (y)}
			<rect x="132" y={y - 5} width="36" height="10" rx="2" class="fill-background stroke-foreground" />
			<line x1="150" y1={y - 5} x2="150" y2={y + 5} class="stroke-border" />
		{/each}
		<text x="150" y="190" text-anchor="middle" font-size="12" class="fill-muted-foreground">gap junctions (fraction of the shared membrane)</text>
		<path d="M95 110 H 205" stroke="currentColor" stroke-width="2" marker-end="url(#aj-e6194b)" style="color:#e6194b" />
		<text x="150" y="70" text-anchor="middle" font-size="12" fill="#e6194b">current</text>
		<!-- gating curve -->
		<line x1="330" y1="140" x2="530" y2="140" class="stroke-border" /><line x1="330" y1="40" x2="330" y2="140" class="stroke-border" />
		<polyline points={pts} fill="none" stroke="currentColor" stroke-width="2" />
		<text x="430" y="160" text-anchor="middle" font-size="12" class="fill-muted-foreground">|V<tspan font-size="9" dy="3">gj</tspan><tspan dy="-3">| = voltage across the junction</tspan></text>
		<text x="325" y="44" text-anchor="end" font-size="12" class="fill-muted-foreground">open</text>
		<text x="325" y="134" text-anchor="end" font-size="12" class="fill-muted-foreground">min</text>
		<text x="430" y="30" text-anchor="middle" font-size="12" font-weight="600">steady-state open fraction</text>
	</svg>
	<figcaption>Left: a voltage difference between coupled cells drives current through the junctions. Right: junctions close when that difference gets large, down to a floor, so a strongly depolarized cell gets partly isolated.</figcaption>
</figure>
