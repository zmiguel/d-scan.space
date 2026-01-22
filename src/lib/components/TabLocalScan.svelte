<script>
	import { Avatar } from 'flowbite-svelte';
	import { secStatusColor } from '$lib/utils/secStatus';
	import { asset } from '$app/paths';
	import { SvelteMap } from 'svelte/reactivity';
	import {
		getHighlightClass,
		getHoverClass,
		getPilotHoverClass,
		normalizeTicker
	} from '$lib/utils/tickerStyles';

	let { data, corps = [], pilots = [] } = $props();

	let selectedItem = $state(null);
	let hoveredItem = $state(null);

	const highlightLookups = $derived(createHighlightLookups(corps, pilots));

	const highlightMaps = $derived.by(() => {
		const focuses = [selectedItem, hoveredItem].filter(Boolean);

		if (focuses.length === 0) {
			return {
				alliances: new SvelteMap(),
				corps: new SvelteMap(),
				pilots: new SvelteMap()
			};
		}

		const alliancesMap = new SvelteMap();
		const corpsMap = new SvelteMap();
		const pilotsMap = new SvelteMap();

		for (const focus of focuses) {
			if (focus.type === 'alliance') {
				addAllianceContext(
					focus.ticker,
					focus.ticker,
					highlightLookups,
					alliancesMap,
					corpsMap,
					pilotsMap
				);
			} else if (focus.type === 'corp') {
				addCorpContext(
					focus.ticker,
					focus.ticker,
					highlightLookups,
					alliancesMap,
					corpsMap,
					pilotsMap
				);
			} else if (focus.type === 'pilot') {
				addPilotContext(focus.id, highlightLookups, alliancesMap, corpsMap, pilotsMap);
			}
		}

		return {
			alliances: alliancesMap,
			corps: corpsMap,
			pilots: pilotsMap
		};
	});

	const highlightedAlliances = $derived(highlightMaps.alliances);
	const highlightedCorps = $derived(highlightMaps.corps);
	const highlightedPilots = $derived(highlightMaps.pilots);

	function toggleAlliance(allianceTicker) {
		const next = { type: 'alliance', ticker: normalizeTicker(allianceTicker) };
		selectedItem = isSameItem(selectedItem, next) ? null : next;
		if (selectedItem) hoveredItem = null;
	}

	function toggleCorporation(corpTicker) {
		const next = { type: 'corp', ticker: corpTicker };
		selectedItem = isSameItem(selectedItem, next) ? null : next;
		if (selectedItem) hoveredItem = null;
	}

	function togglePilot(pilotId) {
		const next = { type: 'pilot', id: pilotId };
		selectedItem = isSameItem(selectedItem, next) ? null : next;
		if (selectedItem) hoveredItem = null;
	}

	function setHover(item) {
		if (isSameItem(selectedItem, item)) {
			hoveredItem = null;
			return;
		}
		hoveredItem = item;
	}

	function clearHover(item) {
		if (isSameItem(hoveredItem, item)) {
			hoveredItem = null;
		}
	}

	function setHoverAlliance(allianceTicker) {
		setHover({ type: 'alliance', ticker: normalizeTicker(allianceTicker) });
	}

	function clearHoverAlliance(allianceTicker) {
		clearHover({ type: 'alliance', ticker: normalizeTicker(allianceTicker) });
	}

	function setHoverCorporation(corpTicker) {
		setHover({ type: 'corp', ticker: corpTicker });
	}

	function clearHoverCorporation(corpTicker) {
		clearHover({ type: 'corp', ticker: corpTicker });
	}

	function setHoverPilot(pilotId) {
		setHover({ type: 'pilot', id: pilotId });
	}

	function clearHoverPilot(pilotId) {
		clearHover({ type: 'pilot', id: pilotId });
	}

	function handleInteractiveKey(event, callback) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			callback();
		}
	}

	function isSameItem(a, b) {
		if (!a || !b) return false;
		if (a.type !== b.type) return false;
		if (a.type === 'pilot') {
			return a.id === b.id;
		}
		return a.ticker === b.ticker;
	}

	function createHighlightLookups(corpsList = [], pilotsList = []) {
		const corpsByTicker = new SvelteMap();
		const corpsByAlliance = new SvelteMap();

		for (const corp of corpsList) {
			if (!corp?.ticker) continue;
			corpsByTicker.set(corp.ticker, corp);
			const allianceKey = normalizeTicker(corp.alliance_ticker);
			if (!corpsByAlliance.has(allianceKey)) {
				corpsByAlliance.set(allianceKey, []);
			}
			corpsByAlliance.get(allianceKey).push(corp);
		}

		const pilotsByCorp = new SvelteMap();
		const pilotsByAlliance = new SvelteMap();
		const pilotById = new SvelteMap();

		for (const pilot of pilotsList) {
			if (!pilot) continue;
			pilotById.set(pilot.id, pilot);

			if (pilot.corporation_ticker) {
				if (!pilotsByCorp.has(pilot.corporation_ticker)) {
					pilotsByCorp.set(pilot.corporation_ticker, []);
				}
				pilotsByCorp.get(pilot.corporation_ticker).push(pilot);
			}

			const allianceKey = normalizeTicker(pilot.alliance_ticker);
			if (!pilotsByAlliance.has(allianceKey)) {
				pilotsByAlliance.set(allianceKey, []);
			}
			pilotsByAlliance.get(allianceKey).push(pilot);
		}

		return {
			corpsByTicker,
			corpsByAlliance,
			pilotsByCorp,
			pilotsByAlliance,
			pilotById
		};
	}

	function addAllianceContext(
		allianceTicker,
		colorKey,
		lookups,
		alliancesMap,
		corpsMap,
		pilotsMap
	) {
		const normalizedTicker = normalizeTicker(allianceTicker);
		alliancesMap.set(normalizedTicker, colorKey);

		const corpsInAlliance = lookups.corpsByAlliance.get(normalizedTicker) ?? [];
		for (const corp of corpsInAlliance) {
			corpsMap.set(corp.ticker, colorKey);
			const corpPilots = lookups.pilotsByCorp.get(corp.ticker) ?? [];
			for (const pilot of corpPilots) {
				pilotsMap.set(pilot.id, colorKey);
			}
		}

		const alliancePilots = lookups.pilotsByAlliance.get(normalizedTicker) ?? [];
		for (const pilot of alliancePilots) {
			pilotsMap.set(pilot.id, colorKey);
			if (pilot.corporation_ticker) {
				corpsMap.set(pilot.corporation_ticker, colorKey);
			}
		}
	}

	function addCorpContext(corpTicker, colorKey, lookups, alliancesMap, corpsMap, pilotsMap) {
		if (!corpTicker) return;
		corpsMap.set(corpTicker, colorKey);

		const corp = lookups.corpsByTicker.get(corpTicker);
		const allianceTicker = normalizeTicker(corp?.alliance_ticker);
		if (allianceTicker) {
			alliancesMap.set(allianceTicker, colorKey);
		}

		const corpPilots = lookups.pilotsByCorp.get(corpTicker) ?? [];
		for (const pilot of corpPilots) {
			pilotsMap.set(pilot.id, colorKey);
		}
	}

	function addPilotContext(pilotId, lookups, alliancesMap, corpsMap, pilotsMap) {
		const pilot = lookups.pilotById.get(pilotId);
		if (!pilot) return;
		const colorKey = pilot.corporation_ticker || 'none';
		pilotsMap.set(pilot.id, colorKey);
		addCorpContext(pilot.corporation_ticker, colorKey, lookups, alliancesMap, corpsMap, pilotsMap);
	}

	function combineClasses(...classes) {
		return classes.filter(Boolean).join(' ');
	}
