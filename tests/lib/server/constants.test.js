import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs
vi.mock('fs', () => ({
    readFileSync: vi.fn(() => JSON.stringify({ version: '1.0.0' }))
}));

describe('constants', () => {
    const originalEnv = process.env;
    const originalArgv = process.argv;
    const originalPlatform = process.platform;
    const originalArch = process.arch;
    const originalVersion = process.version;

    beforeEach(() => {
        vi.resetModules();
        process.env = { ...originalEnv };
        process.argv = [...originalArgv];
        Object.defineProperty(process, 'platform', { value: 'linux' });
        Object.defineProperty(process, 'arch', { value: 'x64' });
        Object.defineProperty(process, 'version', { value: 'v20.0.0' });
    });

    afterEach(() => {
        process.env = originalEnv;
        process.argv = originalArgv;
        Object.defineProperty(process, 'platform', { value: originalPlatform });
        Object.defineProperty(process, 'arch', { value: originalArch });
        Object.defineProperty(process, 'version', { value: originalVersion });
    });

    it('should export version from package.json', async () => {
        const { version } = await import('../../../src/lib/server/constants.js');
        expect(version).toBe('1.0.0');
    });

    it('should generate correct USER_AGENT for main app', async () => {
        process.env.NODE_ENV = 'production';
        process.env.AGENT = 'TestAgent';
        process.env.ORIGIN = 'https://test.com';
        process.env.CONTACT_EMAIL = 'test@test.com';

        const { USER_AGENT } = await import('../../../src/lib/server/constants.js');

        expect(USER_AGENT).toContain('D-Scan.Space/1.0.0');
        expect(USER_AGENT).toContain('(production; TestAgent; +https://test.com)');
        expect(USER_AGENT).toContain('mail:test@test.com');
        expect(USER_AGENT).toContain('Node/20.0.0 (linux; x64)');
    });

    it('should generate correct USER_AGENT for updater', async () => {
        process.argv = ['node', 'updater.js'];
        process.env.CONTACT_EMAIL = 'test@test.com';

        const { USER_AGENT } = await import('../../../src/lib/server/constants.js');

        expect(USER_AGENT).toContain('D-Scan.Space-Updater/1.0.0');
        expect(USER_AGENT).toContain('mail:test@test.com');
        expect(USER_AGENT).toContain('Node/20.0.0 (linux; x64)');
    });

    it('should handle missing env vars gracefully', async () => {
        process.env = {}; // Clear env

        const { USER_AGENT } = await import('../../../src/lib/server/constants.js');

        expect(USER_AGENT).toContain('undefined');
    });
});
