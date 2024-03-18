<script>
	import { Textarea, Label, Button } from 'flowbite-svelte';
	import { Toggle } from 'flowbite-svelte';
</script>

<div class="content-center">
	<Label for="textarea-id" class="mb-2">Paste <span class="text-primary-700 dark:text-primary-400">Local</span> or <span class="text-primary-700 dark:text-primary-400">Directional Scan</span></Label>
	<Textarea id="textarea-id" placeholder="Paste your data" rows="16" name="message" />
	<Toggle class="mt-2" checked={false}>Make this Scan public on the site.</Toggle>
	<Button class="mt-4 w-full" color="primary">Process</Button>
</div>