<script lang="ts">
	import { Slider as UiSlider } from '$lib/components/ui/slider';
	/** Labelled slider; `log` maps the slider linearly over log10 of the value. */
	let { label, value = $bindable(), min, max, step = undefined as number | undefined, log = false, unit = '', format = (v: number) => String(v), onchange = undefined as ((v: number) => void) | undefined }:
		{ label: string; value: number; min: number; max: number; step?: number; log?: boolean; unit?: string; format?: (v: number) => string; onchange?: (v: number) => void } = $props();
	const toSlider = (v: number) => (log ? Math.log10(v) : v);
	const fromSlider = (s: number) => (log ? 10 ** s : s);
</script>

<div class="grid grid-cols-[10rem_1fr_6rem] items-center gap-3 py-1.5 text-base">
	<span>{label}</span>
	<UiSlider type="single" min={toSlider(min)} max={toSlider(max)} step={log ? 0.005 : (step ?? (max - min) / 200)} value={toSlider(value)}
		onValueChange={(v) => { value = fromSlider(v); onchange?.(value); }} />
	<span class="font-mono text-sm tabular-nums text-muted-foreground">{format(value)} {unit}</span>
</div>
