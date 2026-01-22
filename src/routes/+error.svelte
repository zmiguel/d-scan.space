<script>
	import { Button } from 'flowbite-svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import MetaTags from '$lib/components/MetaTags.svelte';

	function handleGoHome() {
		goto(resolve('/'));
	}
</script>

<MetaTags title="Oops! Something went wrong" description="An unexpected error occurred." />

<div class="text-center">
	<h1 class="text-3xl font-bold text-red-500">Oops! An error {$page.status} occurred.</h1>
	<div class="mt-4 mb-4 dark:text-white">{$page.error?.message}</div>
	<Button color="primary" onclick={handleGoHome}>Go Home</Button>
</div>
