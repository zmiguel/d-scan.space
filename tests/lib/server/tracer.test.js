import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trace } from '@opentelemetry/api';

const { mockTracer, mockSpan } = vi.hoisted(() => {
	const mockSpan = {
		setAttributes: vi.fn(),
		setStatus: vi.fn(),
		addEvent: vi.fn(),
		end: vi.fn(),
		isRecording: vi.fn(() => true),
		recordException: vi.fn()
	};
	const mockTracer = {
		startSpan: vi.fn(() => mockSpan),
		startActiveSpan: vi.fn((name, fn) => fn(mockSpan))
	};
	return { mockTracer, mockSpan };
});

vi.mock('@opentelemetry/api', () => ({
	trace: {
		getTracer: vi.fn(() => mockTracer),
		setSpan: vi.fn((ctx) => ctx),
		getActiveSpan: vi.fn(() => mockSpan)
	},
	context: {
		active: vi.fn(() => ({})),
		with: vi.fn((ctx, fn) => fn())
	},
	SpanStatusCode: {
		OK: 1,
		ERROR: 2
	}
}));

vi.mock('fs', () => ({
	readFileSync: vi.fn(() => JSON.stringify({ version: '1.0.0' }))
}));

vi.mock('../../../src/lib/logger.js', () => ({
	default: {
		error: vi.fn()
	}
}));

import {
	withSpan,
	createSpan,
	getCurrentSpan,
	addAttributes,
	addEvent,
	getSvelteKitSpan,
	getSvelteKitRootSpan
} from '../../../src/lib/server/tracer.js';

