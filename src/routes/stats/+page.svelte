<script>
	import MetaTags from '$lib/components/MetaTags.svelte';
	import BarChart from '$lib/components/stats/BarChart.svelte';
	import { formatUtcTimestamp } from '$lib/utils/time.js';
	import { securityBadgeColor } from '$lib/utils/secStatus.js';
	import { Badge } from 'flowbite-svelte';

	let { data } = $props();

	const scanStats = $derived(data.scanStats);
	const characterStats = $derived(data.characterStats);
	const corporationStats = $derived(data.corporationStats);
	const allianceStats = $derived(data.allianceStats);
	const activity = $derived(data.activity);
	const highlights = $derived(data.highlights);

	// Helper function to calculate percentage
	function getPercentage(value, total) {
		if (total === 0) return 0;
		return ((value / total) * 100).toFixed(1);
	}

	const recentScans = $derived(
		activity.scansPerDay.reduce((sum, day) => sum + day.local + day.directional, 0)
	);
	const headline = $derived([
		{ label: 'Total scans', value: scanStats.totalScans },
		{ label: `Scans, last ${activity.days} days`, value: recentScans },
		{ label: 'Pilots tracked', value: characterStats.totalCharacters },
		{
			label: `Alliances seen, last ${activity.days} days`,
			value: allianceStats.alliancesLastSeenMonth
		}
	]);
	const shortDay = (entry) => entry.day.slice(5);
	const dayTicks = $derived([0, 7, 14, 21, activity.days - 1]);
	const contentScans = $derived(
		(highlights.averages?.local_scans ?? 0) + (highlights.averages?.directional_scans ?? 0)
	);
	const round = (value) => (value == null ? '–' : Math.round(value).toLocaleString());
</script>

<MetaTags
	title="Stats"
	description="Live statistics for D-Scan Space including scans, characters, corporations, and alliances."
/>

