<script>
	import { Breadcrumb, BreadcrumbItem, Badge, Span, Tabs, TabItem } from 'flowbite-svelte';
	import { ChevronLeftOutline, UsersGroupSolid, InfoCircleSolid, RocketSolid } from 'flowbite-svelte-icons';
	export let data;

	console.log(data);

	// extract alliances, coprs, and chars from data in different arrays
	var alliances = [];
	var corporations = [];
	var characters = [];

	// This would come from your data in a real scenario
	const systemSecurity = 0.8; // Example value
	const systemName = "Jita";
	const constellation = "Kimotoro";
	const region = "The Forge";

	// Function to determine security color based on value
	function getSecurityClass(secValue) {
		if (secValue >= 0.5) return "green";
		if (secValue > 0.0) return "yellow";
		return "red";
	}

	// Format the timestamp using ISO 8601 format with UTC
	const formattedTimestamp = new Date(data.created_at*1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
	// This converts "2025-06-15T14:30:00.000Z" to "2025-06-15 14:30:00 UTC"
</script>

<div class="container mx-auto">
	<div class="grid grid-cols-12 gap-4">
		<!-- Main content area (80-85% width) -->
		<div class="col-span-12 md:col-span-10 p-2 bg-white dark:bg-gray-800 rounded-lg">
			<div class="min-h-[600px]">
				<!-- First row: Breadcrumbs and timestamp -->
				<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-2 border-b-2 dark:border-gray-600">
					<div class="flex items-center gap-2 mb-2 sm:mb-0">
						<Breadcrumb aria-label="System location" class="bg-transparent p-0 mb-0">
							{#if data.system}
								<BreadcrumbItem>
									<svelte:fragment slot="icon">
										<Badge class="me-2" color={getSecurityClass(systemSecurity)}>{systemSecurity.toFixed(1)}</Badge>
									</svelte:fragment>
									{systemName}
								</BreadcrumbItem>
								<BreadcrumbItem>
									<svelte:fragment slot="icon">
										<ChevronLeftOutline class="w-5 h-5 dark:text-gray-200" />
									</svelte:fragment>
									{constellation}
								</BreadcrumbItem>
								<BreadcrumbItem>
									<svelte:fragment slot="icon">
										<ChevronLeftOutline class="w-5 h-5 dark:text-gray-200" />
									</svelte:fragment>
									<span class="align-text-top">{region}</span>
								</BreadcrumbItem>
							{:else}
								<BreadcrumbItem>
									<svelte:fragment slot="icon">
										<Badge class="me-2" color="purple">?</Badge>
									</svelte:fragment>
									<span class="italic">Unknown System</span>
								</BreadcrumbItem>
							{/if}
						</Breadcrumb>
					</div>
					<div class="text-sm text-gray-600 dark:text-gray-400">
						<span class="font-medium">{formattedTimestamp}</span>
					</div>
				</div>

				<!-- Second row: Using tabs for scan content -->
				<div class="bg-gray-100 dark:bg-gray-700 p-0 rounded min-h-[500px]">
					<Tabs tabStyle="underline" contentClass="p-3">
						<TabItem
							open
							activeClasses="py-3 px-4 text-primary-600 border-b-2 border-primary-600 dark:text-primary-500 dark:border-primary-500 active"
							inactiveClasses="inline-block text-sm font-medium text-center disabled:cursor-not-allowed py-3 px-4 border-b-2 border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 text-gray-500 dark:text-gray-400"
						>
							<div slot="title" class="flex items-center gap-2">
								<InfoCircleSolid size="md" />
								Overview
							</div>
							<div class="space-y-2">
								<div class="text-sm">
									Overview content goes here
								</div>
							</div>
						</TabItem>
						<TabItem
							activeClasses="py-3 px-4 text-primary-600 border-b-2 border-primary-600 dark:text-primary-500 dark:border-primary-500 active"
							inactiveClasses="inline-block text-sm font-medium text-center disabled:cursor-not-allowed py-3 px-4 border-b-2 border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 text-gray-500 dark:text-gray-400"
						>
							<div slot="title" class="flex items-center gap-2">
								<UsersGroupSolid size="md" />
								Local
							</div>

						</TabItem>
						<TabItem
							activeClasses="py-3 px-4 text-primary-600 border-b-2 border-primary-600 dark:text-primary-500 dark:border-primary-500 active"
							inactiveClasses="inline-block text-sm font-medium text-center disabled:cursor-not-allowed py-3 px-4 border-b-2 border-transparent hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 text-gray-500 dark:text-gray-400"
						>
							<div slot="title" class="flex items-center gap-2">
								<RocketSolid size="md" />
								Space
							</div>

						</TabItem>
					</Tabs>
				</div>
			</div>
		</div>

		<!-- Sidebar (15-20% width) -->
		<div class="col-span-12 md:col-span-2 bg-white dark:bg-gray-800 rounded-lg p-2">
			<h3 class="text-lg font-semibold mb-3 border-b pb-2">Sidebar</h3>
			<div class="space-y-3">
				<!-- Sidebar content -->
				<div class="text-sm">
					Sidebar content goes here
				</div>
			</div>
		</div>
	</div>
</div>
