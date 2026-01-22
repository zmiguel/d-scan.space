<script>
	import { Textarea, Label, Button } from 'flowbite-svelte';
	import { Toggle } from 'flowbite-svelte';
	import { Spinner } from 'flowbite-svelte';
	import { enhance } from '$app/forms';
	import MetaTags from '$lib/components/MetaTags.svelte';

	let isLoading = $state(false);

	function handleSubmit() {
		isLoading = true;
		return async ({ update }) => {
			await update();
			isLoading = false;
		};
	}
</script>

<MetaTags title="Home" image="/web-app-manifest-512x512.png" imageAlt="Preview" />

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
	{:else}
		<div class="container mx-auto px-4 sm:px-0">
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
					class="block w-full text-sm sm:text-base"
					required
				/>

				<Toggle class="mt-3 cursor-pointer text-sm sm:text-base" checked={false} name="is_public"
					>Make this Scan public on the site.</Toggle
				>

				<Button
					class="mt-4 w-full cursor-pointer text-sm sm:text-base"
					color="primary"
					type="submit">Process</Button
				>
			</form>
		</div>
	{/if}
</div>
