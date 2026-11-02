<script>
	import { Breadcrumb, BreadcrumbItem, Badge } from 'flowbite-svelte';
	import {
		ChevronLeftOutline,
		CloseOutline,
		EditOutline,
		LinkOutline
	} from 'flowbite-svelte-icons';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { securityBadgeColor as badgeColorFor } from '$lib/utils/secStatus.js';
	import { copyText, scanGroupUrl } from '$lib/utils/clipboard.js';
	import CompareDialog from '$lib/components/compare/CompareDialog.svelte';

	/** @type {{ data: any, onLinkCopied?: (copied: boolean) => void }} */
	let { data, onLinkCopied } = $props();
	let isEditingSystem = $state(false);
	let systemQuery = $state('');
	let systemSuggestions = $state([]);
	let searchError = $state('');
	let saveError = $state('');
	let isSearching = $state(false);
	let isSaving = $state(false);
	// Suggestion list of the system search: a custom combobox, because Firefox shows no
	// <datalist> popup on autocomplete="off" inputs and does not refresh an open popup
	// when the options arrive asynchronously.
	let listOpen = $state(false);
	let activeIndex = $state(-1);
	const showSuggestions = $derived(listOpen && systemSuggestions.length > 0);
	let searchDebounceHandle;
	/** @type {AbortController | null} */
	let searchController = null;

	const systemSecurity = $derived(
		data.system && typeof data.system.security === 'number' ? data.system.security : null
	);

	// Colour follows the in-game rounded security; the label keeps the SDE value.
	const securityBadgeColor = $derived(badgeColorFor(systemSecurity));

	async function copyLink() {
		onLinkCopied?.(await copyText(scanGroupUrl(page.url.pathname, page.url.origin)));
	}

	const systemName = $derived(data.system?.name ?? 'Unknown System');
	const constellation = $derived(data.system?.constellation ?? 'Unknown Constellation');
	const region = $derived(data.system?.region ?? 'Unknown Region');
	const canEditSystem = $derived(Boolean(data?.canEditSystem));

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

	async function fetchSystemSuggestions(query) {
		if (!browser) {
			return;
		}

		// Only the latest query's answer may update the suggestions.
		searchController?.abort();
		searchController = null;

		const trimmed = query.trim();
		if (trimmed.length < 2) {
			systemSuggestions = [];
			searchError = '';
			isSearching = false;
			return;
		}

		const controller = new AbortController();
		searchController = controller;
		isSearching = true;
		searchError = '';
		try {
			const response = await fetch(
				`/api/systems/search?q=${encodeURIComponent(trimmed)}&limit=10`,
				{ signal: controller.signal }
			);
			if (!response.ok) {
				throw new Error('Search failed');
			}

			const payload = await response.json();
			systemSuggestions = payload?.systems ?? [];
			activeIndex = -1;
			listOpen = true;
		} catch {
			if (controller.signal.aborted) return;
			systemSuggestions = [];
			searchError = 'Could not load system suggestions.';
		} finally {
			if (searchController === controller) {
				searchController = null;
				isSearching = false;
			}
		}
	}

	function handleSystemInput(event) {
		systemQuery = event.currentTarget.value;
		saveError = '';
		if (searchDebounceHandle) {
			clearTimeout(searchDebounceHandle);
		}
		searchDebounceHandle = setTimeout(() => {
			fetchSystemSuggestions(systemQuery);
		}, 150);
	}

	function pickSystem(suggestion) {
		clearTimeout(searchDebounceHandle);
		searchController?.abort();
		searchController = null;
		isSearching = false;
		systemQuery = suggestion.name;
		systemSuggestions = [];
		activeIndex = -1;
		listOpen = false;
	}

	function handleSystemKeydown(event) {
		if (event.key === 'Escape' && showSuggestions) {
			event.preventDefault();
			listOpen = false;
			return;
		}
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			if (systemSuggestions.length === 0) return;
			event.preventDefault();
			listOpen = true;
			const step = event.key === 'ArrowDown' ? 1 : -1;
			activeIndex = (activeIndex + step + systemSuggestions.length) % systemSuggestions.length;
			return;
		}
		// Enter on a highlighted suggestion picks it instead of submitting the form.
		if (event.key === 'Enter' && showSuggestions && activeIndex >= 0) {
			event.preventDefault();
			pickSystem(systemSuggestions[activeIndex]);
		}
	}

	function toggleSystemEditor() {
		isEditingSystem = !isEditingSystem;
		if (!isEditingSystem) {
			clearTimeout(searchDebounceHandle);
			searchController?.abort();
			searchController = null;
			isSearching = false;
			systemQuery = '';
			systemSuggestions = [];
			listOpen = false;
			activeIndex = -1;
			searchError = '';
			saveError = '';
		}
	}

	function handleSetSystemSubmit() {
		isSaving = true;
		saveError = '';

		return async ({ result, update }) => {
			isSaving = false;
			if (result?.type === 'failure') {
				saveError = result?.data?.message ?? 'Failed to set system.';
				return;
			}

			if (result?.type === 'error') {
				saveError = 'Unexpected error while saving system.';
				return;
			}

			await update();
			isEditingSystem = false;
			systemQuery = '';
			systemSuggestions = [];
		};
	}
