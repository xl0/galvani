<script lang="ts">
	/** Labelled slider; `log` maps the slider linearly over log10 of the value. */
	let { label, value = $bindable(), min, max, step = undefined as number | undefined, log = false, unit = '', format = (v: number) => String(v), onchange = undefined as ((v: number) => void) | undefined }:
		{ label: string; value: number; min: number; max: number; step?: number; log?: boolean; unit?: string; format?: (v: number) => string; onchange?: (v: number) => void } = $props();
	const toSlider = (v: number) => (log ? Math.log10(v) : v);
	const fromSlider = (s: number) => (log ? 10 ** s : s);
</script>

<label class="grid grid-cols-[9rem_1fr_6rem] items-center gap-2 py-1 text-sm">
	<span>{label}</span>
	<input type="range" class="accent-primary" min={toSlider(min)} max={toSlider(max)} step={log ? 0.02 : (step ?? (max - min) / 200)} value={toSlider(value)}
		oninput={(e) => { value = fromSlider(+(e.target as HTMLInputElement).value); onchange?.(value); }} />
	<span class="font-mono text-xs tabular-nums text-muted-foreground">{format(value)} {unit}</span>
</label>
