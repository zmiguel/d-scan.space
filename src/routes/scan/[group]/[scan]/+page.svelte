<script>
	import {
		Avatar,
		Breadcrumb,
		BreadcrumbItem,
		Badge,
		Tabs,
		TabItem,
		Textarea,
		Button,
		Timeline
	} from 'flowbite-svelte';
	import HtmlTimelineItem from '$lib/HtmlTimelineItem.svelte';
	import {
		ChevronLeftOutline,
		UsersGroupSolid,
		InfoCircleSolid,
		RocketSolid
	} from 'flowbite-svelte-icons';
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';

	// Define the expected structure for data
	/**
	 * @typedef {Object} Alliance
	 * @property {number} id
	 * @property {string} ticker
	 * @property {string} name
	 * @property {number} corporation_count
	 * @property {number} character_count
	 * @property {Array<Corporation>} corporations
	 *
	 * @typedef {Object} Corporation
	 * @property {number} id
	 * @property {string} ticker
	 * @property {string} name
	 * @property {number} character_count
	 * @property {Array<Character>} characters
	 * @property {string} [alliance_ticker]
	 *
	 * @typedef {Object} Character
	 * @property {number} id
	 * @property {string} name
	 * @property {number} sec_status
	 * @property {string} corporation_ticker
	 * @property {string} alliance_ticker
	 *
	 * @typedef {Object} Local
	 * @property {Array<Alliance>} alliances
	 *
	 * @typedef {Object} Data
	 * @property {Local} [local]
	 * @property {any} [related]
	 * @property {any} [created_at]
	 * @property {any} [params]
	 * @property {any} [system]
	 */

	/** @type {{ data: Data }} */
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

	// For the sidebar form
	let isLoading = $state(false);
	let formError = $state('');

	function handleSubmit() {
		isLoading = true;
		formError = '';
		return async ({ update }) => {
			await update();
			isLoading = false;
		};
	}

	// Reset loading state when component is destroyed or page changes
	onDestroy(() => {
		isLoading = false;
		formError = '';
	});

	// Reset loading state when page data changes (e.g., after navigation)
	$effect(() => {
		if (data && data.params) {
			isLoading = false;
			formError = '';
		}
	});

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

	// Derive corps and pilots from data to avoid reactive loops
	const corps = $derived(
		!data.local || !Array.isArray(data.local.alliances)
			? []
			: (() => {
					let allCorps = [];
					data.local.alliances.forEach((alliance) => {
						let temp = alliance.corporations;
						temp.forEach((corp) => (corp.alliance_ticker = alliance.ticker));
						allCorps = [...allCorps, ...temp];
					});
					// sort by number
					return allCorps.sort((a, b) => b.character_count - a.character_count);
				})()
	);

	const pilots = $derived(
		!corps || corps.length === 0
			? []
			: (() => {
					let allPilots = [];
					corps.forEach((corp) => {
						let temp = corp.characters;
						temp.forEach((character) => {
							character.corporation_ticker = corp.ticker;
							character.alliance_ticker = corp.alliance_ticker;
						});
						allPilots = [...allPilots, ...temp];
					});
					// sort alpha
					return allPilots.sort((a, b) => a.name.localeCompare(b.name));
				})()
	);
</script>

<svelte:head>
	<title>Scan {data.params.scan} | D-Scan Space!</title>
</svelte:head>

