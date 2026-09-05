<script lang="ts">
	import { getSession } from '$lib/sim/session.svelte';
	import { Button } from '$lib/components/ui/button';
	import Radio from '@lucide/svelte/icons/radio';
	import SkipBack from '@lucide/svelte/icons/skip-back';
	import SkipForward from '@lucide/svelte/icons/skip-forward';

	const session = getSession();
	const last = $derived(Math.max(0, session.historyLen - 1));
	const pos = $derived(session.playhead ?? last);
	const live = $derived(session.playhead === null);
	function onKey(e: KeyboardEvent) {
		if (e.key === 'ArrowLeft') { e.preventDefault(); session.seek(pos - (e.shiftKey ? 10 : 1)); }
		if (e.key === 'ArrowRight') { e.preventDefault(); session.seek(pos + (e.shiftKey ? 10 : 1)); }
	}
</script>

<div class="flex h-9 items-center gap-2 border-t border-border px-2 text-xs" title="Scrub through recorded frames (last 3000 snapshots since the reset). Left/right arrows step frames; shift for 10.">
	<Button size="sm" variant="ghost" class="h-7 px-1.5" onclick={() => session.seek(pos - 1)} disabled={session.historyLen === 0} title="Previous frame"><SkipBack class="size-3.5" /></Button>
	<input
		type="range"
		class="min-w-0 flex-1 accent-primary"
		min="0"
		max={last}
		value={pos}
		disabled={session.historyLen === 0}
		oninput={(e) => session.seek(+(e.target as HTMLInputElement).value)}
		onkeydown={onKey}
	/>
	<Button size="sm" variant="ghost" class="h-7 px-1.5" onclick={() => session.seek(pos + 1)} disabled={live} title="Next frame"><SkipForward class="size-3.5" /></Button>
	<span class="w-28 font-mono tabular-nums text-muted-foreground">{session.historyLen ? `${pos + 1} / ${session.historyLen}` : 'no frames'}</span>
	<Button size="sm" variant={live ? 'ghost' : 'default'} class="h-7 gap-1 px-2" onclick={() => session.seek(null)} disabled={live} title="Return to the live simulation state"><Radio class="size-3.5" /> live</Button>
</div>
