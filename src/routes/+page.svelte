<script>
	import { Textarea, Label, Button } from 'flowbite-svelte';
	import { Toggle } from 'flowbite-svelte';
	import { enhance } from '$app/forms';

	let isLoading = false;
	function handleSubmit(event) {
		isLoading = true;
	}

	function handleComplete(event) {
		isLoading = false;
	}
</script>

<svelte:head>
	<title>Home | D-Scan Space!</title>
</svelte:head>

<div class="content-center">
	{#if isLoading}
		<div class="text-primary-700 dark:text-primary-400">Loading...</div>
	{/if}
	<form method="POST" use:enhance action="/scan" on:submit={handleSubmit} on:reset={handleComplete}>
		<Label for="textarea-id" class="mb-2"
			>Paste <span class="text-primary-700 dark:text-primary-400">Local</span> or
			<span class="text-primary-700 dark:text-primary-400">Directional Scan</span></Label
		>
		<Textarea
			id="textarea-id"
			placeholder="Paste your data"
			rows="16"
			name="scan_content"
			required
		/>

		<Toggle class="mt-2" checked={false} name="is_public">Make this Scan public on the site.</Toggle
		>

		<Button class="mt-4 w-full" color="primary" type="submit" formaction="/scan?/create"
			>Process</Button
		>
	</form>
</div>
