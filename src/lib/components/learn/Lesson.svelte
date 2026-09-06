<script lang="ts">
	import type { Snippet } from 'svelte';
	/** Two-column lesson: prose on the left, live demo on the right (stacks on narrow screens). */
	let { title, children, demo }: { title: string; children: Snippet; demo: Snippet } = $props();
</script>

<h1 class="mb-4 text-3xl font-semibold tracking-tight">{title}</h1>
<div class="grid gap-10 lg:grid-cols-[minmax(0,62rem)_minmax(24rem,36rem)]">
	<div class="prose-lesson max-w-[62rem] text-[17px] leading-relaxed [&_h3]:mt-5 [&_h3]:mb-1.5 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.85em] [&_.eq]:my-3 [&_.eq]:rounded-md [&_.eq]:border [&_.eq]:border-border [&_.eq]:bg-muted/40 [&_.eq]:px-3 [&_.eq]:py-2 [&_.eq]:text-[1.05em] [&_.eq]:overflow-x-auto [&_figure]:my-5 [&_figure.narrow]:float-right [&_figure.narrow]:ml-6 [&_figure.narrow]:w-64 [&_figcaption]:mt-1.5 [&_figcaption]:text-[15px] [&_figcaption]:leading-snug [&_figcaption]:text-muted-foreground [&_svg]:h-auto [&_svg]:w-full">
		{@render children()}
	</div>
	<div class="lg:sticky lg:top-4 lg:self-start">
		<div class="rounded-lg border border-border bg-card p-4 text-base">{@render demo()}</div>
	</div>
</div>
