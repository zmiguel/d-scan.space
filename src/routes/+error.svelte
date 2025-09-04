<script>
	import { Button } from 'flowbite-svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	function handleGoHome() {
		goto(resolve('/'));
	}
</script>

<svelte:head>
	<title>Ooops!! Something went wrong... | D-Scan Space!</title>
</svelte:head>

<div class="text-center">
	<h1 class="text-3xl font-bold text-red-500">Oops! An error {$page.status} occurred.</h1>
	<div class="mt-4 mb-4 dark:text-white">{$page.error?.message}</div>
	<Button color="primary" onclick={handleGoHome}>Go Home</Button>
</div>
