<!-- Membrane cross-section: K⁺ crowded inside, one K⁺ channel, diffusion vs electric pull, charge layers. -->
<figure>
	<svg viewBox="0 0 560 230" class="text-foreground" fill="currentColor" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif">
		<!-- compartments -->
		<rect x="10" y="20" width="250" height="180" rx="6" class="fill-muted/60 stroke-border" />
		<rect x="300" y="20" width="250" height="180" rx="6" class="fill-muted/20 stroke-border" />
		<text x="135" y="40" text-anchor="middle" font-weight="600">inside · 139 mM K⁺</text>
		<text x="425" y="40" text-anchor="middle" font-weight="600">outside · 5 mM K⁺</text>
		<!-- membrane -->
		<rect x="260" y="20" width="40" height="180" class="fill-amber-200/60 dark:fill-amber-900/40 stroke-border" />
		<text x="280" y="215" text-anchor="middle" class="fill-muted-foreground" font-size="12">membrane</text>
		<!-- channel -->
		<rect x="262" y="96" width="36" height="28" rx="6" class="fill-background stroke-foreground" />
		<!-- K+ inside (many) -->
		<g fill="#3cb44b" font-size="11" font-weight="700">
			{#each [[40,70],[70,100],[55,140],[95,60],[120,120],[150,80],[180,150],[210,95],[110,170],[160,180],[200,55],[235,130],[85,185],[30,110],[130,55],[225,170]] as [x, y] (x + ':' + y)}
				<circle cx={x} cy={y} r="8" /><text x={x} y={y + 4} text-anchor="middle" fill="white">K</text>
			{/each}
		</g>
		<!-- K+ outside (few) -->
		<g fill="#3cb44b" font-size="11" font-weight="700">
			{#each [[360,80],[470,150]] as [x, y] (x)}
				<circle cx={x} cy={y} r="8" /><text x={x} y={y + 4} text-anchor="middle" fill="white">K</text>
			{/each}
		</g>
		<!-- charge layers -->
		<g font-size="12" font-weight="700">
			{#each [60, 90, 120, 150, 180] as y (y)}
				<text x="252" y={y + 4} text-anchor="middle" fill="#4363d8">−</text>
				<text x="308" y={y + 4} text-anchor="middle" fill="#e6194b">+</text>
			{/each}
		</g>
		<!-- arrows through channel -->
		<defs>
			<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker><marker id="ah-3cb44b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#3cb44b" /></marker><marker id="ah-e6194b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#e6194b" /></marker>
		</defs>
		<g stroke="currentColor" stroke-width="2" fill="none">
			<path d="M230 104 H 330" style="color:#3cb44b" marker-end="url(#ah-3cb44b)" />
			<path d="M330 118 H 245" style="color:#e6194b" marker-end="url(#ah-e6194b)" />
		</g>
		<text x="280" y="74" text-anchor="middle" fill="#3cb44b" font-size="12">diffusion (more inside)</text>
		<text x="280" y="152" text-anchor="middle" fill="#e6194b" font-size="12">electric pull (inside is −)</text>
	</svg>
	<figcaption>K⁺ leaves down its gradient, each ion leaving makes the inside a little more negative, and that pull grows until it exactly cancels the diffusion. The balancing voltage is the Nernst potential.</figcaption>
</figure>
