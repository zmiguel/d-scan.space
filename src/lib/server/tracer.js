import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import pkg from '../../../package.json' with { type: 'json' };
import logger from '$lib/logger';

// Get a tracer instance for your application
const tracer = trace.getTracer('d-scan.space', pkg.version);

/**
 * Check if an error is actually a SvelteKit redirect
 * @param {any} error - The error/object to check
 * @returns {boolean} - True if it's a redirect
 */
function isRedirect(error) {
    return error &&
           typeof error === 'object' &&
           error.constructor.name === 'Redirect' &&
           typeof error.status === 'number' &&
           typeof error.location === 'string';
}

/**
 * Create and execute a span
 * @param {string} name - The name of the span
 * @param {Function} fn - The function to execute within the span
 * @param {Object} attributes - Optional attributes to add to the span
 * @param {Object} options - Optional span options
 * @returns {Promise} - The result of the function execution
 */
export async function withSpan(name, fn, attributes = {}, options = {}) {
    const span = tracer.startSpan(name, options);

    // Add attributes if provided
    if (Object.keys(attributes).length > 0) {
        span.setAttributes(attributes);
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
        logger.error('Error occurred in span:', error);
        span.recordException(error);
        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
        });
        span.addEvent('error', {
            message: error.message,
            stack: error.stack,
            code: error.code || 'UNKNOWN_ERROR',
        });
        span.setAttributes({
            'error.message': error.message,
            'error.stack': error.stack,
            'error.code': error.code || 'UNKNOWN_ERROR',
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
 * Add attributes to the current active span
 * @param {Object} attributes - Attributes to add
 */
export function addAttributes(attributes) {
    const span = getCurrentSpan();
    if (span) {
        span.setAttributes(attributes);
    }
}

/**
 * Add an event to the current active span
 * @param {string} name - Event name
 * @param {Object} attributes - Event attributes
 */
export function addEvent(name, attributes = {}) {
    const span = getCurrentSpan();
    if (span) {
        span.addEvent(name, attributes);
    }
}

// Export the raw tracer for advanced use cases
export { tracer };