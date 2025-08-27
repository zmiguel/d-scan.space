<script>
	import { Textarea, Label, Button } from 'flowbite-svelte';
	import { Toggle } from 'flowbite-svelte';
	import { Spinner } from 'flowbite-svelte';
	import { enhance } from '$app/forms';

	let isLoading = $state(false);

	function handleSubmit() {
		isLoading = true;
		return async ({ update }) => {
			await update();
			isLoading = false;
		};
	}
</script>

<svelte:head>
	<title>Home | D-Scan Space!</title>
</svelte:head>

<div class="content-center">
	{#if isLoading}
		<div class="flex min-h-[60vh] flex-col items-center justify-center py-12">
			<Spinner size="12" class="mb-4" color="blue" />
			<h2 class="mb-2 text-2xl font-semibold text-primary-700 dark:text-primary-400">
				... Processing ...
			</h2>
			<p class="text-gray-600 dark:text-gray-400">
				Please wait while we analyze your data and fetch the results.
			</p>
		</div>
	{:else}
		<div class="container mx-auto">
			<form method="POST" action="/scan?/create" use:enhance={handleSubmit}>
				<Label for="textarea-id" class="mb-2"
					>Paste <span class="text-primary-700 dark:text-primary-400">Local</span> or
					<span class="text-primary-700 dark:text-primary-400">Directional Scan</span></Label
				>
				<Textarea
					id="textarea-id"
					placeholder="Paste your data"
					rows={16}
					name="scan_content"
					class="block w-full"
					required
				/>

				<Toggle class="mt-2" checked={false} name="is_public"
					>Make this Scan public on the site.</Toggle
				>

				<Button class="mt-4 w-full" color="primary" type="submit">Process</Button>
			</form>
		</div>
	{/if}
</div>
