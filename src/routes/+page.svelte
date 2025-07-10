<script>
	import { Textarea, Label, Button } from 'flowbite-svelte';
	import { Toggle } from 'flowbite-svelte';
	import { Spinner } from 'flowbite-svelte';
	import { enhance } from '$app/forms';

	let isLoading = false;
	function handleSubmit() {
		isLoading = true;
	}

	function handleComplete() {
		isLoading = false;
	}
</script>

<svelte:head>
	<title>Home | D-Scan Space!</title>
</svelte:head>

<div class="content-center">
	{#if isLoading}
		<div class="flex flex-col items-center justify-center min-h-[60vh] py-12">
			<Spinner size="12" class="mb-4" color="blue" />
			<h2 class="text-2xl font-semibold mb-2 text-primary-700 dark:text-primary-400">
				... Processing ...
			</h2>
			<p class="text-gray-600 dark:text-gray-400">
				Please wait while we analyze your data and fetch the results.
			</p>
		</div>
	{:else}
		<div class="container mx-auto">
			<form
				method="POST"
				use:enhance
				action="/scan"
				onsubmit={handleSubmit}
				onreset={handleComplete}
			>
				<Label for="textarea-id" class="mb-2"
					>Paste <span class="text-primary-700 dark:text-primary-400">Local</span> or
					<span class="text-primary-700 dark:text-primary-400">Directional Scan</span></Label
				>
				<Textarea
					id="textarea-id"
					placeholder="Paste your data"
					rows={16}
					name="scan_content"
					required
				/>

				<Toggle class="mt-2" checked={false} name="is_public"
					>Make this Scan public on the site.</Toggle
				>

				<Button class="mt-4 w-full" color="primary" type="submit" formaction="/scan?/create"
					>Process</Button
				>
			</form>
		</div>
	{/if}
</div>
