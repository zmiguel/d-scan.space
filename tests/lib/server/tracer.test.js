import { describe, it, expect, vi, beforeEach } from 'vitest';

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
        setSpan: vi.fn((ctx, span) => ctx),
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

import { withSpan, createSpan, getCurrentSpan, addAttributes, addEvent, getSvelteKitSpan, getSvelteKitRootSpan } from '../../../src/lib/server/tracer.js';

describe('tracer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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

        it('should handle SvelteKit redirects', async () => {
            const redirectError = {
                status: 302,
                location: '/login',
                constructor: { name: 'Redirect' }
            };
            const fn = vi.fn().mockRejectedValue(redirectError);

            await expect(withSpan('test-span', fn)).rejects.toEqual(redirectError);

            expect(mockSpan.setAttributes).toHaveBeenCalledWith(expect.objectContaining({
                'sveltekit.redirect': true,
                'http.response.status_code': 302
            }));
            expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 1 }); // OK
            expect(mockSpan.end).toHaveBeenCalled();
        });
    });

    describe('createSpan', () => {
        it('should create a span with attributes', () => {
            const span = createSpan('manual-span', { 'manual.attr': 'yes' });
            expect(mockTracer.startSpan).toHaveBeenCalledWith('manual-span', {});
            expect(span.setAttributes).toHaveBeenCalledWith({ 'manual.attr': 'yes' });
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

        it('should add event to SvelteKit span', () => {
            const mockEvent = { tracing: { current: mockSpan } };
            addEvent('test-event', { 'attr': 'val' }, mockEvent);
            expect(mockSpan.addEvent).toHaveBeenCalledWith('test-event', { 'attr': 'val' });
        });
    });
});
