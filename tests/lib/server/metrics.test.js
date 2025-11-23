import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockMeter, mockCounter, mockHistogram, mockUpDownCounter } = vi.hoisted(() => {
    const mockCounter = { add: vi.fn() };
    const mockHistogram = { record: vi.fn() };
    const mockUpDownCounter = {};

    const mockMeter = {
        createCounter: vi.fn(() => mockCounter),
        createHistogram: vi.fn(() => mockHistogram),
        createObservableGauge: vi.fn((name) => {
            // Return gauge objects with their name
            return { name };
        }),
        createUpDownCounter: vi.fn(() => mockUpDownCounter),
        addBatchObservableCallback: vi.fn()
    };
    return { mockMeter, mockCounter, mockHistogram, mockUpDownCounter };
});

vi.mock('@opentelemetry/api', () => ({
    metrics: {
        getMeter: vi.fn(() => mockMeter)
    }
}));

vi.mock('../../../src/lib/logger.js', () => ({
    default: {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }
}));

const { mockPool } = vi.hoisted(() => {
    return {
        mockPool: {
            totalCount: 10,
            idleCount: 5,
            waitingCount: 0
        }
    };
});

vi.mock('../../../src/lib/database/client.js', () => ({
    pool: mockPool
}));

import {
    recordHttpRequest,
    recordEsiRequest,
    recordCronJob
} from '../../../src/lib/server/metrics.js';

describe('metrics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('recordHttpRequest', () => {
        it('should record http request metrics', () => {
            recordHttpRequest('GET', '/api/test', 200, 150);

            expect(mockCounter.add).toHaveBeenCalledWith(1, {
                method: 'GET',
                route: '/api/test',
                status: '200'
            });
            expect(mockHistogram.record).toHaveBeenCalledWith(0.15, {
                method: 'GET',
                route: '/api/test',
                status: '200'
            });
        });
    });

    describe('recordEsiRequest', () => {
        it('should record esi request metrics', () => {
            recordEsiRequest('POST', 201, 300, 90, 60, 'character');

            expect(mockCounter.add).toHaveBeenCalledWith(1, {
                method: 'POST',
                status: '201',
                resource: 'character'
            });
            expect(mockHistogram.record).toHaveBeenCalledWith(0.3, {
                method: 'POST',
                resource: 'character'
            });
        });

        it('should handle missing rate limit headers', () => {
            recordEsiRequest('GET', 200, 100);
            // Should not throw
            expect(mockCounter.add).toHaveBeenCalled();
        });
    });

    describe('recordCronJob', () => {
        it('should record successful cron job', () => {
            recordCronJob('test-job', 5000, true);

            expect(mockCounter.add).toHaveBeenCalledWith(1, {
                job: 'test-job',
                success: 'true'
            });
            expect(mockHistogram.record).toHaveBeenCalledWith(5, {
                job: 'test-job',
                success: 'true'
            });
        });

        it('should record failed cron job', () => {
            recordCronJob('failed-job', 1000, false);

            expect(mockCounter.add).toHaveBeenCalledWith(1, {
                job: 'failed-job',
                success: 'false'
            });
        });
    });
});

describe('DB Pool Metrics', () => {
    it('should observe pool metrics', async () => {
        vi.resetModules();
        await import('../../../src/lib/server/metrics.js');

        // Get the callback registered in the module
        // The first callback is for DB pool metrics
        const calls = mockMeter.addBatchObservableCallback.mock.calls;
        const callback = calls[0][0];

        const mockObservableResult = {
            observe: vi.fn()
        };

        callback(mockObservableResult);

        expect(mockObservableResult.observe).toHaveBeenCalledTimes(4);
        // Check specific observations based on mocked pool values (total: 10, idle: 5, waiting: 0)
        // In use = 10 - 5 = 5
        // Verify the correct values are observed (order: size, in-use, idle, waiting)
        const observeCalls = mockObservableResult.observe.mock.calls;
        const values = observeCalls.map(call => call[1]);

        expect(values).toContain(10); // Size
        expect(values).toContain(5);  // In use (appears twice: both in-use and idle are 5)
        expect(values).toContain(0);  // Waiting
    });

    it('should handle error in pool metrics observation', async () => {
        vi.resetModules();
        await import('../../../src/lib/server/metrics.js');
        const { default: logger } = await import('../../../src/lib/logger.js');

        const calls = mockMeter.addBatchObservableCallback.mock.calls;
        // Find the DB pool callback (it's the first one usually, or verify by args)
        const callback = calls.find(c => c[1].some(g => g.name === 'db_connection_pool_size'))[0];

        const mockObservableResult = {
            observe: vi.fn().mockImplementation(() => { throw new Error('Observe Error'); })
        };

        callback(mockObservableResult);
        expect(logger.warn).toHaveBeenCalled();
    });

    it('should log debug if pool is not initialized', async () => {
        vi.resetModules();
        vi.doMock('../../../src/lib/database/client.js', () => ({ pool: null }));
        const { default: logger } = await import('../../../src/lib/logger.js');

        await import('../../../src/lib/server/metrics.js');

        expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('disabled'));
    });
});

describe('ESI Metrics', () => {
    it('should observe ESI rate limits', async () => {
        vi.resetModules();
        const { recordEsiRequest } = await import('../../../src/lib/server/metrics.js');

        // Set values
        recordEsiRequest('GET', 200, 100, 50, 60);

        const calls = mockMeter.addBatchObservableCallback.mock.calls;
        expect(calls.length).toBeGreaterThanOrEqual(2);

        // Find ESI callback (use the last one registered, as resetModules causes re-registration)
        const matchingCalls = calls.filter(c => c[1].some(g => g.name === 'esi_error_limit_remain'));
        const callback = matchingCalls[matchingCalls.length - 1][0];

        const mockObservableResult = {
            observe: vi.fn()
        };

        callback(mockObservableResult);

        expect(mockObservableResult.observe).toHaveBeenCalledTimes(2); // remain and reset
        const values = mockObservableResult.observe.mock.calls.map(c => c[1]);
        expect(values).toContain(50);
        expect(values).toContain(60);
    });
});
