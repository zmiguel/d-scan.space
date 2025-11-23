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
        vi.unstubAllEnvs();
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
        const originalArgv = process.argv;
        Object.defineProperty(process, 'argv', {
            value: ['node', 'updater.js'],
            writable: true
        });
        process.env.CONTACT_EMAIL = 'test@test.com';

        const { USER_AGENT } = await import('../../../src/lib/server/constants.js');

        expect(USER_AGENT).toContain('D-Scan.Space-Updater/1.0.0');
        expect(USER_AGENT).toContain('mail:test@test.com');
        expect(USER_AGENT).toContain('Node/20.0.0 (linux; x64)');

        Object.defineProperty(process, 'argv', {
            value: originalArgv,
            writable: true
        });
    });

    it('should generate correct USER_AGENT for updater with missing env vars', async () => {
        const originalArgv = process.argv;
        Object.defineProperty(process, 'argv', {
            value: ['node', 'updater.js'],
            writable: true
        });
        // Ensure env vars are missing
        vi.stubEnv('CONTACT_EMAIL', '');
        vi.stubEnv('CONTACT_EVE', '');
        vi.stubEnv('CONTACT_DISCORD', '');

        const { USER_AGENT } = await import('../../../src/lib/server/constants.js');

        expect(USER_AGENT).toContain('D-Scan.Space-Updater/1.0.0');
        expect(USER_AGENT).toContain('mail:undefined');
        expect(USER_AGENT).toContain('eve:undefined');
        expect(USER_AGENT).toContain('discord:undefined');

        Object.defineProperty(process, 'argv', {
            value: originalArgv,
            writable: true
        });
    });

    it('should handle missing env vars gracefully', async () => {
        // Use vi.stubEnv to set env vars to empty strings (which are falsy)
        vi.stubEnv('NODE_ENV', '');
        vi.stubEnv('AGENT', '');
        vi.stubEnv('ORIGIN', '');
        vi.stubEnv('CONTACT_EMAIL', '');

        const { USER_AGENT } = await import('../../../src/lib/server/constants.js');

        expect(USER_AGENT).toContain('development');
        expect(USER_AGENT).toContain('unknown');
        expect(USER_AGENT).toContain('undefined'); // ORIGIN default is 'undefined' string in code
        expect(USER_AGENT).toContain('undefined'); // CONTACT_EMAIL default is 'undefined' string in code
    });
});
