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

<div class="content-center px-0 pt-4">
	<h1 class="text-xl font-bold text-gray-800 sm:text-2xl dark:text-gray-200">Contact</h1>
	<p class="mt-3 text-sm font-normal text-gray-700 sm:text-base dark:text-gray-400">
		Reach out via any of the channels below.
	</p>

	<ul class="mt-6 space-y-4">
		{#each contacts as c (c.type)}
			<li class="flex items-start gap-3 sm:items-center">
				<svelte:component
					this={ICONS[c.type]}
					size="lg"
					class="mt-1 shrink-0 sm:mt-0"
					aria-label={c.type + ' icon'}
				/>
				{#if c.href}
					<a
						href={c.href}
						target="_blank"
						rel="noopener noreferrer external"
						class="text-sm text-primary-700 hover:underline sm:text-base dark:text-primary-400"
					>
						<span class="font-medium">{c.type}:</span>
						<span class="ml-1 break-all">{c.value}</span>
					</a>
				{:else}
					<span class="text-sm text-gray-800 sm:text-base dark:text-gray-200">
						<span class="font-medium">{c.type}:</span>
						<span class="ml-1">{c.value}</span>
					</span>
				{/if}
			</li>
		{/each}
	</ul>
</div>