</script>

<div
	class="mb-4 flex flex-col items-start justify-between gap-2 border-b-2 pb-2 sm:flex-row sm:items-center dark:border-gray-600"
>
	<div class="flex items-center gap-2 sm:mb-0">
		<Breadcrumb
			aria-label="System location"
			class="mb-0 flex flex-wrap gap-1 bg-transparent p-0 text-xs sm:text-sm"
		>
			{#if data.system}
				<BreadcrumbItem class="ms-0 me-0 break-words md:ms-0 md:me-0">
					{#snippet icon()}
						<Badge color={securityBadgeColor}>
							{systemSecurity !== null ? systemSecurity.toFixed(2) : '?'}
						</Badge>
					{/snippet}
					{systemName}
				</BreadcrumbItem>
				<BreadcrumbItem class="me-0 break-words md:me-0">
					{#snippet icon()}
						<ChevronLeftOutline class="h-5 w-5 dark:text-gray-200" />
					{/snippet}
					{constellation}
				</BreadcrumbItem>
				<BreadcrumbItem class="me-0 break-words md:me-0">
					{#snippet icon()}
						<ChevronLeftOutline class="h-5 w-5 dark:text-gray-200" />
					{/snippet}
					<span class="align-text-top">{region}</span>
				</BreadcrumbItem>
			{:else if canEditSystem && isEditingSystem}
				<BreadcrumbItem class="ms-0 me-0 break-words md:ms-0 md:me-0">
					{#snippet icon()}
						<Badge color="purple">?</Badge>
					{/snippet}
					<form
						method="POST"
						action="?/setSystem"
						use:enhance={handleSetSystemSubmit}
						class="flex items-center gap-2"
					>
						<label for="manual-system" class="sr-only">System name</label>
						<div class="relative">
							<input
								id="manual-system"
								type="text"
								name="system_name"
								value={systemQuery}
								oninput={handleSystemInput}
								onkeydown={handleSystemKeydown}
								onfocus={() => (listOpen = true)}
								onblur={() => (listOpen = false)}
								role="combobox"
								aria-autocomplete="list"
								aria-expanded={showSuggestions}
								aria-controls="manual-system-listbox"
								aria-activedescendant={showSuggestions && activeIndex >= 0
									? `manual-system-option-${activeIndex}`
									: undefined}
								autocomplete="off"
								placeholder="System name"
								aria-describedby="manual-system-status"
								required
								class="w-56 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
							/>
							{#if showSuggestions}
								<ul
									id="manual-system-listbox"
									role="listbox"
									aria-label="Matching systems"
									class="absolute top-full left-0 z-30 mt-1 max-h-64 w-72 overflow-y-auto rounded border border-gray-300 bg-white py-1 text-xs shadow-lg dark:border-gray-600 dark:bg-gray-800"
								>
									{#each systemSuggestions as suggestion, index (suggestion.id)}
										<!-- mousedown (not click) so the input keeps focus and the list stays open -->
										<li
											id="manual-system-option-{index}"
											role="option"
											tabindex="-1"
											aria-selected={index === activeIndex}
											class={[
												'flex cursor-pointer items-baseline justify-between gap-2 px-2 py-1',
												index === activeIndex
													? 'bg-primary-100 dark:bg-gray-600'
													: 'hover:bg-gray-100 dark:hover:bg-gray-700'
											]}
											onmousedown={(event) => {
												event.preventDefault();
												pickSystem(suggestion);
											}}
											onmouseenter={() => (activeIndex = index)}
										>
											<span class="flex min-w-0 items-center gap-1.5">
												<Badge
													color={badgeColorFor(Number(suggestion.secStatus))}
													class="shrink-0 px-1.5 py-0 text-[10px]"
													>{Number.isFinite(Number(suggestion.secStatus))
														? Number(suggestion.secStatus).toFixed(2)
														: '?'}</Badge
												>
												<span class="font-medium text-gray-900 dark:text-white"
													>{suggestion.name}</span
												>
											</span>
											<span class="truncate text-gray-500 dark:text-gray-400"
												>{suggestion.constellation} · {suggestion.region}</span
											>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
						<button
							type="submit"
							disabled={isSaving}
							class="rounded bg-primary-600 px-2 py-1 text-xs text-white disabled:opacity-60"
						>
							{isSaving ? 'Saving...' : 'Set'}
						</button>
					</form>
				</BreadcrumbItem>
			{:else}
				<BreadcrumbItem class="ms-0 me-0 break-words md:ms-0 md:me-0">
					{#snippet icon()}
						<Badge color="purple">?</Badge>
					{/snippet}
					<span class="italic">Unknown System</span>
				</BreadcrumbItem>
			{/if}
		</Breadcrumb>
		{#if !data.system && canEditSystem}
			<button
				type="button"
				onclick={toggleSystemEditor}
				class={`rounded border p-1 dark:hover:bg-gray-700 ${isEditingSystem ? 'border-red-500 text-red-600 hover:bg-red-50' : 'border-primary-500 text-primary-600 hover:bg-primary-50'}`}
				aria-label={isEditingSystem ? 'Cancel editing system' : 'Edit system'}
				title={isEditingSystem ? 'Cancel' : 'Edit'}
			>
				{#if isEditingSystem}
					<CloseOutline class="h-4 w-4" />
				{:else}
					<EditOutline class="h-4 w-4" />
				{/if}
			</button>
		{/if}
	</div>
	<div class="flex items-center gap-2 text-xs text-gray-600 sm:text-sm dark:text-gray-400">
		<button
			type="button"
			onclick={copyLink}
			title="Copy the link to this scan group (opens its latest scan)"
			class="inline-flex cursor-pointer items-center gap-1 rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
		>
			<LinkOutline class="h-3.5 w-3.5" />
			Copy link
		</button>
		{#if data.params?.scan && data.related}
			<CompareDialog scanId={data.params.scan} related={data.related} />
		{/if}
		<span class="font-medium">{formattedTimestamp}</span>
	</div>
</div>

{#if !data.system && canEditSystem && isEditingSystem}
	<div id="manual-system-status" aria-live="polite">
		{#if isSearching}
			<p class="-mt-2 mb-3 text-xs text-gray-500">Searching systems...</p>
		{/if}
		{#if searchError}
			<p class="-mt-2 mb-3 text-xs text-red-500">{searchError}</p>
		{/if}
		{#if saveError}
			<p class="-mt-2 mb-3 text-xs text-red-500">{saveError}</p>
		{/if}
	</div>
{/if}
