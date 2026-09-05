<script lang="ts">
	import type { Snippet } from 'svelte';
	/** Two-column lesson: prose on the left, live demo on the right (stacks on narrow screens). */
	let { title, children, demo }: { title: string; children: Snippet; demo: Snippet } = $props();
</script>

<h1 class="mb-4 text-2xl font-semibold tracking-tight">{title}</h1>
<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
	<div class="prose-lesson text-[15px] leading-relaxed [&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:text-base [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_.eq]:my-3 [&_.eq]:rounded-md [&_.eq]:border [&_.eq]:border-border [&_.eq]:bg-muted/40 [&_.eq]:px-3 [&_.eq]:py-2 [&_.eq]:font-mono [&_.eq]:text-sm">
		{@render children()}
	</div>
	<div class="lg:sticky lg:top-4 lg:self-start">
		<div class="rounded-lg border border-border bg-card p-4">{@render demo()}</div>
	</div>
</div>
