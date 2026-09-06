<!-- Na⁺/K⁺-ATPase: 3 Na⁺ out, 2 K⁺ in, one ATP per cycle. -->
<figure>
	<svg viewBox="0 0 560 230" class="text-foreground" fill="currentColor" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif">
		<defs>
			<marker id="ap" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker><marker id="ap-f58231" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f58231" /></marker><marker id="ap-3cb44b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#3cb44b" /></marker>
		</defs>
		<rect x="10" y="20" width="250" height="180" rx="6" class="fill-muted/60 stroke-border" />
		<rect x="300" y="20" width="250" height="180" rx="6" class="fill-muted/20 stroke-border" />
		<text x="135" y="40" text-anchor="middle" font-weight="600">inside</text>
		<text x="425" y="40" text-anchor="middle" font-weight="600">outside</text>
		<rect x="260" y="20" width="40" height="180" class="fill-amber-200/60 dark:fill-amber-900/40 stroke-border" />
		<!-- pump protein -->
		<rect x="240" y="60" width="80" height="110" rx="24" class="fill-background stroke-foreground" stroke-width="1.5" />
		<text x="280" y="120" text-anchor="middle" font-size="12" font-weight="600">Na⁺/K⁺</text>
		<text x="280" y="136" text-anchor="middle" font-size="12" font-weight="600">ATPase</text>
		<!-- 3 Na out -->
		<g style="color:#f58231" stroke="currentColor" stroke-width="2" fill="none" marker-end="url(#ap-f58231)">
			<path d="M150 80 H 235" /><path d="M325 80 H 400" />
		</g>
		<g fill="#f58231" font-size="11" font-weight="700">
			{#each [90, 112, 134] as x (x)}<circle cx={x} cy="80" r="8" /><text x={x} y="84" text-anchor="middle" fill="white">Na</text>{/each}
		</g>
		<text x="150" y="60" fill="#f58231" font-weight="600">3 Na⁺ out</text>
		<!-- 2 K in -->
		<g style="color:#3cb44b" stroke="currentColor" stroke-width="2" fill="none" marker-end="url(#ap-3cb44b)">
			<path d="M400 150 H 325" /><path d="M235 150 H 150" />
		</g>
		<g fill="#3cb44b" font-size="11" font-weight="700">
			{#each [440, 462] as x (x)}<circle cx={x} cy="150" r="8" /><text x={x} y="154" text-anchor="middle" fill="white">K</text>{/each}
		</g>
		<text x="400" y="180" fill="#3cb44b" font-weight="600">2 K⁺ in</text>
		<!-- ATP -->
		<text x="120" y="190" font-size="12" class="fill-muted-foreground">ATP → ADP + Pᵢ, one per cycle</text>
		<text x="60" y="130" font-size="12" class="fill-muted-foreground">net: one + charge leaves</text>
	</svg>
	<figcaption>The pump costs one ATP per cycle and moves three positive charges out for two in, so it both builds the gradients and directly charges the inside negative.</figcaption>
</figure>
