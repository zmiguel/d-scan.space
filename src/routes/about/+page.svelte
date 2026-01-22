<script>
	import {} from 'flowbite-svelte';
	import { resolve } from '$app/paths';
	import MetaTags from '$lib/components/MetaTags.svelte';
</script>

<MetaTags
	title="About"
	description="More information about D-Scan Space, an EVE Online intel tool for directional scans and local chat parsing."
/>

<div class="content-center space-y-4 px-4 pt-4 sm:px-0">
	<h1 class="text-xl font-bold text-gray-800 sm:text-2xl dark:text-gray-200">About</h1>
	<p class="text-sm font-normal text-gray-700 sm:text-base dark:text-gray-400">
		This website was created and is run by <strong>Oxed G</strong>. All data submitted to this
		website is private and will never be shared with any third party. Unless you explicitly make it
		public.
	</p>
	<p class="text-sm font-normal text-gray-700 sm:text-base dark:text-gray-400">
		If you have any questions about the functionality of this website, or if you have any
		suggestions. Please reach out via the multiple channels available on the <a
			href={resolve('/contact')}
			class="text-primary-700 dark:text-primary-400">Contact</a
		> page.
	</p>
	<p class="text-sm font-normal text-gray-700 sm:text-base dark:text-gray-400">Happy scanning!</p>
</div>
