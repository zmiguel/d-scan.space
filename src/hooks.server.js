import { USER_AGENT } from '$lib/server/constants';
import logger from '$lib/logger';
import { recordHttpRequest } from '$lib/server/metrics';
import { withSpan } from '$lib/server/tracer';
import { closeDb, runMigrations } from '$lib/database/client';
import { building } from '$app/environment';
import { sequence } from '@sveltejs/kit/hooks';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { authHandle } from '$auth';
import { APP_RECOMMENDED, APP_REQUIRED, validateProductionEnv } from '$lib/server/env-check';

/**
 * Runs once before the server handles its first request (adapter-node awaits it before
 * listening), so requests never hit a half-migrated schema. A failed migration or a
 * missing required variable (production) rejects here and stops the server from starting.
 * @type {import('@sveltejs/kit').ServerInit}
 */
export async function init() {
	logger.info('Current User-Agent: ' + USER_AGENT);
	if (!building) {
		validateProductionEnv('app', { required: APP_REQUIRED, recommended: APP_RECOMMENDED });
		await runMigrations();
	}
}

// adapter-node emits this after draining in-flight requests (SIGINT/SIGTERM). Guarded so
// dev-server reloads of this module do not stack listeners.
const SHUTDOWN_LISTENER = Symbol.for('d-scan.space/close-db-on-shutdown');
if (!globalThis[SHUTDOWN_LISTENER]) {
	globalThis[SHUTDOWN_LISTENER] = true;
	process.on('sveltekit:shutdown', () => {
		closeDb().catch((err) => logger.error({ err }, 'Failed to close database pool'));
	});
}

/**
 * Request metrics and the request's SERVER span (`server.hooks.handle_request`).
 *
 * SvelteKit's own root span (`sveltekit.handle.root`, kit.experimental.tracing.server) is
 * kind INTERNAL. Trace views, span metrics and service graphs (e.g. Tempo/Grafana) select
 * requests by their SERVER span, and existing queries use this span name, so it is kept
 * (removing it in favour of Kit's span made request traces disappear from those views).
 * @type {import('@sveltejs/kit').Handle}
 */
const metricsHandle = async ({ event, resolve }) => {
	return await withSpan(
		'server.hooks.handle_request',
		async (span) => {
			const startTime = Date.now();
			const method = event.request.method;
			const route = event.route.id || 'unknown';

			let clientAddress;
			try {
				clientAddress = event.getClientAddress();
			} catch {
				// not available (e.g. some adapters / prerendering)
			}
			span.setAttributes({
				'http.method': method,
				'http.route': route,
				'http.target': event.url.pathname,
				'http.request.user_agent': event.request.headers.get('user-agent') || 'unknown',
				...(clientAddress ? { 'client.address': clientAddress } : {})
			});

			try {
				const response = await resolve(event);
				const duration = Date.now() - startTime;
				recordHttpRequest(method, route, response.status, duration);
				span.setAttributes({
					'http.response.status_code': response.status,
					'http.server.duration_ms': duration
				});
				span.setStatus({ code: SpanStatusCode.OK });
				return response;
			} catch (error) {
				recordHttpRequest(method, route, 500, Date.now() - startTime);
				span.recordException(error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
				throw error;
			}
		},
		{},
		{ kind: SpanKind.SERVER },
		event
	);
};

/**
 * `locals.auth()` decodes the session JWT and runs the jwt/session callbacks (several
 * DB lookups) on every call. Layout and page loads both call it, so memoize it per request.
 * @type {import('@sveltejs/kit').Handle}
 */
const memoizeAuthHandle = async ({ event, resolve }) => {
	const auth = event.locals.auth;
	if (typeof auth === 'function') {
		/** @type {ReturnType<typeof auth> | undefined} */
		let pending;
		event.locals.auth = () => (pending ??= auth());
	}
	return resolve(event);
};

/**
 * Baseline security headers. A full CSP is not set because the app relies on inline
 * scripts (SvelteKit hydration, analytics loader in app.html).
 * @type {import('@sveltejs/kit').Handle}
 */
const securityHeadersHandle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const headers = {
		'X-Frame-Options': 'DENY',
		'X-Content-Type-Options': 'nosniff',
		'Referrer-Policy': 'strict-origin-when-cross-origin'
	};
	for (const [name, value] of Object.entries(headers)) {
		if (!response.headers.has(name)) {
			try {
				response.headers.set(name, value);
			} catch {
				// Immutable headers (e.g. responses passed through from fetch); leave as is.
			}
		}
	}
	return response;
};

export const handle = sequence(metricsHandle, securityHeadersHandle, authHandle, memoizeAuthHandle);
