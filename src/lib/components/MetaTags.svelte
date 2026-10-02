<script>
	import { page } from '$app/state';

	/**
	 * @typedef {Object} Props
	 * @property {string} title - The page title (excluding the site name).
	 * @property {string} [description] - A brief description (150-200 chars).
	 * @property {string} [image] - URL to the preview image (PNG/JPG, not SVG).
	 * @property {string} [imageAlt] - Alt text for the image.
	 * @property {boolean} [showImage] - If false, omits image meta tags.
	 * @property {'website' | 'article'} [type] - Content type ('website' or 'article').
	 * @property {string} [color] - Discord sidebar color (Hex code).
	 * @property {boolean} [noIndex] - If true, asks search engines not to index the page
	 *   (scans, per-user pages, errors).
	 * @property {boolean} [appendSiteName] - If false, omits '| D-Scan Space!' suffix.
	 * @property {number} [imageWidth] - Image size in pixels; 600+ wide uses the large card.
	 * @property {number} [imageHeight]
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
		noIndex = false,
		appendSiteName = true,
		imageWidth = 96,
		imageHeight = 96
	} = $props();

	// --- Derived State (Runes) ---

	let fullTitle = $derived(appendSiteName ? `${title} | D-Scan Space!` : title);

	// Canonical/OG URL without query string or hash.
	let currentUrl = $derived(`${page.url.origin}${page.url.pathname}`);

	// Ensure image is absolute (Resolve relative paths like '/og.png')
	let absoluteImage = $derived(
		image.startsWith('http') ? image : new URL(image, page.url.origin).href
	);
</script>

<svelte:head>
	<!-- 1. Basic HTML Meta Tags -->
	<title>{fullTitle}</title>
	<meta name="description" content={description} />

	<!-- THEME COLOR: The Discord side-bar color -->
	<meta name="theme-color" content={color} />

	{#if noIndex}
		<meta name="robots" content="noindex, nofollow" />
	{:else}
		<meta
			name="robots"
			content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
		/>
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
		<meta property="og:image:width" content={String(imageWidth)} />
		<meta property="og:image:height" content={String(imageHeight)} />
	{/if}

	<!-- 4. Twitter Cards: small card for the square icon, large card for wide previews -->
	<meta
		name="twitter:card"
		content={showImage && imageWidth >= 600 ? 'summary_large_image' : 'summary'}
	/>
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	{#if showImage}
		<meta name="twitter:image" content={absoluteImage} />
		<meta name="twitter:image:alt" content={imageAlt} />
	{/if}
</svelte:head>
