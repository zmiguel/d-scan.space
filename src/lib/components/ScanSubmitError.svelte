<script>
	/**
	 * Inline reason why a pasted scan was rejected (returned by the scan actions with
	 * `fail()`), including the first lines that did not match.
	 *
	 * @typedef {{ message: string, failedLines?: Array<{ line_number: number, line: string }>,
	 *   failedLineCount?: number }} ScanSubmitError
	 */

	/** @type {{ error: ScanSubmitError | null, compact?: boolean }} */
	let { error, compact = false } = $props();

	const failedLines = $derived(error?.failedLines ?? []);
	const hiddenCount = $derived(Math.max((error?.failedLineCount ?? 0) - failedLines.length, 0));
</script>

{#if error}
	<div
		class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
		role="alert"
	>
		<p class="font-semibold">{error.message}</p>
		{#if failedLines.length > 0}
			<p class="mt-2">
				{compact ? 'First lines that did not match:' : 'Lines that did not match:'}
			</p>
			<ul class="mt-1 space-y-0.5 font-mono text-xs">
				{#each failedLines as failed (failed.line_number)}
					<li class="truncate">
						<span class="text-red-500 dark:text-red-400">#{failed.line_number}</span>
						{failed.line}
					</li>
				{/each}
			</ul>
			{#if hiddenCount > 0}
				<p class="mt-1 text-xs">…and {hiddenCount} more.</p>
			{/if}
		{/if}
	</div>
{/if}
