<script>
	import TopBar from '$lib/components/TopBar.svelte';
	import UpdateScan from '$lib/components/UpdateScan.svelte';
	import ScanTimeLine from '$lib/components/ScanTimeLine.svelte';
	import ScanTabs from '$lib/components/ScanTabs.svelte';

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
</script>

<svelte:head>
	<title>Scan {data.params.scan} | D-Scan Space!</title>
</svelte:head>

<div class="container mx-auto">
	<div class="grid grid-cols-12 gap-4">
		<!-- Main content area (80-85% width) -->
		<div class="col-span-12 rounded-lg bg-white p-2 md:col-span-10 dark:bg-gray-800">
			<div class="min-h-[600px]">
				<!-- First row: Breadcrumbs and timestamp -->
				<TopBar {data} />

				<!-- Second row: Using tabs for scan content -->
				<ScanTabs {data} />
			</div>
		</div>

		<!-- Sidebar (15-20% width) -->
		<div class="col-span-12 rounded-lg bg-white p-2 md:col-span-2 dark:bg-gray-800">
			<!-- Row 1: Update current scan -->
			<UpdateScan {data} />

			<!-- Row 2: Timeline of related scans -->
			<ScanTimeLine {data} />
		</div>
	</div>
</div>
