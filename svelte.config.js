import adapter from '@sveltejs/adapter-node';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		alias: {
			$auth: 'src/auth.js'
		},
		// Packages in package.json `dependencies` stay external at runtime (adapter-node
		// bundles everything else). OpenTelemetry, pg and import-in-the-middle must be
		// external so the instrumentation can patch them.
		adapter: adapter(),
		experimental: {
			tracing: {
				server: true
			},
			instrumentation: {
				server: true
			}
		}
	}
};

export default config;
