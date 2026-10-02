<script>
	import TopBar from '$lib/components/TopBar.svelte';
	import UpdateScan from '$lib/components/UpdateScan.svelte';
	import ScanTimeLine from '$lib/components/ScanTimeLine.svelte';
	import ScanTabs from '$lib/components/ScanTabs.svelte';
	import MetaTags from '$lib/components/MetaTags.svelte';
	import { Toast } from 'flowbite-svelte';
	import { browser } from '$app/environment';
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
	 * @property {{ id: string, scan_type: 'local' | 'directional', created_at: string } | null} [pairedScan]
	 */

	/** @type {{ data: Data }} */
	let { data } = $props();
	const copiedFlagKey = 'scan-link-copied';

	const formatCount = (value) => (typeof value === 'number' && !Number.isNaN(value) ? value : null);

	const scanTitle = $derived.by(() => {
		const systemValue = data?.system;
		const systemName =
			typeof systemValue === 'string'
				? systemValue
				: typeof systemValue?.name === 'string'
					? systemValue.name
					: null;
		const region = typeof systemValue?.region === 'string' ? systemValue.region : null;
		const security =
			typeof systemValue?.security === 'number' ? systemValue.security.toFixed(2) : null;
		const timestamp = data?.created_at
			? new Date(data.created_at)
					.toISOString()
					.replace('T', ' ')
					.replace(/\.\d+Z$/, '')
			: '';
		const timeLabel = timestamp ? ` @ ${timestamp}` : '';
		if (systemName || region) {
			const securityLabel = security ?? '?';
			const systemLabel = systemName ?? 'Unknown System';
			const regionLabel = region ?? 'Unknown Region';
			return `[${securityLabel}] ${systemLabel} > ${regionLabel}${timeLabel}`;
		}
		return `Unknown System${timeLabel}`;
	});

	const scanSummary = $derived.by(() => {
		const parts = [];

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

	/** @type {{ message: string, ok: boolean } | null} */
	let toast = $state(null);
	let hideToastTimeout;

	function showToast(message, ok) {
		toast = { message, ok };
		clearTimeout(hideToastTimeout);
		hideToastTimeout = setTimeout(() => (toast = null), ok ? 3000 : 6000);
	}

	function handleLinkCopied(copied) {
		if (copied) showToast('Scan link copied to clipboard.', true);
		else showToast('Could not copy the link. Copy it from the address bar instead.', false);
	}

	// Set by the submit forms only when the new scan's link was really copied.
	$effect(() => {
		if (!browser) {
			return;
		}

		if (sessionStorage.getItem(copiedFlagKey) !== '1') {
			return;
		}
		sessionStorage.removeItem(copiedFlagKey);
		showToast('Scan link copied to clipboard.', true);
	});

	$effect(() => () => clearTimeout(hideToastTimeout));
</script>

<MetaTags
	title={scanTitle}
	description={scanSummary}
	showImage={false}
	appendSiteName={false}
	noIndex={!data.isPublic}
/>

<div class="container mx-auto px-0">
	{#if toast}
		<Toast
			color={toast.ok ? 'green' : 'red'}
			dismissable={false}
			position="top-right"
			class={`z-50 text-sm font-medium !text-white shadow-lg ${toast.ok ? '!border-green-700 !bg-green-600' : '!border-red-700 !bg-red-600'}`}
			classes={{ content: '!text-white', close: '!text-white' }}
		>
			<span role="status">{toast.message}</span>
		</Toast>
	{/if}

	<div class="grid grid-cols-12 gap-4">
		<!-- Main content area (80-85% width) -->
		<div class="col-span-12 rounded-lg bg-white p-3 sm:p-2 md:col-span-10 dark:bg-gray-800">
			<div class="min-h-[600px]">
				<!-- First row: Breadcrumbs, timestamp, copy link -->
				<TopBar {data} onLinkCopied={handleLinkCopied} />

				<!-- Second row: Using tabs for scan content -->
				<ScanTabs {data} />
			</div>
		</div>

		<!-- Sidebar (15-20% width) -->
		<div class="col-span-12 rounded-lg bg-white p-3 sm:p-2 md:col-span-2 dark:bg-gray-800">
			<!-- Row 1: Update current scan -->
			{#if data.canUpdateScan}
				<UpdateScan {data} />
			{/if}

			<!-- Row 2: Timeline of related scans -->
			<ScanTimeLine {data} />
		</div>
	</div>
</div>
