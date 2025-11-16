<script>
	import { Avatar } from 'flowbite-svelte';
	import { secStatusColor } from '$lib/utils/secStatus';
	import { asset } from '$app/paths';

	let { data, corps, pilots } = $props();

	// State for single selection
	let selectedItem = $state(null); // { type: 'alliance'|'corp'|'pilot', ticker: string, name?: string }

	// Cache for DOM elements to improve performance
	let elementCache = $state(new Map());
	let styleCache = $state(new Set()); // Track which styles we've already added

	// Clear element cache when data changes
	$effect(() => {
		elementCache.clear();
		styleCache.clear();
	});

	// Get cached DOM elements or query and cache them
	function getCachedElements(selector) {
		if (!elementCache.has(selector)) {
			elementCache.set(selector, Array.from(document.querySelectorAll(selector)));
		}
		return elementCache.get(selector);
	}

	// Batch DOM operations for better performance
	function batchDOMOperations(operations) {
		requestAnimationFrame(() => {
			operations.forEach((op) => op());
		});
	}

	// Generate a unique color based on ticker
	function getTickerColor(ticker) {
		if (!ticker || ticker === 'none') {
			return {
				lightColor: '#e5e7eb', // gray-200
				darkColor: '#4b5563', // gray-600
				customClass: 'ticker-none'
			};
		}

		// Simple hash function
		let hash = 0;
		for (let i = 0; i < ticker.length; i++) {
			hash = ((hash << 5) - hash + ticker.charCodeAt(i)) & 0xffffffff;
		}

		// Convert to positive and get hue (0-360)
		const hue = Math.abs(hash) % 360;

		// Use HSL with fixed saturation and lightness for consistency
		const lightColor = `hsl(${hue}, 70%, 85%)`;
		const darkColor = `hsl(${hue}, 60%, 25%)`;

		return {
			lightColor,
			darkColor,
			customClass: `ticker-${ticker.replace(/[^a-zA-Z0-9]/g, '')}`
		};
	}

	// Add CSS dynamically - optimized with caching
	function addTickerStyles(ticker, colors) {
		const className = colors.customClass;

		// Skip if we've already added this style
		if (styleCache.has(className)) return;

		const styleId = `style-${className}`;
		if (!document.getElementById(styleId)) {
			const style = document.createElement('style');
			style.id = styleId;
			style.textContent = `
				.${className} { background-color: ${colors.lightColor} !important; }
				.dark .${className} { background-color: ${colors.darkColor} !important; }
				.hover-${className}:hover { background-color: ${colors.lightColor} !important; }
				.dark .hover-${className}:hover { background-color: ${colors.darkColor} !important; }
			`;
			document.head.appendChild(style);
			styleCache.add(className);
		}
	}

	// Clear all highlights - optimized version
	function clearAllHighlights() {
		// Clear cache since we're about to modify classes
		elementCache.clear();

		// Get all elements that might have highlight classes
		const elements = document.querySelectorAll(
			'[data-alliance-ticker], [data-corp-ticker], [id*="alliance-"], [id*="corporation-"]'
		);

		// Get all possible ticker classes to remove
		const allTickers = [
			...(data.local?.alliances?.map((a) => a.ticker).filter(Boolean) || []),
			...corps.map((c) => c.ticker).filter(Boolean),
			'none'
		];

		// Create array of all class names to remove
		const classesToRemove = allTickers.map((ticker) => getTickerColor(ticker).customClass);

		// Batch remove all classes from all elements
		elements.forEach((el) => {
			el.classList.remove(...classesToRemove);
		});
	}

	// Apply highlights based on selection - optimized version
	function applyHighlights(type, ticker, pilotName = null) {
		const colors = getTickerColor(ticker);
		addTickerStyles(ticker, colors);

		// Use requestAnimationFrame to batch DOM operations
		requestAnimationFrame(() => {
			if (type === 'alliance') {
				// Highlight alliance itself
				getCachedElements(`[data-alliance-ticker="${ticker}"]`).forEach((el) => {
					el.classList.add(colors.customClass);
				});
				// Highlight all corps and pilots in this alliance
				getCachedElements(`[id*="alliance-${ticker}"]`).forEach((el) => {
					el.classList.add(colors.customClass);
				});
			} else if (type === 'corp') {
				// Find the corp to get its alliance
				const corp = corps.find((c) => c.ticker === ticker);
				const allianceTicker = corp?.alliance_ticker || 'none';

				// Highlight corp itself
				getCachedElements(`[data-corp-ticker="${ticker}"]`).forEach((el) => {
					el.classList.add(colors.customClass);
				});
				// Highlight all pilots in this corp
				getCachedElements(`[id*="corporation-${ticker}"]`).forEach((el) => {
					el.classList.add(colors.customClass);
				});
				// Always highlight the parent alliance (including "No Alliance")
				getCachedElements(`[data-alliance-ticker="${allianceTicker}"]`).forEach((el) => {
					el.classList.add(colors.customClass);
				});
			} else if (type === 'pilot') {
				// Find the pilot to get corp and alliance info
				const pilot = pilots.find((p) => p.name === pilotName);
				const corpTicker = pilot?.corporation_ticker;
				const allianceTicker = pilot?.alliance_ticker;

				// Highlight the pilot itself
				getCachedElements(`[id*="corporation-${corpTicker}"]`).forEach((el) => {
					if (el.textContent.includes(pilotName)) {
						el.classList.add(colors.customClass);
					}
				});
				// Highlight parent corp
				if (corpTicker) {
					getCachedElements(`[data-corp-ticker="${corpTicker}"]`).forEach((el) => {
						el.classList.add(colors.customClass);
					});
				}
				// Always highlight parent alliance (including "No Alliance")
				const finalAllianceTicker = allianceTicker || 'none';
				getCachedElements(`[data-alliance-ticker="${finalAllianceTicker}"]`).forEach((el) => {
					el.classList.add(colors.customClass);
				});
			}
		});
	}

	// Click handlers
	function clickAlliance(allianceTicker) {
		// If clicking the same item, deselect it
		if (selectedItem?.type === 'alliance' && selectedItem?.ticker === allianceTicker) {
			clearAllHighlights();
			selectedItem = null;
		} else {
			// Clear previous selection and apply new one
			clearAllHighlights();
			selectedItem = { type: 'alliance', ticker: allianceTicker };
			applyHighlights('alliance', allianceTicker);
		}
	}

	function clickCorporation(corpTicker) {
		// If clicking the same item, deselect it
		if (selectedItem?.type === 'corp' && selectedItem?.ticker === corpTicker) {
			clearAllHighlights();
			selectedItem = null;
		} else {
			// Clear previous selection and apply new one
			clearAllHighlights();
			selectedItem = { type: 'corp', ticker: corpTicker };
			applyHighlights('corp', corpTicker);
		}
	}

	function clickPilot(pilotName, corpTicker) {
		// If clicking the same item, deselect it
		if (selectedItem?.type === 'pilot' && selectedItem?.name === pilotName) {
			clearAllHighlights();
			selectedItem = null;
		} else {
			// Clear previous selection and apply new one
			clearAllHighlights();
			selectedItem = { type: 'pilot', ticker: corpTicker, name: pilotName };
			applyHighlights('pilot', corpTicker, pilotName);
		}
	}

	// Hover handlers (temporary highlighting)
	function highlightAlliance(allianceTicker) {
		// Don't add hover highlight if this alliance is selected
		if (selectedItem?.type === 'alliance' && selectedItem?.ticker === allianceTicker) return;

		// Don't add if there's a selected corp from this alliance
		if (selectedItem?.type === 'corp') {
			const selectedCorp = corps.find((c) => c.ticker === selectedItem.ticker);
			if (selectedCorp?.alliance_ticker === allianceTicker) return;
		}

		// Don't add if there's a selected pilot from this alliance
		if (selectedItem?.type === 'pilot') {
			const selectedPilot = pilots.find((p) => p.name === selectedItem.name);
			if (selectedPilot?.alliance_ticker === allianceTicker) return;
		}

		const colors = getTickerColor(allianceTicker);
		addTickerStyles(allianceTicker, colors);

		// Use cached elements for better performance
		requestAnimationFrame(() => {
			// Highlight corporations and pilots in this alliance
			getCachedElements(`[id*="alliance-${allianceTicker}"]`).forEach((el) => {
				el.classList.add(colors.customClass);
			});

			// Also highlight the alliance itself
			getCachedElements(`[data-alliance-ticker="${allianceTicker}"]`).forEach((el) => {
				el.classList.add(colors.customClass);
			});
		});
	}

	function unhighlightAlliance(allianceTicker) {
		// Don't remove hover highlight if this alliance is selected
		if (selectedItem?.type === 'alliance' && selectedItem?.ticker === allianceTicker) return;

		// Don't remove if there's a selected corp from this alliance
		if (selectedItem?.type === 'corp') {
			const selectedCorp = corps.find((c) => c.ticker === selectedItem.ticker);
			if (selectedCorp?.alliance_ticker === allianceTicker) return;
		}

		// Don't remove if there's a selected pilot from this alliance
		if (selectedItem?.type === 'pilot') {
			const selectedPilot = pilots.find((p) => p.name === selectedItem.name);
			if (selectedPilot?.alliance_ticker === allianceTicker) return;
		}

		const colors = getTickerColor(allianceTicker);

		requestAnimationFrame(() => {
			// Remove highlight from corporations and pilots
			getCachedElements(`[id*="alliance-${allianceTicker}"]`).forEach((el) => {
				el.classList.remove(colors.customClass);
			});
			// Remove highlight from the alliance itself
			getCachedElements(`[data-alliance-ticker="${allianceTicker}"]`).forEach((el) => {
				el.classList.remove(colors.customClass);
			});
		});
	}

	function highlightCorporation(corpTicker, allianceTicker) {
		// Don't add hover highlight if this corp is selected
		if (selectedItem?.type === 'corp' && selectedItem?.ticker === corpTicker) return;

		// Don't add if this corp's alliance is selected
		if (selectedItem?.type === 'alliance' && selectedItem?.ticker === allianceTicker) return;

		// Don't add if there's a selected pilot from this corp
		if (selectedItem?.type === 'pilot') {
			const selectedPilot = pilots.find((p) => p.name === selectedItem.name);
			if (selectedPilot?.corporation_ticker === corpTicker) return;
		}

		const colors = getTickerColor(corpTicker);
		addTickerStyles(corpTicker, colors);
		const finalAllianceTicker = allianceTicker || 'none';

		// Batch DOM operations for better performance
		batchDOMOperations([
			() => {
				// Highlight pilots in this corporation
				getCachedElements(`[id*="corporation-${corpTicker}"]`).forEach((el) => {
					el.classList.add(colors.customClass);
				});
			},
			() => {
				// Highlight the parent alliance (including "No Alliance")
				getCachedElements(`[data-alliance-ticker="${finalAllianceTicker}"]`).forEach((el) => {
					el.classList.add(colors.customClass);
				});
			}
		]);
	}

	function unhighlightCorporation(corpTicker, allianceTicker) {
		// Don't remove hover highlight if this corp is selected
		if (selectedItem?.type === 'corp' && selectedItem?.ticker === corpTicker) return;

		// Don't remove if this corp's alliance is selected
		if (selectedItem?.type === 'alliance' && selectedItem?.ticker === allianceTicker) return;

		// Don't remove if there's a selected pilot from this corp
		if (selectedItem?.type === 'pilot') {
			const selectedPilot = pilots.find((p) => p.name === selectedItem.name);
			if (selectedPilot?.corporation_ticker === corpTicker) return;
		}

		const colors = getTickerColor(corpTicker);
		const finalAllianceTicker = allianceTicker || 'none';

		// Batch DOM operations for better performance
		batchDOMOperations([
			() => {
				// Remove highlight from pilots
				getCachedElements(`[id*="corporation-${corpTicker}"]`).forEach((el) => {
					el.classList.remove(colors.customClass);
				});
			},
			() => {
				// Remove highlight from the corporation itself
				getCachedElements(`[data-corp-ticker="${corpTicker}"]`).forEach((el) => {
					el.classList.remove(colors.customClass);
				});
			},
			() => {
				// Remove highlight from parent alliance (including "No Alliance")
				getCachedElements(`[data-alliance-ticker="${finalAllianceTicker}"]`).forEach((el) => {
					el.classList.remove(colors.customClass);
				});
			}
		]);
	}

	function highlightPilot(pilotName, corpTicker, allianceTicker) {
		// Don't add hover highlight if this item is selected
		if (selectedItem?.type === 'pilot' && selectedItem?.name === pilotName) return;

		// Don't add if this pilot's corp is selected
		if (selectedItem?.type === 'corp' && selectedItem?.ticker === corpTicker) return;

		// Don't add if this pilot's alliance is selected
		if (selectedItem?.type === 'alliance' && selectedItem?.ticker === allianceTicker) return;

		const colors = getTickerColor(corpTicker);
		addTickerStyles(corpTicker, colors);
		const finalAllianceTicker = allianceTicker || 'none';

		// Batch DOM operations for better performance
		batchDOMOperations([
			() => {
				// Highlight the corporation
				getCachedElements(`[data-corp-ticker="${corpTicker}"]`).forEach((el) => {
					el.classList.add(colors.customClass);
				});
			},
			() => {
				// Highlight the parent alliance (including "No Alliance")
				getCachedElements(`[data-alliance-ticker="${finalAllianceTicker}"]`).forEach((el) => {
					el.classList.add(colors.customClass);
				});
			}
		]);
	}

	function unhighlightPilot(pilotName, corpTicker, allianceTicker) {
		// Don't remove hover highlight if this item is selected
		if (selectedItem?.type === 'pilot' && selectedItem?.name === pilotName) return;

		// Don't remove if this pilot's corp is selected
		if (selectedItem?.type === 'corp' && selectedItem?.ticker === corpTicker) return;

		// Don't remove if this pilot's alliance is selected
		if (selectedItem?.type === 'alliance' && selectedItem?.ticker === allianceTicker) return;

		// Don't remove if there's a selected pilot from the same corp (preserve corp/alliance highlights)
		if (selectedItem?.type === 'pilot') {
			const selectedPilot = pilots.find((p) => p.name === selectedItem.name);
			if (selectedPilot?.corporation_ticker === corpTicker) return;
		}

		const colors = getTickerColor(corpTicker);
		const finalAllianceTicker = allianceTicker || 'none';

		// Batch DOM operations for better performance
		batchDOMOperations([
			() => {
				// Remove highlight from corporation
				getCachedElements(`[data-corp-ticker="${corpTicker}"]`).forEach((el) => {
					el.classList.remove(colors.customClass);
				});
			},
			() => {
				// Remove highlight from alliance (including "No Alliance")
				getCachedElements(`[data-alliance-ticker="${finalAllianceTicker}"]`).forEach((el) => {
					el.classList.remove(colors.customClass);
				});
			}
		]);
	}

	// Helper function to get hover class for elements
	function getHoverClass(ticker) {
		const colors = getTickerColor(ticker);
		addTickerStyles(ticker, colors);
		return `hover-${colors.customClass}`;
	}

	// Helper function to get hover class for pilots (uses corp color)
	function getPilotHoverClass(corpTicker) {
		const colors = getTickerColor(corpTicker);
		addTickerStyles(corpTicker, colors);
		return `hover-${colors.customClass}`;
	}
