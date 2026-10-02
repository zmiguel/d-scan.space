<script>
	/** d-scan count of one side: total, with the on-grid part when there is one. */
	let { counts } = $props();
</script>

<span class="tabular-nums">
	{#if counts.total === 0}
		<span class="text-gray-400 dark:text-gray-500">–</span>
	{:else}
		<span class="font-medium text-gray-900 dark:text-white">{counts.total}</span>
		{#if counts.on > 0}
			<span class="text-xs text-red-600 dark:text-red-400">({counts.on} on)</span>
		{/if}
	{/if}
</span>
