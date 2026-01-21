import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
import logger from '../logger.js';

// Get a tracer instance for your application
const tracer = trace.getTracer('d-scan.space', pkg.version);

/**
 * Check if an error is actually a SvelteKit redirect
 * @param {any} error - The error/object to check
 * @returns {boolean} - True if it's a redirect
 */
function isRedirect(error) {
	return (
		error &&
		typeof error === 'object' &&
		error.constructor.name === 'Redirect' &&
		typeof error.status === 'number' &&
		typeof error.location === 'string'
	);
}

/**
 * Get SvelteKit's current span from request event if available
 * @param {import('$app/server').RequestEvent | undefined} event - SvelteKit request event
 * @returns {import('@opentelemetry/api').Span | undefined} - The current span
 */
function getSvelteKitSpan(event) {
	if (event?.tracing?.current) {
		return event.tracing.current;
	}
	return trace.getActiveSpan();
}

/**
 * Get SvelteKit's root span from request event if available
 * @param {import('$app/server').RequestEvent | undefined} event - SvelteKit request event
 * @returns {import('@opentelemetry/api').Span | undefined} - The root span
 */
function getSvelteKitRootSpan(event) {
	if (event?.tracing?.root) {
		return event.tracing.root;
	}
	return trace.getActiveSpan();
}

/**
 * Create and execute a span, with optional SvelteKit integration
 * @template T
 * @param {string} name - The name of the span
 * @param {(span: import('@opentelemetry/api').Span) => Promise<T> | T} fn - The function to execute within the span
 * @param {Record<string, unknown>} attributes - Optional attributes to add to the span
 * @param {import('@opentelemetry/api').SpanOptions} options - Optional span options
 * @param {import('$app/server').RequestEvent | undefined} event - Optional SvelteKit request event
 * @returns {Promise<T>} - The result of the function execution
 */
export async function withSpan(name, fn, attributes = {}, options = {}, event = undefined) {
	// Determine parent context (SvelteKit span if available, otherwise active context)
	let parentContext = context.active();
	if (event?.tracing?.current) {
		parentContext = trace.setSpan(parentContext, event.tracing.current);
	}

	const span = tracer.startSpan(name, options, parentContext);

	// Add attributes if provided
	if (Object.keys(attributes).length > 0) {
		span.setAttributes(attributes);
	}

	// If we have a SvelteKit event, add some context
	if (event) {
		span.setAttributes({
			'sveltekit.route.id': event.route?.id || 'unknown',
			'sveltekit.url.pathname': event.url?.pathname || 'unknown'
		});
	}

	try {
		// Execute the function within the span context
		const result = await context.with(trace.setSpan(context.active(), span), async () => {
			return await fn(span);
		});

		span.setStatus({ code: SpanStatusCode.OK });
		return result;
	} catch (error) {
		// Check if this is a SvelteKit redirect (not an actual error)
		if (isRedirect(error)) {
			// Add redirect information to the span
			span.setAttributes({
				'http.response.status_code': error.status,
				'http.response.redirect.location': error.location,
				'sveltekit.redirect': true
			});
			span.addEvent('redirect', {
				status: error.status,
				location: error.location
			});
			span.setStatus({ code: SpanStatusCode.OK });

			// Re-throw the redirect to maintain SvelteKit's flow
			throw error;
		}

		// Handle actual errors
		logger.error('Error occurred in span: ' + error.message);
		span.recordException(error);
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: error.message
		});
		span.addEvent('error', {
			message: error.message,
			stack: error.stack,
			code: error.code || 'UNKNOWN_ERROR'
		});
		span.setAttributes({
			'error.message': error.message,
			'error.stack': error.stack,
			'error.code': error.code || 'UNKNOWN_ERROR'
		});
		throw error;
	} finally {
		span.end();
	}
}

/**
 * Create a span manually (for more control)
 * @param {string} name - The name of the span
 * @param {Object} attributes - Optional attributes to add to the span
 * @param {Object} options - Optional span options
 * @returns {Span} - The created span (remember to call span.end())
 */
export function createSpan(name, attributes = {}, options = {}) {
	const span = tracer.startSpan(name, options);

	if (Object.keys(attributes).length > 0) {
		span.setAttributes(attributes);
	}

	return span;
}

/**
 * Get the current active span
 * @returns {Span|undefined} - The current active span
 */
export function getCurrentSpan() {
	return trace.getActiveSpan();
}

/**
 * Add attributes to SvelteKit's current span if available, fallback to active span
 * @param {Object} attributes - Attributes to add
 * @param {import('$app/server').RequestEvent | undefined} event - Optional SvelteKit request event
 */
export function addAttributes(attributes, event = undefined) {
	const span = getSvelteKitSpan(event);
	if (span) {
		span.setAttributes(attributes);
	}
}

/**
 * Add an event to SvelteKit's current span if available, fallback to active span
 * @param {string} name - Event name
 * @param {Object} attributes - Event attributes
 * @param {import('$app/server').RequestEvent | undefined} event - Optional SvelteKit request event
 */
export function addEvent(name, attributes = {}, event = undefined) {
	const span = getSvelteKitSpan(event);
	if (span) {
		span.addEvent(name, attributes);
	}
}

// Export the helper functions
export { getSvelteKitSpan, getSvelteKitRootSpan };

// Export the raw tracer for advanced use cases
export { tracer };
