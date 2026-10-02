<script>
	/** New / gone / on↔off-grid marker of a d-scan diff row. */
	let { row } = $props();
</script>

{#if row.status === 'new'}
	<span
		class="rounded bg-green-100 px-1.5 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-300"
		>New</span
	>
{:else if row.status === 'gone'}
	<span
		class="rounded bg-red-100 px-1.5 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-300"
		>Gone</span
	>
{:else if row.gridMoved > 0}
	<span
		class="rounded bg-yellow-100 px-1.5 text-xs font-medium whitespace-nowrap text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
		title="At least {row.gridMoved} moved between on and off grid (on grid: {row.before.on} → {row
			.after.on})">↕ {row.gridMoved} grid</span
	>
{/if}
