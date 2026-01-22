<script>
	import { RocketSolid, GithubSolid, DiscordSolid, EnvelopeSolid } from 'flowbite-svelte-icons';
	import MetaTags from '$lib/components/MetaTags.svelte';

	// Contact details
	const contacts = [
		{ type: 'In-Game', value: 'Oxed G' },
		{
			type: 'GitHub',
			value: 'github.com/zmiguel/d-scan.space',
			href: 'https://github.com/zmiguel/d-scan.space'
		},
		{ type: 'Discord', value: 'oxedpixel' },
		{ type: 'Email', value: 'contact@d-scan.space', href: 'mailto:contact@d-scan.space' }
	];

	const ICONS = {
		'In-Game': RocketSolid,
		GitHub: GithubSolid,
		Discord: DiscordSolid,
		Email: EnvelopeSolid
	};
</script>

<MetaTags
	title="Contact"
	description="Contact the D-Scan Space team for feedback or bug reports."
/>

<div class="content-center pt-4">
	<h1 class="text-2xl font-bold text-gray-800 dark:text-gray-200">Contact</h1>
	<p class="mt-3 font-normal text-gray-700 dark:text-gray-400">
		Reach out via any of the channels below.
	</p>

	<ul class="mt-6 space-y-3">
		{#each contacts as c (c.type)}
			<li class="flex items-center gap-3">
				<svelte:component
					this={ICONS[c.type]}
					size="lg"
					class="shrink-0"
					aria-label={c.type + ' icon'}
				/>
				{#if c.href}
					<!-- svelte-ignore svelte/no-navigation-without-resolve -->
					<a
						href={c.href}
						target="_blank"
						rel="noopener noreferrer"
						class="text-primary-700 hover:underline dark:text-primary-400"
					>
						<span class="font-medium">{c.type}:</span>
						<span class="ml-1 break-all">{c.value}</span>
					</a>
				{:else}
					<span class="text-gray-800 dark:text-gray-200">
						<span class="font-medium">{c.type}:</span>
						<span class="ml-1">{c.value}</span>
					</span>
				{/if}
			</li>
		{/each}
	</ul>
</div>
