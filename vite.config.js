import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit(), tailwindcss()],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.js',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	},
	ssr: {
		external: [
			'@opentelemetry/api',
			'@opentelemetry/auto-instrumentations-node',
			'@opentelemetry/exporter-trace-otlp-proto',
			'@opentelemetry/resources',
			'@opentelemetry/sdk-node',
			'@opentelemetry/sdk-trace-node',
			'@opentelemetry/semantic-conventions',
			'shimmer'
		],
		noExternal: []
	},
	optimizeDeps: {
		exclude: [
			'@opentelemetry/api',
			'@opentelemetry/auto-instrumentations-node',
			'@opentelemetry/exporter-trace-otlp-proto',
			'@opentelemetry/resources',
			'@opentelemetry/sdk-node',
			'@opentelemetry/sdk-trace-node',
			'@opentelemetry/semantic-conventions',
			'shimmer'
		]
	},
	build: {
		rollupOptions: {
			external: [
				'@opentelemetry/api',
				'@opentelemetry/auto-instrumentations-node',
				'@opentelemetry/exporter-trace-otlp-proto',
				'@opentelemetry/resources',
				'@opentelemetry/sdk-node',
				'@opentelemetry/sdk-trace-node',
				'@opentelemetry/semantic-conventions',
				'shimmer'
			]
		}
	}
});