</script>

<div class=" grid grid-cols-3 gap-2">
	<div class="col-span-1 border-e-2 border-gray-600">
		<h1 class="ms-2 text-xl font-bold">Alliances</h1>
		<div class="col-auto mt-2">
			{#each data.local?.alliances ?? [] as alliance (alliance.id)}
				{@const allianceTicker = alliance.ticker || 'none'}
				<div
					data-alliance-ticker={allianceTicker}
					class="flex flex-col items-start justify-between rounded transition-colors sm:flex-row sm:items-center {getHoverClass(
						allianceTicker
					)}"
					role="button"
					tabindex="0"
					onclick={() => clickAlliance(allianceTicker)}
					onkeydown={(e) =>
						e.key === 'Enter' || e.key === ' ' ? clickAlliance(allianceTicker) : null}
					onmouseenter={() => highlightAlliance(allianceTicker)}
					onmouseleave={() => unhighlightAlliance(allianceTicker)}
				>
					<div class="mt-1 flex items-center space-x-2 rtl:space-x-reverse">
						{#if alliance.ticker}
							<Avatar
								cornerStyle="rounded"
								src="https://images.evetech.net/alliances/{alliance.id}/logo?size=64"
							/>
						{/if}
						<div class="font-medium dark:text-white">
							<div>
								{#if alliance.ticker}
									<span class="text-pink-600 dark:text-pink-400">[{alliance.ticker}]</span>
									{alliance.name}
									{#if alliance.id}
										<a
											href={`https://zkillboard.com/alliance/${alliance.id}/`}
											target="_blank"
											rel="noopener"
											class="ms-1 inline-flex flex-shrink-0 align-middle"
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
					<div class="me-3 text-amber-600 dark:text-amber-400">
						{alliance.character_count}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="col-span-1 border-e-2 border-gray-600">
		<h1 class="ms-2 text-xl font-bold">Corporations</h1>
		<div class="col-auto mt-2">
			{#each corps as corp (corp.id)}
				<div
					id="alliance-{corp.alliance_ticker || 'none'}"
					data-corp-ticker={corp.ticker}
					class="flex flex-col items-start justify-between rounded transition-colors sm:flex-row sm:items-center {getHoverClass(
						corp.ticker
					)}"
					role="button"
					tabindex="0"
					onclick={() => clickCorporation(corp.ticker)}
					onkeydown={(e) =>
						e.key === 'Enter' || e.key === ' ' ? clickCorporation(corp.ticker) : null}
					onmouseenter={() => highlightCorporation(corp.ticker, corp.alliance_ticker)}
					onmouseleave={() => unhighlightCorporation(corp.ticker, corp.alliance_ticker)}
				>
					<div class="mt-1 flex items-center space-x-4 rtl:space-x-reverse">
						<Avatar
							cornerStyle="rounded"
							src="https://images.evetech.net/corporations/{corp.id}/logo?size=64"
						/>
						<div class="font-medium dark:text-white">
							<div>
								<span class="text-primary-700 dark:text-primary-400">{'<' + corp.ticker + '>'}</span
								>
								{corp.name}
								<a
									href={`https://zkillboard.com/corporation/${corp.id}/`}
									target="_blank"
									rel="noopener"
									class="ms-1 inline-flex flex-shrink-0 align-middle"
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
					<div class="me-2 text-amber-600 dark:text-amber-400">
						{corp.character_count}
					</div>
				</div>
			{/each}
		</div>
	</div>

	<div class="col-span-1">
		<h1 class="ms-2 text-xl font-bold">Pilots</h1>
		<div class="col-auto mt-2">
			{#each pilots as pilot (pilot.id)}
				<div
					id="alliance-{pilot.alliance_ticker || 'none'} corporation-{pilot.corporation_ticker}"
					class="flex flex-col items-start justify-between rounded transition-colors sm:flex-row sm:items-center {getPilotHoverClass(
						pilot.corporation_ticker
					)}"
					role="button"
					tabindex="0"
					onclick={() => clickPilot(pilot.name, pilot.corporation_ticker)}
					onkeydown={(e) =>
						e.key === 'Enter' || e.key === ' '
							? clickPilot(pilot.name, pilot.corporation_ticker)
							: null}
					onmouseenter={() =>
						highlightPilot(pilot.name, pilot.corporation_ticker, pilot.alliance_ticker)}
					onmouseleave={() =>
						unhighlightPilot(pilot.name, pilot.corporation_ticker, pilot.alliance_ticker)}
				>
					<div class="mt-1 flex items-center space-x-4 rtl:space-x-reverse">
						<Avatar
							cornerStyle="rounded"
							src="https://images.evetech.net/characters/{pilot.id}/portrait?size=64"
						/>
						<div class="font-medium dark:text-white">
							<div>
								{pilot.name}
								<span style:color={secStatusColor(pilot.sec_status)}
									>{pilot.sec_status.toFixed(3)}</span
								>
								<a
									href={`https://zkillboard.com/character/${pilot.id}/`}
									target="_blank"
									rel="noopener"
									class="ms-1 inline-flex flex-shrink-0 align-middle"
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
