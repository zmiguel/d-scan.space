<script>
	import { Modal } from 'flowbite-svelte';
	import ComparePicker from './ComparePicker.svelte';
	import { formatDuration, formatUtcTimestamp } from '$lib/utils/time.js';

	/**
	 * "Compare" button of the scan page: dialog to compare this scan with another scan of the
	 * same type, preselecting the previous one of the group. Any pasted scan (or group) link
	 * works too; `/compare` resolves it.
	 *
	 * @type {{
	 *   scanId: string,
	 *   related: Array<{ id: string, scan_type: string, created_at: string | Date }>
	 * }}
	 */
	let { scanId, related } = $props();

	let open = $state(false);
	let other = $state('');

	const current = $derived(related.find((scan) => scan.id === scanId));
	const sameType = $derived(
		current
			? related
					.filter((scan) => scan.id !== scanId && scan.scan_type === current.scan_type)
					.toReversed()
			: []
	);
	const time = (scan) => new Date(scan.created_at).getTime();

	/** Latest earlier scan of the same type, else the first later one. */
	function defaultOther() {
		const earlier = sameType.find((scan) => time(scan) <= time(current));
		return (earlier ?? sameType.at(-1))?.id ?? '';
	}

	function relativeLabel(scan) {
		const diff = time(scan) - time(current);
		return diff < 0 ? `${formatDuration(-diff)} earlier` : `${formatDuration(diff)} later`;
	}

	function openDialog() {
		other = defaultOther();
		open = true;
	}
</script>

<button
	type="button"
	onclick={openDialog}
	title="Compare this scan with another scan of the same type"
	class="inline-flex cursor-pointer items-center gap-1 rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
>
	Compare
</button>

<Modal
	bind:open
	title="Compare with another {current?.scan_type === 'local' ? 'local scan' : 'd-scan'}"
	size="md"
>
	<p class="text-sm text-gray-600 dark:text-gray-300">
		Paste a scan link from any group, or pick a scan of this group.
	</p>
	<ComparePicker a={scanId} bind:b={other} fixedA labelB="Other scan" />
	{#if sameType.length > 0}
		<ul class="max-h-64 overflow-y-auto rounded border border-gray-200 dark:border-gray-700">
			{#each sameType as scan (scan.id)}
				<li>
					<button
						type="button"
						aria-pressed={other === scan.id}
						onclick={() => (other = scan.id)}
						class={[
							'flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-left text-sm',
							other === scan.id
								? 'bg-primary-100 dark:bg-gray-600'
								: 'hover:bg-gray-100 dark:hover:bg-gray-700'
						]}
					>
						<span class="text-gray-900 tabular-nums dark:text-white"
							>{formatUtcTimestamp(scan.created_at)}</span
						>
						<span class="text-xs text-gray-500 dark:text-gray-400">{relativeLabel(scan)}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</Modal>
