<script>
	import { page } from '$app/state';
	import { asset } from '$app/paths';
	import MetaTags from '$lib/components/MetaTags.svelte';
	import ScanList from '$lib/components/ScanList.svelte';

	let { data } = $props();
</script>

<MetaTags
	title="My Scans"
	description="Browse your private and public scans on D-Scan Space."
	noIndex
/>

<div class="container mx-auto px-0">
	<div
		class="min-h-[500px] rounded-sm border border-gray-200 bg-white p-2 shadow-sm dark:border-gray-700 dark:bg-gray-700"
	>
		{#if data.requiresLogin}
			<div class="flex min-h-[300px] flex-col items-center justify-center gap-4 p-4 text-center">
				<p class="text-sm sm:text-base">You need to login to view your personal scans.</p>
				<form method="POST" action="/signin">
					<input type="hidden" name="providerId" value="eveonline" />
					<input type="hidden" name="redirectTo" value={page.url.pathname} />
					<button type="submit" class="w-full cursor-pointer">
						<img
							src={asset('/eve-sso-login-black-large.png')}
							alt="Login with EVE Online"
							class="hidden w-full sm:block dark:hidden"
						/>
						<img
							src={asset('/eve-sso-login-white-large.png')}
							alt="Login with EVE Online"
							class="hidden w-full sm:dark:block"
						/>
						<img
							src={asset('/eve-sso-login-black-small.png')}
							alt="Login with EVE Online"
							class="w-full sm:hidden dark:hidden"
						/>
						<img
							src={asset('/eve-sso-login-white-small.png')}
							alt="Login with EVE Online"
							class="hidden w-full dark:block sm:dark:hidden"
						/>
					</button>
				</form>
			</div>
		{:else}
			<ScanList
				basePath="/my-scans"
				scans={data.scans}
				total={data.total}
				page={data.page}
				pageCount={data.pageCount}
				query={data.query}
				type={data.type}
				showVisibility
				emptyText="You have no scans yet"
			/>
		{/if}
	</div>
</div>
