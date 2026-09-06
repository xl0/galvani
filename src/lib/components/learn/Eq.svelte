<script lang="ts">
	import katex from 'katex';
	import 'katex/dist/katex.min.css';
	/** KaTeX equation. `tex` in display mode (block) or inline. */
	let { tex, inline = false }: { tex: string; inline?: boolean } = $props();
	const html = $derived(katex.renderToString(tex, { displayMode: !inline, throwOnError: true }));
</script>

{#if inline}<span>{@html html}</span>{:else}<div class="eq">{@html html}</div>{/if}
