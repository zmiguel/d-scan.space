import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
		// If your environment is not supported or you settled on a specific environment, switch out the adapter.
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: adapter({
			external: [
				"@opentelemetry/api",
				"@opentelemetry/auto-instrumentations-node",
				"@opentelemetry/exporter-trace-otlp-proto",
				"@opentelemetry/resources",
				"@opentelemetry/sdk-node",
				"@opentelemetry/sdk-trace-node",
				"@opentelemetry/semantic-conventions",
				'shimmer'
			]
		})
	},
	preprocess: vitePreprocess()
};

export default config;
