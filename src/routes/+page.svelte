<script>
	import { Textarea, Label, Button } from 'flowbite-svelte';
	import { Toggle } from 'flowbite-svelte';
	import { Spinner } from 'flowbite-svelte';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import MetaTags from '$lib/components/MetaTags.svelte';
	import ScanSubmitError from '$lib/components/ScanSubmitError.svelte';
	import { copyText, scanGroupUrl } from '$lib/utils/clipboard.js';

	let isLoading = $state(false);
	/** @type {{ message: string, failedLines?: any[], failedLineCount?: number } | null} */
	let submitError = $state(null);
	const copiedFlagKey = 'scan-link-copied';

	/** Copies the new scan's group link; the scan page toasts only if this succeeded. */
	async function copyGroupLink(location) {
		if (!browser || !location) {
			return;
		}
		if (await copyText(scanGroupUrl(location, window.location.origin))) {
			sessionStorage.setItem(copiedFlagKey, '1');
		}
	}

	function handleSubmit() {
		isLoading = true;
		submitError = null;
		return async ({ result, update }) => {
			if (result?.type === 'redirect') {
				await copyGroupLink(result.location);
				window.location.assign(result.location);
				isLoading = false;
				return;
			}

			if (result?.type === 'failure') {
				// Keep the pasted text and explain what is wrong with it.
				submitError = /** @type {any} */ (result.data) ?? { message: 'Scan rejected.' };
				isLoading = false;
				return;
			}

			await update();
			isLoading = false;
		};
	}
</script>

<MetaTags
	title="EVE Online D-Scan & Local Scan Analyzer"
	description="Paste an EVE Online directional scan or local member list to see ship classes, fleet roles, on/off-grid split and the alliances and corporations in system."
	image="/favicon-96x96.png"
	imageAlt="D-Scan Space"
/>

<div class="content-center">
	{#if isLoading}
		<div class="flex min-h-[60vh] flex-col items-center justify-center py-8 sm:py-12">
			<Spinner size="12" class="mb-4" color="blue" />
			<h2 class="mb-2 text-xl font-semibold text-primary-700 sm:text-2xl dark:text-primary-400">
				... Processing ...
			</h2>
			<p class="text-sm text-gray-600 sm:text-base dark:text-gray-400">
				Please wait while we analyze your data and fetch the results.
			</p>
		</div>
	{/if}
	<!-- Hidden, not unmounted, while processing so the pasted text survives a rejection. -->
	<div class="container mx-auto px-0" class:hidden={isLoading}>
		<form method="POST" action="/scan?/create" use:enhance={handleSubmit}>
			<!-- The one heading of the page doubles as the paste prompt (kept short on purpose). -->
			<h1 class="mb-2 text-sm font-medium text-gray-900 dark:text-white">
				<Label for="textarea-id"
					>Paste <span class="text-primary-700 dark:text-primary-400">Local</span> or
					<span class="text-primary-700 dark:text-primary-400">Directional Scan</span></Label
				>
			</h1>
			<Textarea
				id="textarea-id"
				placeholder="Paste your data"
				rows={16}
				name="scan_content"
				class="block w-full text-sm sm:text-base"
				required
			/>

			<ScanSubmitError error={submitError} />

			<Toggle class="mt-3 cursor-pointer text-sm sm:text-base" checked={false} name="is_public"
				>Make this Scan public on the site.</Toggle
			>

			<Button
				class="mt-4 w-full cursor-pointer text-sm sm:text-base"
				color="primary"
				type="submit"
				data-rybbit-event="scan_submit"
				data-rybbit-prop-form="create">Process</Button
			>
			<p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
				EVE Online d-scan and local analyzer: copy the scan or local member list in game (Ctrl+A,
				Ctrl+C) and paste it above to see ship classes, fleet roles, on/off grid, and the alliances
				and corporations in system.
			</p>
		</form>
	</div>
</div>
