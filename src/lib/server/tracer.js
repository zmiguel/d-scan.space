import { trace, context, SpanStatusCode } from '@opentelemetry/api';
import pkg from '../../../package.json' with { type: 'json' };

// Get a tracer instance for your application
const tracer = trace.getTracer('d-scan.space', pkg.version);

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
        span.recordException(error);
        span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
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