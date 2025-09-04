<script>
	import {} from 'flowbite-svelte';
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>About | D-Scan Space!</title>
</svelte:head>

<div class="content-center pt-4">
	<h1 class="text-2xl font-bold text-gray-800 dark:text-gray-200">About</h1>
	<br />
	<p class="font-normal text-gray-700 dark:text-gray-400">
		This website was created and is run by <strong>Oxed G</strong>. All data submitted to this
		website is private and will never be shared with any third party. Unless you explicitly make it
		public.
	</p>
	<br />
	<p class="font-normal text-gray-700 dark:text-gray-400">
		If you have any questions about the functionality of this website, or if you have any
		suggestions. Please reach out via the multiple channels available on the <a
			href={resolve('/contact')}
			class="text-primary-700 dark:text-primary-400">Contact</a
		> page.
	</p>
	<br />
	<p class="font-normal text-gray-700 dark:text-gray-400">Happy scanning!</p>
</div>
