<script>
	import { Breadcrumb, BreadcrumbItem, Badge } from 'flowbite-svelte';
	import { ChevronLeftOutline } from 'flowbite-svelte-icons';

	let { data } = $props();

	// This would come from your data in a real scenario
	const systemSecurity = 0.8; // Example value
	const systemName = 'Jita';
	const constellation = 'Kimotoro';
	const region = 'The Forge';

	// Function to determine security color based on value
	function getSecurityClass(secValue) {
		if (secValue >= 0.5) return 'green';
		if (secValue > 0.0) return 'yellow';
		return 'red';
	}

	// Format the timestamp using ISO 8601 format with UTC
	const formattedTimestamp = $derived(
		data.created_at
			? new Date(data.created_at)
					.toISOString()
					.replace('T', ' ')
					.replace(/\.\d+Z$/, '')
			: ''
	);
	// This converts "2025-06-15T14:30:00.000Z" to "2025-06-15 14:30:00 UTC"
</script>

<div
	class="mb-4 flex flex-col items-start justify-between border-b-2 pb-2 sm:flex-row sm:items-center dark:border-gray-600"
>
	<div class="mb-2 flex items-center gap-2 sm:mb-0">
		<Breadcrumb aria-label="System location" class="mb-0 bg-transparent p-0">
			{#if data.system}
				<BreadcrumbItem class="ms-0 md:ms-0">
					{#snippet icon()}
						<Badge color={getSecurityClass(systemSecurity)}>{systemSecurity.toFixed(1)}</Badge>
					{/snippet}
					{systemName}
				</BreadcrumbItem>
				<BreadcrumbItem>
					{#snippet icon()}
						<ChevronLeftOutline class="h-5 w-5 dark:text-gray-200" />
					{/snippet}
					{constellation}
				</BreadcrumbItem>
				<BreadcrumbItem>
					{#snippet icon()}
						<ChevronLeftOutline class="h-5 w-5 dark:text-gray-200" />
					{/snippet}
					<span class="align-text-top">{region}</span>
				</BreadcrumbItem>
			{:else}
				<BreadcrumbItem class="ms-0 md:ms-0">
					{#snippet icon()}
						<Badge color="purple">?</Badge>
					{/snippet}
					<span class="italic">Unknown System</span>
				</BreadcrumbItem>
			{/if}
		</Breadcrumb>
	</div>
	<div class="text-sm text-gray-600 dark:text-gray-400">
		<span class="font-medium">{formattedTimestamp}</span>
	</div>
</div>
