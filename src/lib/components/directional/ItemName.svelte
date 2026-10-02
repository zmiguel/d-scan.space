<script>
	import TruncatedText from '$lib/components/TruncatedText.svelte';

	/** Type name with its group in brackets; full text in a tooltip when truncated. */
	let { item } = $props();
</script>

{#snippet label()}
	{item.name}
	{#if item.group}
		<span class="text-xs text-gray-500 italic dark:text-gray-400"> ({item.group})</span>
	{/if}
{/snippet}

<TruncatedText class="max-w-full min-w-0">{@render label()}</TruncatedText>
