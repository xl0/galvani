<script lang="ts">
	/** Dialog-sized numeric field: label, input with unit, and a visible description. */
	let {
		label, value, onchange, unit = '', scale = 1, step = undefined as number | undefined, min = undefined as number | undefined, description = ''
	}: { label: string; value: number; onchange: (v: number) => void; unit?: string; scale?: number; step?: number; min?: number; description?: string } = $props();

	let text = $derived(String(+(value * scale).toPrecision(6)));
	function commit(e: Event) {
		const v = parseFloat((e.target as HTMLInputElement).value);
		if (Number.isFinite(v) && v / scale !== value) onchange(v / scale);
	}
</script>

<label class="grid grid-cols-[10rem_1fr] items-start gap-x-3 gap-y-0.5 py-2">
	<span class="pt-1.5 text-sm font-medium">{label}</span>
	<span class="flex items-center gap-2">
		<input type="number" class="h-8 w-40 rounded-md border border-input bg-background px-2 font-mono text-sm tabular-nums outline-none focus:ring-2 focus:ring-ring" value={text} {step} {min} onchange={commit} onkeydown={(e) => e.key === 'Enter' && commit(e)} />
		<span class="text-sm text-muted-foreground">{unit}</span>
	</span>
	{#if description}<span class="col-start-2 text-sm leading-snug text-muted-foreground">{description}</span>{/if}
</label>