describe('tracer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		trace.getActiveSpan.mockReturnValue(mockSpan);
	});

	describe('withSpan', () => {
		it('should execute function within a span', async () => {
			const fn = vi.fn().mockResolvedValue('result');
			const result = await withSpan('test-span', fn);

			expect(mockTracer.startSpan).toHaveBeenCalledWith('test-span', {}, expect.anything());
			expect(fn).toHaveBeenCalled();
			expect(result).toBe('result');
			expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
			expect(mockSpan.end).toHaveBeenCalled();
		});

		it('should add attributes to span', async () => {
			const fn = vi.fn();
			await withSpan('test-span', fn, { 'test.attr': 'value' });

			expect(mockSpan.setAttributes).toHaveBeenCalledWith({ 'test.attr': 'value' });
		});

		it('should handle errors', async () => {
			const error = new Error('test error');
			const fn = vi.fn().mockRejectedValue(error);

			await expect(withSpan('test-span', fn)).rejects.toThrow('test error');

			expect(mockSpan.recordException).toHaveBeenCalledWith(error);
			expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'test error' }); // ERROR
			expect(mockSpan.end).toHaveBeenCalled();
		});

		it('should handle non-Error throws', async () => {
			const fn = vi.fn().mockRejectedValue('boom');

			await expect(withSpan('test-span', fn)).rejects.toBe('boom');

			expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 2, message: 'boom' }); // ERROR
			expect(mockSpan.addEvent).toHaveBeenCalledWith(
				'error',
				expect.objectContaining({
					message: 'boom',
					code: 'UNKNOWN_ERROR'
				})
			);
		});

		it('should handle SvelteKit redirects', async () => {
			const redirectError = {
				status: 302,
				location: '/login',
				constructor: { name: 'Redirect' }
			};
			const fn = vi.fn().mockRejectedValue(redirectError);

			await expect(withSpan('test-span', fn)).rejects.toEqual(redirectError);

			expect(mockSpan.setAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					'sveltekit.redirect': true,
					'http.response.status_code': 302
				})
			);
			expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
			expect(mockSpan.end).toHaveBeenCalled();
		});

		it('should treat 4xx HttpErrors as handled client errors', async () => {
			const httpError = { status: 404, message: 'Not found' };
			const fn = vi.fn().mockRejectedValue(httpError);

			await expect(withSpan('test-span', fn)).rejects.toEqual(httpError);

			expect(mockSpan.setAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					'http.response.status_code': 404,
					'sveltekit.error': true,
					'error.level': 'info'
				})
			);
			expect(mockSpan.addEvent).toHaveBeenCalledWith(
				'client_error',
				expect.objectContaining({ status: 404, message: 'Not found' })
			);
			expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
			expect(mockSpan.recordException).not.toHaveBeenCalled();
		});

		it('should tag 422 HttpErrors as warnings', async () => {
			const httpError = { status: 422, message: 'Validation failed' };
			const fn = vi.fn().mockRejectedValue(httpError);

			await expect(withSpan('test-span', fn)).rejects.toEqual(httpError);

			expect(mockSpan.setAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					'http.response.status_code': 422,
					'sveltekit.error': true,
					'error.level': 'warning'
				})
			);
			expect(mockSpan.addEvent).toHaveBeenCalledWith(
				'warning',
				expect.objectContaining({ status: 422, message: 'Validation failed' })
			);
			expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
			expect(mockSpan.recordException).not.toHaveBeenCalled();
		});

		it('should fallback to string message for HttpErrors without message', async () => {
			const httpError = { status: 400 };
			const fn = vi.fn().mockRejectedValue(httpError);

			await expect(withSpan('test-span', fn)).rejects.toEqual(httpError);

			expect(mockSpan.addEvent).toHaveBeenCalledWith(
				'client_error',
				expect.objectContaining({ status: 400, message: '[object Object]' })
			);
			expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
		});

		it('should use SvelteKit event for parent context and attributes', async () => {
			const mockEvent = {
				tracing: { current: mockSpan },
				route: { id: 'test-route' },
				url: { pathname: '/test' }
			};
			const fn = vi.fn().mockResolvedValue('result');

			await withSpan('test-span', fn, {}, {}, mockEvent);

			expect(mockSpan.setAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					'sveltekit.route.id': 'test-route',
					'sveltekit.url.pathname': '/test'
				})
			);
		});

		it('should handle missing route/url in SvelteKit event', async () => {
			const mockEvent = { tracing: { current: mockSpan } };
			const fn = vi.fn();
			await withSpan('test-span', fn, {}, {}, mockEvent);
			expect(mockSpan.setAttributes).toHaveBeenCalledWith(
				expect.objectContaining({
					'sveltekit.route.id': 'unknown',
					'sveltekit.url.pathname': 'unknown'
				})
			);
		});
	});

	describe('createSpan', () => {
		it('should create a span with attributes', () => {
			const span = createSpan('manual-span', { 'manual.attr': 'yes' });
			expect(mockTracer.startSpan).toHaveBeenCalledWith('manual-span', {});
			expect(span.setAttributes).toHaveBeenCalledWith({ 'manual.attr': 'yes' });
		});

		it('should create a span without attributes', () => {
			const span = createSpan('manual-span');
			expect(mockTracer.startSpan).toHaveBeenCalledWith('manual-span', {});
			expect(span.setAttributes).not.toHaveBeenCalled();
		});
	});

	describe('getCurrentSpan', () => {
		it('should return active span', () => {
			const span = getCurrentSpan();
			expect(span).toBe(mockSpan);
		});
	});

	describe('SvelteKit helpers', () => {
		it('should get SvelteKit span', () => {
			const mockEvent = { tracing: { current: mockSpan } };
			expect(getSvelteKitSpan(mockEvent)).toBe(mockSpan);
			expect(getSvelteKitSpan({})).toBe(mockSpan); // Fallback to active
		});

		it('should get SvelteKit root span', () => {
			const mockEvent = { tracing: { root: mockSpan } };
			expect(getSvelteKitRootSpan(mockEvent)).toBe(mockSpan);
			expect(getSvelteKitRootSpan({})).toBe(mockSpan); // Fallback to active
		});

		it('should add attributes to SvelteKit span', () => {
			const mockEvent = { tracing: { current: mockSpan } };
			addAttributes({ 'test.attr': 'val' }, mockEvent);
			expect(mockSpan.setAttributes).toHaveBeenCalledWith({ 'test.attr': 'val' });
		});

		it('should handle no active span in addAttributes', () => {
			trace.getActiveSpan.mockReturnValue(undefined);
			addAttributes({ 'test.attr': 'val' });
			expect(mockSpan.setAttributes).not.toHaveBeenCalled();
		});

		it('should add event to SvelteKit span', () => {
			const mockEvent = { tracing: { current: mockSpan } };
			addEvent('test-event', { attr: 'val' }, mockEvent);
			expect(mockSpan.addEvent).toHaveBeenCalledWith('test-event', { attr: 'val' });
		});

		it('should handle no active span in addEvent', () => {
			trace.getActiveSpan.mockReturnValue(undefined);
			addEvent('test-event', { attr: 'val' });
			expect(mockSpan.addEvent).not.toHaveBeenCalled();
		});
	});
});
