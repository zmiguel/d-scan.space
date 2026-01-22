<script>
	import { Timeline } from 'flowbite-svelte';
	import { UsersGroupSolid, RocketSolid } from 'flowbite-svelte-icons';
	import HtmlTimelineItem from '$lib/components/HtmlTimelineItem.svelte';

	let { data } = $props();

	// Sort related scans by created_at in descending order (newest first)
	const sortedRelatedScans = $derived(
		data.related
			? [...data.related].sort(
					(a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
				)
			: []
	);

	// Format timestamp for timeline items
	function formatTimestamp(timestamp) {
		return new Date(timestamp)
			.toISOString()
			.replace('T', ' ')
			.replace(/\.\d+Z$/, '');
	}

	// Format scan type for display
	function formatScanType(scanType) {
		return scanType.charAt(0).toUpperCase() + scanType.slice(1) + ' Scan';
	}
</script>

<div>
	<h3 class="mb-3 border-b pb-2 text-base font-semibold sm:text-lg">Related Scans</h3>
	{#if sortedRelatedScans.length > 0}
		<Timeline order="vertical">
			{#each sortedRelatedScans as scan (scan.id)}
				<HtmlTimelineItem
					htmlTitle={`<a href="/scan/${data.params?.group}/${scan.id}" class="text-primary-600 dark:text-primary-400 hover:underline text-sm">${formatScanType(scan.scan_type)}</a> ${scan.id === data.params?.scan ? '<span class="ms-1 text-gray-400 text-sm italic">(here)</span>' : ''}`}
					date={`${formatTimestamp(scan.created_at)}`}
					classLi="mb-2"
				>
					{#snippet icon()}
						<span
							class="absolute -start-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary-200 dark:bg-primary-900"
						>
							{#if scan.scan_type === 'local'}
								<UsersGroupSolid class="h-4 w-4 text-primary-600 dark:text-primary-400" />
							{:else}
								<RocketSolid class="h-4 w-4 text-primary-600 dark:text-primary-400" />
							{/if}
						</span>
					{/snippet}
				</HtmlTimelineItem>
			{/each}
		</Timeline>
	{:else}
		<p class="text-sm text-gray-500 dark:text-gray-400">No related scans found.</p>
	{/if}
</div>