<div class="content-center space-y-6 px-0 pt-4">
	<h1 class="text-xl font-bold text-gray-800 sm:text-2xl dark:text-gray-200">Stats</h1>

	<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
		{#each headline as item (item.label)}
			<div class="rounded-lg bg-white p-4 dark:bg-gray-700">
				<div class="text-2xl font-bold text-gray-900 tabular-nums sm:text-3xl dark:text-white">
					{(item.value ?? 0).toLocaleString()}
				</div>
				<div class="text-sm text-gray-600 dark:text-gray-400">{item.label}</div>
			</div>
		{/each}
	</div>

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
		<BarChart
			title="Scans per day"
			data={activity.scansPerDay}
			series={[
				{ key: 'local', label: 'Local', color: 'bg-sky-500' },
				{ key: 'directional', label: 'D-scan', color: 'bg-amber-500' }
			]}
			label={shortDay}
			ticks={dayTicks}
			empty="No scans in the last {activity.days} days."
		/>
		<BarChart
			title="Pilots in local scans per day"
			data={highlights.pilotsPerDay}
			series={[{ key: 'pilots', label: 'Pilots', color: 'bg-emerald-500' }]}
			label={shortDay}
			ticks={dayTicks}
			empty="No local scans in the last {activity.days} days."
		/>
		<BarChart
			title="Busiest hours (UTC, last {activity.hoursDays} days)"
			data={activity.scansPerHour}
			series={[{ key: 'scans', label: 'Scans', color: 'bg-violet-500' }]}
			label={(entry) => `${String(entry.hour).padStart(2, '0')}:00`}
			ticks={[0, 6, 12, 18, 23]}
			empty="No scans yet."
		/>
	</div>

	<section class="space-y-3">
		<div class="flex flex-wrap items-baseline justify-between gap-2">
			<h2 class="text-lg font-semibold text-gray-800 sm:text-xl dark:text-gray-200">
				Last {activity.days} days
			</h2>
			<span class="text-sm text-gray-600 dark:text-gray-400">
				{contentScans.toLocaleString()} scans · avg local {round(highlights.averages?.avg_pilots)} pilots
				· avg d-scan {round(highlights.averages?.avg_objects)} objects
			</span>
		</div>
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
			{#snippet topList(title, rows, empty, item)}
				<div class="rounded-lg bg-white p-4 text-sm dark:bg-gray-700">
					<h3 class="mb-3 font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
					{#if rows.length === 0}
						<p class="text-gray-500 dark:text-gray-400">{empty}</p>
					{:else}
						<ol class="space-y-2">
							{#each rows as row, i (i)}
								<li class="flex items-center justify-between gap-2">
									<span class="flex min-w-0 items-center gap-2 text-gray-700 dark:text-gray-300"
										>{@render item(row)}</span
									>
									<span class="font-semibold text-gray-800 tabular-nums dark:text-gray-200"
										>{(row.scans ?? row.pilots).toLocaleString()}</span
									>
								</li>
							{/each}
						</ol>
					{/if}
				</div>
			{/snippet}
			{#snippet systemItem(row)}
				<Badge color={securityBadgeColor(row.security)} class="shrink-0"
					>{row.security?.toFixed(2) ?? '?'}</Badge
				>
				<span class="truncate" title="{row.name} · {row.region}">{row.name}</span>
			{/snippet}
			{#snippet nameItem(row)}
				<span class="truncate">{row.name}</span>
			{/snippet}
			{#snippet allianceItem(row)}
				<span class="shrink-0 font-mono text-xs text-gray-500 dark:text-gray-400"
					>&lt;{row.ticker}&gt;</span
				>
				<span class="truncate" title={row.name}>{row.name}</span>
			{/snippet}
			{@render topList(
				'Most scanned systems (public scans)',
				highlights.systems,
				'No public scans with a system yet.',
				systemItem
			)}
			{@render topList(
				'Most scanned regions (public scans)',
				highlights.regions,
				'No public scans with a system yet.',
				nameItem
			)}
			{@render topList(
				'Most seen alliances (public locals)',
				highlights.alliances,
				'No public local scans yet.',
				allianceItem
			)}
			<div class="rounded-lg bg-white p-4 text-sm dark:bg-gray-700">
				<h3 class="mb-3 font-semibold text-gray-800 dark:text-gray-200">Ships on d-scan</h3>
				{#if highlights.ships.total === 0}
					<p class="text-gray-500 dark:text-gray-400">No d-scans yet.</p>
				{:else}
					<div class="mb-3 flex h-3 overflow-hidden rounded" aria-hidden="true">
						{#each highlights.ships.classes as shipClass (shipClass.key)}
							<div class={shipClass.color} style:flex="{shipClass.total} 1 0%"></div>
						{/each}
					</div>
					<ol class="space-y-2">
						{#each [...highlights.ships.classes]
							.sort((a, b) => b.total - a.total)
							.slice(0, 5) as shipClass (shipClass.key)}
							<li class="flex items-center justify-between gap-2">
								<span class="flex items-center gap-2 text-gray-700 dark:text-gray-300"
									><span class={['h-2.5 w-2.5 rounded-sm', shipClass.color]} aria-hidden="true"
									></span>{shipClass.label}</span
								>
								<span class="font-semibold text-gray-800 tabular-nums dark:text-gray-200"
									>{Math.round(shipClass.share * 100)}%</span
								>
							</li>
						{/each}
					</ol>
				{/if}
			</div>
		</div>
	</section>

	<h2
		class="border-t border-gray-300 pt-6 text-lg font-semibold text-gray-800 sm:text-xl dark:border-gray-600 dark:text-gray-200"
	>
		All-time totals
	</h2>

	<div class="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-4">
		<!-- Scans Stats -->
		<div class="rounded-lg bg-white p-4 text-sm sm:p-6 sm:text-base dark:bg-gray-700">
			<h2 class="mb-4 text-lg font-semibold text-gray-800 sm:text-xl dark:text-gray-200">Scans</h2>
			<div class="space-y-3">
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Total Scans:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200"
						>{scanStats.totalScans.toLocaleString()}</span
					>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Total Groups:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200"
						>{scanStats.totalScanGroups.toLocaleString()}</span
					>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Public Scans:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{scanStats.publicScans.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(scanStats.publicScans, scanStats.totalScans)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Public Groups:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{scanStats.publicScanGroups.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(scanStats.publicScanGroups, scanStats.totalScanGroups)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Local Scans:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{scanStats.localScans.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(scanStats.localScans, scanStats.totalScans)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Directional Scans:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{scanStats.directionalScans.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(scanStats.directionalScans, scanStats.totalScans)}%)</span
						>
					</span>
				</div>
			</div>
		</div>

		<!-- Characters Stats -->
		<div class="rounded-lg bg-white p-4 text-sm sm:p-6 sm:text-base dark:bg-gray-700">
			<h2 class="mb-4 text-lg font-semibold text-gray-800 sm:text-xl dark:text-gray-200">
				Characters
			</h2>
			<div class="space-y-3">
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Total:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200"
						>{characterStats.totalCharacters.toLocaleString()}</span
					>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last 24h:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{characterStats.charactersLastSeen24h.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								characterStats.charactersLastSeen24h,
								characterStats.totalCharacters
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last Week:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{characterStats.charactersLastSeenWeek.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								characterStats.charactersLastSeenWeek,
								characterStats.totalCharacters
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last Month:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{characterStats.charactersLastSeenMonth.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								characterStats.charactersLastSeenMonth,
								characterStats.totalCharacters
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last Year:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{characterStats.charactersLastSeenYear.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								characterStats.charactersLastSeenYear,
								characterStats.totalCharacters
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Updated:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{characterStats.charactersUpdated24h.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								characterStats.charactersUpdated24h,
								characterStats.totalCharacters
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">No Alliance:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{characterStats.charactersWithoutAlliance.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								characterStats.charactersWithoutAlliance,
								characterStats.totalCharacters
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Deleted:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{characterStats.charactersDeleted.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								characterStats.charactersDeleted,
								characterStats.totalCharacters
							)}%)</span
						>
					</span>
				</div>
			</div>
		</div>

		<!-- Corporations Stats -->
		<div class="rounded-lg bg-white p-4 text-sm sm:p-6 sm:text-base dark:bg-gray-700">
			<h2 class="mb-4 text-lg font-semibold text-gray-800 sm:text-xl dark:text-gray-200">
				Corporations
			</h2>
			<div class="space-y-3">
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Total:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200"
						>{corporationStats.totalCorporations.toLocaleString()}</span
					>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last 24h:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{corporationStats.corporationsLastSeen24h.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								corporationStats.corporationsLastSeen24h,
								corporationStats.totalCorporations
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last Week:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{corporationStats.corporationsLastSeenWeek.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								corporationStats.corporationsLastSeenWeek,
								corporationStats.totalCorporations
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last Month:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{corporationStats.corporationsLastSeenMonth.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								corporationStats.corporationsLastSeenMonth,
								corporationStats.totalCorporations
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last Year:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{corporationStats.corporationsLastSeenYear.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								corporationStats.corporationsLastSeenYear,
								corporationStats.totalCorporations
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Updated:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{corporationStats.corporationsUpdated24h.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								corporationStats.corporationsUpdated24h,
								corporationStats.totalCorporations
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">No Alliance:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{corporationStats.corporationsWithoutAlliance.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								corporationStats.corporationsWithoutAlliance,
								corporationStats.totalCorporations
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">NPC Corps:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{corporationStats.npcCorporations.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								corporationStats.npcCorporations,
								corporationStats.totalCorporations
							)}%)</span
						>
					</span>
				</div>
			</div>
		</div>

		<!-- Alliances Stats -->
		<div class="rounded-lg bg-white p-4 text-sm sm:p-6 sm:text-base dark:bg-gray-700">
			<h2 class="mb-4 text-lg font-semibold text-gray-800 sm:text-xl dark:text-gray-200">
				Alliances
			</h2>
			<div class="space-y-3">
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Total:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200"
						>{allianceStats.totalAlliances.toLocaleString()}</span
					>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last 24h:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{allianceStats.alliancesLastSeen24h.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								allianceStats.alliancesLastSeen24h,
								allianceStats.totalAlliances
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last Week:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{allianceStats.alliancesLastSeenWeek.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								allianceStats.alliancesLastSeenWeek,
								allianceStats.totalAlliances
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last Month:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{allianceStats.alliancesLastSeenMonth.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								allianceStats.alliancesLastSeenMonth,
								allianceStats.totalAlliances
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Seen Last Year:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{allianceStats.alliancesLastSeenYear.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								allianceStats.alliancesLastSeenYear,
								allianceStats.totalAlliances
							)}%)</span
						>
					</span>
				</div>
				<div class="flex justify-between">
					<span class="text-gray-600 dark:text-gray-400">Updated:</span>
					<span class="font-semibold text-gray-800 dark:text-gray-200">
						{allianceStats.alliancesUpdated24h.toLocaleString()}
						<span class="text-sm text-gray-500 dark:text-gray-400"
							>({getPercentage(
								allianceStats.alliancesUpdated24h,
								allianceStats.totalAlliances
							)}%)</span
						>
					</span>
				</div>
			</div>
		</div>
	</div>

	{#if data.sde}
		<p class="text-xs text-gray-500 dark:text-gray-400">
			Static data: SDE build {data.sde.version}, released {formatUtcTimestamp(
				data.sde.releasedAt
			).slice(0, 10)}.
		</p>
	{/if}
</div>