</script>

<div class="relative grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-2">
	<div class="col-span-1">
		<h1 class="ms-2 text-base font-bold sm:text-xl">Alliances</h1>
		<div class="col-auto mt-2">
			{#each data.local?.alliances ?? [] as alliance (alliance.id)}
				{@const allianceTicker = alliance.ticker || 'none'}
				{@const allianceHighlightTicker = highlightedAlliances.get(allianceTicker)}
				<div
					data-alliance-ticker={allianceTicker}
					class={combineClasses(
						'flex items-center justify-between gap-2 rounded transition-colors',
						getHoverClass(allianceTicker),
						allianceHighlightTicker ? getHighlightClass(allianceHighlightTicker) : ''
					)}
					role="button"
					tabindex="0"
					onclick={() => toggleAlliance(allianceTicker)}
					onkeydown={(event) => handleInteractiveKey(event, () => toggleAlliance(allianceTicker))}
					onmouseenter={() => setHoverAlliance(allianceTicker)}
					onmouseleave={() => clearHoverAlliance(allianceTicker)}
				>
					<div class="flex min-w-0 flex-1 items-center space-x-2 rtl:space-x-reverse">
						{#if alliance.ticker}
							<Avatar
								cornerStyle="rounded"
								src="https://images.evetech.net/alliances/{alliance.id}/logo?size=64"
							/>
						{/if}
						<div class="min-w-0 flex-1 font-medium dark:text-white">
							<div class="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
								{#if alliance.ticker}
									<span class="shrink-0 whitespace-nowrap text-pink-600 dark:text-pink-400">
										[{alliance.ticker}]
									</span>
									<span class="inline-block max-w-[12rem] truncate align-middle sm:max-w-[16rem]">
										{alliance.name}
									</span>
									{#if alliance.id}
										<a
											href={`https://zkillboard.com/alliance/${alliance.id}/`}
											target="_blank"
											rel="noopener"
											class="inline-flex shrink-0 align-middle"
											title="zKillBoard"
											onclick={(event) => event.stopPropagation()}
										>
											<img
												src={asset('/wreck.png')}
												alt="zKillBoard"
												class="h-4 w-4 opacity-80 transition-opacity hover:opacity-100"
											/>
										</a>
									{/if}
								{:else}
									<span class="italic">No Alliance</span>
								{/if}
							</div>
							<div class="text-primary-700 dark:text-primary-400">
								{alliance.corporation_count} Corporations
							</div>
						</div>
					</div>
					<div class="me-2 shrink-0 text-amber-600 dark:text-amber-400">
						{alliance.character_count}
					</div>
				</div>
			{/each}
		</div>
	</div>
	<div
		class="pointer-events-none absolute top-0 bottom-0 hidden w-0.5 bg-gray-600 sm:block"
		style="left: calc(33.333% - 0.15rem);"
		aria-hidden="true"
	></div>
	<div class="col-span-1 sm:hidden">
		<hr class="my-3 border-t-2 border-gray-500 dark:border-gray-500" />
	</div>
	<div class="col-span-1 px-0 sm:px-1">
		<h1 class="ms-2 text-base font-bold sm:text-xl">Corporations</h1>
		<div class="col-auto mt-2">
			{#each corps as corp (corp.id)}
				{@const corpHighlightTicker = highlightedCorps.get(corp.ticker)}
				<div
					id="alliance-{corp.alliance_ticker || 'none'}"
					data-corp-ticker={corp.ticker}
					class={combineClasses(
						'flex items-center justify-between gap-2 rounded transition-colors',
						getHoverClass(corp.ticker),
						corpHighlightTicker ? getHighlightClass(corpHighlightTicker) : ''
					)}
					role="button"
					tabindex="0"
					onclick={() => toggleCorporation(corp.ticker)}
					onkeydown={(event) => handleInteractiveKey(event, () => toggleCorporation(corp.ticker))}
					onmouseenter={() => setHoverCorporation(corp.ticker)}
					onmouseleave={() => clearHoverCorporation(corp.ticker)}
				>
					<div class="flex min-w-0 flex-1 items-center space-x-4 rtl:space-x-reverse">
						<Avatar
							cornerStyle="rounded"
							src="https://images.evetech.net/corporations/{corp.id}/logo?size=64"
						/>
						<div class="min-w-0 flex-1 font-medium dark:text-white">
							<div class="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
								<span class="shrink-0 whitespace-nowrap text-primary-700 dark:text-primary-400"
									>{'<' + corp.ticker + '>'}</span
								>
								<span class="inline-block max-w-[12rem] truncate align-middle sm:max-w-[16rem]">
									{corp.name}
								</span>
								<a
									href={`https://zkillboard.com/corporation/${corp.id}/`}
									target="_blank"
									rel="noopener"
									class="inline-flex shrink-0 align-middle"
									title="zKillBoard"
									onclick={(event) => event.stopPropagation()}
								>
									<img
										src={asset('/wreck.png')}
										alt="zKillBoard"
										class="h-4 w-4 opacity-80 transition-opacity hover:opacity-100"
									/>
								</a>
							</div>
							{#if corp.alliance_ticker}
								<div class="text-pink-600 dark:text-pink-400">
									[{corp.alliance_ticker}]
								</div>
							{/if}
						</div>
					</div>
					<div class="me-2 shrink-0 text-amber-600 dark:text-amber-400">
						{corp.character_count}
					</div>
				</div>
			{/each}
		</div>
	</div>
	<div
		class="pointer-events-none absolute top-0 bottom-0 hidden w-0.5 bg-gray-600 sm:block"
		style="left: calc(66.666%);"
		aria-hidden="true"
	></div>
	<div class="col-span-1 sm:hidden">
		<hr class="my-3 border-t-2 border-gray-500 dark:border-gray-500" />
	</div>
	<div class="col-span-1 pl-0 sm:pl-1">
		<h1 class="ms-2 text-base font-bold sm:text-xl">Pilots</h1>
		<div class="col-auto mt-2">
			{#each pilots as pilot (pilot.id)}
				{@const pilotHighlightTicker = highlightedPilots.get(pilot.id)}
				<div
					id="alliance-{pilot.alliance_ticker || 'none'} corporation-{pilot.corporation_ticker}"
					class={combineClasses(
						'flex items-center justify-between gap-2 rounded transition-colors',
						getPilotHoverClass(pilot.corporation_ticker),
						pilotHighlightTicker ? getHighlightClass(pilotHighlightTicker) : ''
					)}
					role="button"
					tabindex="0"
					onclick={() => togglePilot(pilot.id)}
					onkeydown={(event) => handleInteractiveKey(event, () => togglePilot(pilot.id))}
					onmouseenter={() => setHoverPilot(pilot.id)}
					onmouseleave={() => clearHoverPilot(pilot.id)}
				>
					<div class="flex min-w-0 flex-1 items-center space-x-4 rtl:space-x-reverse">
						<Avatar
							cornerStyle="rounded"
							src="https://images.evetech.net/characters/{pilot.id}/portrait?size=64"
						/>
						<div class="min-w-0 flex-1 font-medium dark:text-white">
							<div class="flex min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
								<span class="inline-block max-w-[12rem] truncate align-middle sm:max-w-[16rem]">
									{pilot.name}
								</span>
								<span
									class="shrink-0 whitespace-nowrap"
									style:color={secStatusColor(pilot.sec_status)}
								>
									{pilot.sec_status.toFixed(3)}
								</span>
								<a
									href={`https://zkillboard.com/character/${pilot.id}/`}
									target="_blank"
									rel="noopener"
									class="inline-flex shrink-0 align-middle"
									title="zKillBoard"
									onclick={(event) => event.stopPropagation()}
								>
									<img
										src={asset('/wreck.png')}
										alt="zKillBoard"
										class="h-4 w-4 opacity-80 transition-opacity hover:opacity-100"
									/>
								</a>
							</div>
							<div>
								{#if pilot.alliance_ticker}
									<span class="text-pink-600 dark:text-pink-400">[{pilot.alliance_ticker}]</span>
								{/if}
								<span class="text-primary-700 dark:text-primary-400"
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
