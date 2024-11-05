<script>
	import { Textarea, Label, Button } from 'flowbite-svelte';
	import { Toggle } from 'flowbite-svelte';
	import { enhance } from '$app/forms';
</script>

<svelte:head>
	<title>Home | D-Scan Space!</title>
</svelte:head>

<div class="content-center">
	<form method="POST" use:enhance action="/scan">
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
