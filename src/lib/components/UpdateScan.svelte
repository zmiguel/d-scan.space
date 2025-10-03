<script>
	import { Textarea, Button } from 'flowbite-svelte';
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';

	let { data } = $props();

	// For the sidebar form
	let isLoading = $state(false);
	let formError = $state('');

	function handleSubmit() {
		isLoading = true;
		formError = '';
		return async ({ update }) => {
			await update();
			isLoading = false;
		};
	}

	// Reset loading state when component is destroyed or page changes
	onDestroy(() => {
		isLoading = false;
		formError = '';
	});

	// Reset loading state when page data changes (e.g., after navigation)
	$effect(() => {
		if (data && data.params) {
			isLoading = false;
			formError = '';
		}
	});
</script>

<div class="mb-3">
	<h3 class="mb-3 border-b pb-2 text-lg font-semibold">Update Scan</h3>
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
				<p class="mt-2 text-base text-gray-600 dark:text-gray-400">Processing...</p>
			</div>
		</div>
	{:else}
		<form id="update-scan-form" method="POST" action="/scan?/update" use:enhance={handleSubmit}>
			<!-- Hidden input for scan group -->
			<input type="hidden" name="scan_group" value={data.params.group} />

			<Textarea
				id="scan-content"
				placeholder="Paste your data"
				rows={4}
				name="scan_content"
				required
				class="mb-2 w-full text-sm"
			/>
			{#if formError}
				<div class="mb-2 text-xs text-red-500">{formError}</div>
			{/if}
			<Button class="w-full cursor-pointer text-sm" color="primary" type="submit" size="sm"
				>Update</Button
			>
		</form>
	{/if}
</div>
