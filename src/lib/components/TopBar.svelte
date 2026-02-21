<script>
	import { Breadcrumb, BreadcrumbItem, Badge } from 'flowbite-svelte';
	import { ChevronLeftOutline, CloseOutline, EditOutline } from 'flowbite-svelte-icons';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';

	let { data } = $props();
	let isEditingSystem = $state(false);
	let systemQuery = $state('');
	let systemSuggestions = $state([]);
	let searchError = $state('');
	let saveError = $state('');
	let isSearching = $state(false);
	let isSaving = $state(false);
	let searchDebounceHandle;

	// Function to determine security color based on value
	function getSecurityClass(secValue) {
		if (secValue >= 0.5) return 'green';
		if (secValue > 0.0) return 'yellow';
		return 'red';
	}

	const systemSecurity = $derived(
		data.system && typeof data.system.security === 'number' ? data.system.security : null
	);

	const securityBadgeColor = $derived(
		systemSecurity !== null ? getSecurityClass(systemSecurity) : 'purple'
	);

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

		const trimmed = query.trim();
		if (trimmed.length < 2) {
			systemSuggestions = [];
			searchError = '';
			return;
		}

		isSearching = true;
		searchError = '';
		try {
			const response = await fetch(`/api/systems/search?q=${encodeURIComponent(trimmed)}&limit=10`);
			if (!response.ok) {
				throw new Error('Search failed');
			}

			const payload = await response.json();
			systemSuggestions = payload?.systems ?? [];
		} catch {
			systemSuggestions = [];
			searchError = 'Could not load system suggestions.';
		} finally {
			isSearching = false;
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

	function toggleSystemEditor() {
		isEditingSystem = !isEditingSystem;
		if (!isEditingSystem) {
			systemQuery = '';
			systemSuggestions = [];
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
						<input
							id="manual-system"
							type="text"
							name="system_name"
							value={systemQuery}
							oninput={handleSystemInput}
							list="manual-system-suggestions"
							autocomplete="off"
							required
							class="w-56 rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
						/>
						<datalist id="manual-system-suggestions">
							{#each systemSuggestions as suggestion (suggestion.id)}
								<option value={suggestion.name}>
									{suggestion.constellation} · {suggestion.region}
								</option>
							{/each}
						</datalist>
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
	<div class="text-xs text-gray-600 sm:text-sm dark:text-gray-400">
		<span class="font-medium">{formattedTimestamp}</span>
	</div>
</div>

{#if !data.system && canEditSystem && isEditingSystem}
	{#if isSearching}
		<p class="-mt-2 mb-3 text-xs text-gray-500">Searching systems...</p>
	{/if}
	{#if searchError}
		<p class="-mt-2 mb-3 text-xs text-red-500">{searchError}</p>
	{/if}
	{#if saveError}
		<p class="-mt-2 mb-3 text-xs text-red-500">{saveError}</p>
	{/if}
{/if}
