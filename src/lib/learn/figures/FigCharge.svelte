<!-- Left: membrane as a parallel-plate capacitor. Right: excess ions are a sliver of the total. -->
<figure>
	<svg viewBox="0 0 560 230" class="text-foreground" fill="currentColor" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif">
		<!-- capacitor -->
		<rect x="20" y="30" width="110" height="170" rx="6" class="fill-muted/60 stroke-border" />
		<rect x="170" y="30" width="110" height="170" rx="6" class="fill-muted/20 stroke-border" />
		<rect x="130" y="30" width="40" height="170" class="fill-amber-200/60 dark:fill-amber-900/40 stroke-border" />
		<text x="75" y="50" text-anchor="middle" font-weight="600">inside</text>
		<text x="225" y="50" text-anchor="middle" font-weight="600">outside</text>
		<g font-size="13" font-weight="700">
			{#each [75, 100, 125, 150, 175] as y (y)}
				<text x="122" y={y + 4} text-anchor="middle" fill="#4363d8">−</text>
				<text x="178" y={y + 4} text-anchor="middle" fill="#e6194b">+</text>
			{/each}
		</g>
		<text x="150" y="215" text-anchor="middle" font-size="12" class="fill-muted-foreground">7.5 nm</text>
		<text x="150" y="20" text-anchor="middle" font-size="12">σ = C<tspan font-size="9" dy="3">m</tspan><tspan dy="-3"> · V</tspan><tspan font-size="9" dy="3">m</tspan></text>
		<!-- ion count bar -->
		<text x="320" y="50" font-weight="600">ions in one cell</text>
		<rect x="320" y="65" width="220" height="40" class="fill-muted stroke-border" />
		<text x="430" y="90" text-anchor="middle" font-size="12">≈ 10¹⁰ K⁺, Na⁺, Cl⁻ …</text>
		<rect x="320" y="125" width="2.2" height="40" fill="#4363d8" />
		<line x1="322" y1="120" x2="380" y2="120" class="stroke-muted-foreground" />
		<text x="386" y="124" font-size="12" class="fill-muted-foreground">↑ net excess, ≈ 10⁵ (0.001 %)</text>
		<text x="320" y="185" font-size="12" class="fill-muted-foreground">that sliver of charge is what</text>
		<text x="320" y="201" font-size="12" class="fill-muted-foreground">sets V<tspan font-size="9" dy="3">m</tspan><tspan dy="-3"> to −60 mV</tspan></text>
	</svg>
	<figcaption>The membrane is a thin insulator between two conductors. The tiny net excess of charge on it, not the bulk concentrations, is what the voltage measures.</figcaption>
</figure>