<div class="container mx-auto">
	<div class="grid grid-cols-12 gap-4">
		<!-- Main content area (80-85% width) -->
		<div class="col-span-12 md:col-span-10 p-2 bg-white dark:bg-gray-800 rounded-lg">
			<div class="min-h-[600px]">
				<!-- First row: Breadcrumbs and timestamp -->
				<div
					class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 pb-2 border-b-2 dark:border-gray-600"
				>
					<div class="flex items-center gap-2 mb-2 sm:mb-0">
						<Breadcrumb aria-label="System location" class="bg-transparent p-0 mb-0">
							{#if data.system}
								<BreadcrumbItem>
									<svelte:fragment slot="icon">
										<Badge class="me-2" color={getSecurityClass(systemSecurity)}
											>{systemSecurity.toFixed(1)}</Badge
										>
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
								<div class="text-sm">Overview content goes here</div>
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
							<div class=" grid grid-cols-3 gap-2">
								<div class="col-span-1 border-e-2 border-gray-600">
									<h1 class="font-bold ms-2 text-xl">Alliances</h1>
									<div class="col-auto mt-2">
										{#each data.local?.alliances ?? [] as alliance}
											<div
												class="flex flex-col sm:flex-row justify-between items-start sm:items-center"
											>
												<div class="flex items-center space-x-2 mt-1 rtl:space-x-reverse">
													<Avatar
														rounded
														src="https://images.evetech.net/alliances/{alliance.id}/logo?size=64"
													/>
													<div class="font-medium dark:text-white">
														<div>
															{#if alliance.ticker}
																<span class="text-primary-700 dark:text-primary-400"
																	>[{alliance.ticker}]</span
																>
																{alliance.name}
															{:else}
																<span class="italic">No Alliance</span>
															{/if}
														</div>
														<div class="text-pink-600 dark:text-pink-400">
															{alliance.corporation_count} Corporations
														</div>
													</div>
												</div>
												<div class="text-amber-600 dark:text-amber-400 me-3">
													{alliance.character_count}
												</div>
											</div>
										{/each}
									</div>
								</div>
								<div class="col-span-1 border-e-2 border-gray-600">
									<h1 class="font-bold ms-2 text-xl">Corporations</h1>
									<div class="col-auto mt-2">
										{#each corps as corp}
											<div
												class="flex flex-col sm:flex-row justify-between items-start sm:items-center"
											>
												<div class="flex items-center space-x-4 mt-1 rtl:space-x-reverse">
													<Avatar
														rounded
														src="https://images.evetech.net/corporations/{corp.id}/logo?size=64"
													/>
													<div class="font-medium dark:text-white">
														<div>
															<span class="text-primary-700 dark:text-primary-400"
																>{'<' + corp.ticker + '>'}</span
															>
															{corp.name}
														</div>
														{#if corp.alliance_ticker}
															<div class="text-pink-600 dark:text-pink-400">
																[{corp.alliance_ticker}]
															</div>
														{/if}
													</div>
												</div>
												<div class="text-amber-600 dark:text-amber-400 me-2">
													{corp.character_count}
												</div>
											</div>
										{/each}
									</div>
								</div>
								<div class="col-span-1">
									<h1 class="font-bold ms-2 text-xl">Pilots</h1>
									<div class="col-auto mt-2">
										{#each pilots as pilot}
											<div
												class="flex flex-col sm:flex-row justify-between items-start sm:items-center"
											>
												<div class="flex items-center space-x-4 mt-1 rtl:space-x-reverse">
													<Avatar
														rounded
														src="https://images.evetech.net/characters/{pilot.id}/portrait?size=64"
													/>
													<div class="font-medium dark:text-white">
														<div>
															{pilot.name}
															<span class="text-primary-700 dark:text-primary-400"
																>{pilot.sec_status.toFixed(3)}</span
															>
														</div>
														<div>
															<span class="text-pink-600 dark:text-pink-400"
																>[{pilot.alliance_ticker}]</span
															>
															<span class="text-amber-600 dark:text-amber-400"
																>{'<' + pilot.corporation_ticker + '>'}</span
															>
														</div>
													</div>
												</div>
											</div>
										{/each}
									</div>
								</div>
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
			<!-- Row 1: Update current scan -->
			<div class="mb-3">
				<h3 class="text-lg font-semibold mb-3 border-b pb-2">Update Scan</h3>
				{#if isLoading}
					<div class="flex flex-col items-center justify-center py-4">
						<div class="text-center">
							<div class="inline-block">
								<svg
									class="animate-spin h-7 w-7 text-primary-600"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
								>
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									></circle>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									></path>
								</svg>
							</div>
							<p class="text-base mt-2 text-gray-600 dark:text-gray-400">Processing...</p>
						</div>
					</div>
				{:else}
					<form
						id="update-scan-form"
						method="POST"
						action="/scan?/update"
						use:enhance={handleSubmit}
					>
						<!-- Hidden input for scan group -->
						<input type="hidden" name="scan_group" value={data.params.group} />

						<Textarea
							id="scan-content"
							placeholder="Paste your data"
							rows={4}
							name="scan_content"
							required
							class="text-sm mb-2"
						/>
						{#if formError}
							<div class="text-red-500 text-xs mb-2">{formError}</div>
						{/if}
						<Button class="w-full text-sm" color="primary" type="submit" size="sm">Update</Button>
					</form>
				{/if}
			</div>

			<!-- Row 2: Timeline of related scans -->
			<div>
				<h3 class="text-lg font-semibold mb-3 border-b pb-2">Related Scans</h3>
				{#if sortedRelatedScans.length > 0}
					<Timeline order="vertical">
						{#each sortedRelatedScans as scan}
							<HtmlTimelineItem
								htmlTitle={`<a href="/scan/${data.params?.group}/${scan.id}" class="text-primary-600 dark:text-primary-400 hover:underline text-sm">${formatScanType(scan.scan_type)}</a> ${scan.id === data.params?.scan ? '<span class="ms-1 text-gray-400 text-sm italic">(here)</span>' : ''}`}
								date={`${formatTimestamp(scan.created_at)}`}
								classLi="mb-2"
							>
								{#snippet icon()}
									<span
										class="flex absolute -start-3 justify-center items-center w-6 h-6 bg-primary-200 rounded-full dark:bg-primary-900"
									>
										{#if scan.scan_type === 'local'}
											<UsersGroupSolid class="w-4 h-4 text-primary-600 dark:text-primary-400" />
										{:else}
											<RocketSolid class="w-4 h-4 text-primary-600 dark:text-primary-400" />
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
		</div>
	</div>
</div>
