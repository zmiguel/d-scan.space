<script>
	import { page } from '$app/stores';

	/**
	 * @typedef {Object} Props
	 * @property {string} title - The page title (excluding the site name).
	 * @property {string} [description] - A brief description (150-200 chars).
	 * @property {string} [image] - URL to the preview image (PNG/JPG, not SVG).
	 * @property {string} [imageAlt] - Alt text for the image.
	 * @property {boolean} [showImage] - If false, omits image meta tags.
	 * @property {'website' | 'article'} [type] - Content type ('website' or 'article').
	 * @property {string} [color] - Discord sidebar color (Hex code).
	 * @property {boolean} [noIndex] - If true, hides page from Google.
	 */

	/** @type {Props} */
	let {
		title,
		description = 'Parse and visualize EVE Online directional scans and local intel.',
		image = 'https://d-scan.space/favicon-96x96.png',
		imageAlt = 'D-Scan Space Logo',
		showImage = true,
		type = 'website',
		color = '#101828',
		noIndex = false
	} = $props();

	// --- Derived State (Runes) ---

	// Append site name automatically
	let fullTitle = $derived(`${title} | D-Scan Space!`);

	// Get current absolute URL
	let currentUrl = $derived($page.url.href);

	// Ensure image is absolute (Resolve relative paths like '/og.png')
	let absoluteImage = $derived(
		image.startsWith('http') ? image : new URL(image, $page.url.origin).href
	);
</script>

<svelte:head>
	<!-- 1. Basic HTML Meta Tags -->
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<meta name="viewport" content="width=device-width, initial-scale=1" />

	<!-- THEME COLOR: The Discord side-bar color -->
	<meta name="theme-color" content={color} />

	{#if noIndex}
		<meta name="robots" content="noindex, nofollow" />
	{:else}
		<meta name="robots" content="index, follow" />
	{/if}

	<!-- 2. Canonical URL -->
	<link rel="canonical" href={currentUrl} />

	<!-- 3. Open Graph -->
	<meta property="og:site_name" content="D-Scan Space!" />
	<meta property="og:type" content={type} />
	<meta property="og:url" content={currentUrl} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	{#if showImage}
		<meta property="og:image" content={absoluteImage} />
		<meta property="og:image:alt" content={imageAlt} />

		<!-- Image Hints -->
		<meta property="og:image:width" content="96" />
		<meta property="og:image:height" content="96" />
	{/if}

	<!-- 4. Twitter Cards -->
	<meta name="twitter:card" content={showImage ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	{#if showImage}
		<meta name="twitter:image" content={absoluteImage} />
		<meta name="twitter:image:alt" content={imageAlt} />
	{/if}
</svelte:head>
