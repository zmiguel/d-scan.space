<script module>
	export const ssr = true;
</script>

<script>
	import TopBar from '$lib/components/TopBar.svelte';
	import UpdateScan from '$lib/components/UpdateScan.svelte';
	import ScanTimeLine from '$lib/components/ScanTimeLine.svelte';
	import ScanTabs from '$lib/components/ScanTabs.svelte';
	import MetaTags from '$lib/components/MetaTags.svelte';
	import { buildGroupStats, SHIP_CATEGORY_ID } from '$lib/utils/directional.js';

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

	const formatCount = (value) => (typeof value === 'number' && !Number.isNaN(value) ? value : null);

	const scanSummary = $derived.by(() => {
		const parts = [];
		const systemValue = data?.system;
		const systemName =
			typeof systemValue === 'string'
				? systemValue
				: typeof systemValue?.name === 'string'
					? systemValue.name
					: null;
		const constellation =
			typeof systemValue?.constellation === 'string' ? systemValue.constellation : null;
		const region = typeof systemValue?.region === 'string' ? systemValue.region : null;
		const security =
			typeof systemValue?.security === 'number' ? systemValue.security.toFixed(2) : null;
		if (systemName || constellation || region) {
			const securityLabel = security ?? '?';
			const systemLabel = systemName ?? 'Unknown System';
			const constellationLabel = constellation ?? 'Unknown Constellation';
			const regionLabel = region ?? 'Unknown Region';
			parts.push(
				`Location: [${securityLabel}] ${systemLabel} > ${constellationLabel} > ${regionLabel}`
			);
		}

		const local = data?.local;
		if (local) {
			const pilots = formatCount(local.total_pilots);
			const corps = formatCount(local.total_corporations);
			const alliances = formatCount(local.total_alliances);
			const localBits = [];
			if (pilots !== null) localBits.push(`${pilots} pilots`);
			if (corps !== null) localBits.push(`${corps} corps`);
			if (alliances !== null) localBits.push(`${alliances} alliances`);
			parts.push(`Local: ${localBits.length ? localBits.join(', ') : 'no pilots'}`);

			const topAlliances = Array.isArray(local.alliances)
				? [...local.alliances]
						.filter((alliance) => alliance?.name)
						.sort((a, b) => (b?.character_count ?? 0) - (a?.character_count ?? 0))
						.slice(0, 3)
						.map((alliance) => `${alliance.name} (${formatCount(alliance.character_count) ?? 0})`)
				: [];

			if (topAlliances.length) {
				parts.push(`Top alliances: ${topAlliances.join(', ')}`);
			}
		}

		const directional = data?.directional;
		if (directional) {
			const onGrid = formatCount(directional?.on_grid?.total_objects) ?? 0;
			const offGrid = formatCount(directional?.off_grid?.total_objects) ?? 0;
			parts.push(`Directional: ${onGrid} on-grid, ${offGrid} off-grid`);

			const shipGroups = buildGroupStats(directional?.on_grid, directional?.off_grid)
				.filter((group) => Number(group?.categoryId) === SHIP_CATEGORY_ID)
				.slice(0, 3)
				.map((group) => `${group.name} (${group.total})`);

			if (shipGroups.length) {
				parts.push(`Top ships: ${shipGroups.join(', ')}`);
			}
		}

		if (parts.length === 0) {
			return `Scan in group ${data.params.group}.`;
		}

		return parts.map((part) => `• ${part}`).join('\n');
	});
</script>

<MetaTags title={`Scan ${data.params.scan}`} description={scanSummary} showImage={false} />

<div class="container mx-auto px-4 sm:px-0">
	<div class="grid grid-cols-12 gap-4">
		<!-- Main content area (80-85% width) -->
		<div class="col-span-12 rounded-lg bg-white p-3 sm:p-2 md:col-span-10 dark:bg-gray-800">
			<div class="min-h-[600px]">
				<!-- First row: Breadcrumbs and timestamp -->
				<TopBar {data} />

				<!-- Second row: Using tabs for scan content -->
				<ScanTabs {data} />
			</div>
		</div>

		<!-- Sidebar (15-20% width) -->
		<div class="col-span-12 rounded-lg bg-white p-3 sm:p-2 md:col-span-2 dark:bg-gray-800">
			<!-- Row 1: Update current scan -->
			<UpdateScan {data} />

			<!-- Row 2: Timeline of related scans -->
			<ScanTimeLine {data} />
		</div>
	</div>
</div>
