<script>
	import { Button } from 'flowbite-svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import MetaTags from '$lib/components/MetaTags.svelte';

	const blame = $derived.by(() => {
		const status = $page.status ?? 0;
		if (status === 418) {
			return {
				title: "I'm a teapot, but so are you!",
				subtitle:
					'While your attempt was good and well formatted, your data returned nothing.\nAre you sure you copied the right thing?',
				action: 'Try Again',
				help: 'Double-check what you copied, then paste it again and reprocess.'
			};
		}
		const isUserError = status >= 400 && status < 500;
		return {
			title: isUserError ? 'Plot twist: user error detected.' : 'Our fault. Something is broken.',
			subtitle: isUserError
				? 'You pressed the wrong button, scanned the wrong system, or fat-fingered the URL.'
				: "Something on our side got lost in space. We're working to fix it. Please hang tight.",
			action: isUserError ? 'Try Again' : 'Go Home',
			help: isUserError
				? 'Double-check the link or try a new scan.'
				: 'If the problem persists, please contact us or open an issue on Github.'
		};
	});

	function handleGoHome() {
		goto(resolve('/'));
	}
</script>

<MetaTags title={blame.title} description={blame.subtitle} />

<div class="mx-auto max-w-2xl text-center">
	<div class="mb-4 text-6xl">{$page.status === 418 ? '🫖' : '🛰️'}</div>
	<h1 class="text-3xl font-bold text-red-500">{blame.title}</h1>
	<p class="mt-2 text-lg whitespace-pre-line text-gray-600 dark:text-gray-300">
		{blame.subtitle}
	</p>
	<div class="mt-3 text-sm text-gray-500 dark:text-gray-400">{blame.help}</div>
	<div
		class="mt-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-200"
	>
		<div class="font-semibold">Status: {$page.status}</div>
		<div class="mt-1">{$page.error?.message ?? 'No additional details.'}</div>
	</div>
	<Button color="primary" class="mt-6 cursor-pointer" onclick={handleGoHome}>{blame.action}</Button>
</div>
