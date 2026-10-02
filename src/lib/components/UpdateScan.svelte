<script>
	import { Textarea, Button } from 'flowbite-svelte';
	import { browser } from '$app/environment';
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import ScanSubmitError from '$lib/components/ScanSubmitError.svelte';
	import { copyText, scanGroupUrl } from '$lib/utils/clipboard.js';

	let { data } = $props();

	// For the sidebar form
	let isLoading = $state(false);
	/** @type {{ message: string, failedLines?: any[], failedLineCount?: number } | null} */
	let formError = $state(null);
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
		formError = null;
		return async ({ result, update }) => {
			if (result?.type === 'redirect') {
				await copyGroupLink(result.location);
				window.location.assign(result.location);
				isLoading = false;
				return;
			}

			if (result?.type === 'failure') {
				// Keep the pasted text and explain what is wrong with it.
				formError = /** @type {any} */ (result.data) ?? { message: 'Scan rejected.' };
				isLoading = false;
				return;
			}

			await update();
			isLoading = false;
		};
	}

	// Reset loading state when component is destroyed or page changes
	onDestroy(() => {
		isLoading = false;
		formError = null;
	});

	// Reset loading state when page data changes (e.g., after navigation)
	$effect(() => {
		if (data && data.params) {
			isLoading = false;
			formError = null;
		}
	});
</script>

<div class="mb-3">
	<h3 class="mb-3 border-b pb-2 text-base font-semibold sm:text-lg">Update Scan</h3>
	{#if isLoading}
		<div class="flex flex-col items-center justify-center py-4">
			<div class="text-center">
				<div class="inline-block">
					<svg
						class="h-7 w-7 animate-spin text-primary-600"
						xmlns="http://www.w3.org/2000/svg"
						fill="none"
						viewBox="0 0 24 24"
					>
						<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
				</div>
				<p class="mt-2 text-sm text-gray-600 sm:text-base dark:text-gray-400">Processing...</p>
			</div>
		</div>
	{/if}
	<!-- Hidden, not unmounted, while processing so the pasted text survives a rejection. -->
	<form
		id="update-scan-form"
		method="POST"
		action="/scan?/update"
		use:enhance={handleSubmit}
		class:hidden={isLoading}
	>
		<!-- Hidden input for scan group -->
		<input type="hidden" name="scan_group" value={data.params.group} />

		<Textarea
			id="scan-content"
			placeholder="Paste your data"
			rows={4}
			name="scan_content"
			required
			class="mb-2 w-full text-sm sm:text-base"
		/>
		<ScanSubmitError error={formError} compact />
		<Button
			class="mt-2 w-full cursor-pointer text-sm sm:text-base"
			color="primary"
			type="submit"
			size="sm"
			data-rybbit-event="scan_submit"
			data-rybbit-prop-form="update"
			data-rybbit-prop-scan={data.params.scan}
			data-rybbit-prop-group={data.params.group}>Update</Button
		>
	</form>
</div>
