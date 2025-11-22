import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockSpan = {
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
    addEvent: vi.fn()
};

vi.mock('../../../src/lib/server/tracer.js', () => ({
    withSpan: vi.fn((name, fn) => fn(mockSpan))
}));

vi.mock('../../../src/lib/server/wrappers.js', () => ({
    fetchGET: vi.fn(),
    fetchPOST: vi.fn()
}));

vi.mock('../../../src/lib/server/corporations.js', () => ({
    addOrUpdateCorporations: vi.fn()
}));

vi.mock('../../../src/lib/server/alliances.js', () => ({
    addOrUpdateAlliances: vi.fn()
}));

vi.mock('../../../src/lib/database/characters.js', () => ({
    addOrUpdateCharactersDB: vi.fn(),
    biomassCharacter: vi.fn(),
    getCharactersByName: vi.fn()
}));

vi.mock('../../../src/lib/logger.js', () => ({
    default: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn()
    }
}));

import {
    addCharactersFromESI,
    updateCharactersFromESI,
    updateAffiliationsFromESI,
    idsToCharacters
} from '../../../src/lib/server/characters.js';
import { fetchGET, fetchPOST } from '../../../src/lib/server/wrappers.js';
import { addOrUpdateCharactersDB, getCharactersByName } from '../../../src/lib/database/characters.js';

describe('characters', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe('addCharactersFromESI', () => {
        it('should add characters from ESI', async () => {
            const names = ['Char1', 'Char2'];

            // Mock namesToCharacters flow
            // 1. names -> ids
            fetchPOST.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    characters: [
                        { id: 1, name: 'Char1' },
                        { id: 2, name: 'Char2' }
                    ]
                })
            });

            // 2. ids -> affiliations
            fetchPOST.mockResolvedValueOnce({
                ok: true,
                json: async () => [
                    { character_id: 1, corporation_id: 10, alliance_id: 100 },
                    { character_id: 2, corporation_id: 20 }
                ]
            });

            // 3. ids -> character details
            fetchGET.mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'Char', security_status: 0.5 }),
                headers: { get: () => null }
            });

            await addCharactersFromESI(names);

            expect(fetchPOST).toHaveBeenCalledTimes(2); // ids and affiliations
            expect(fetchGET).toHaveBeenCalledTimes(2); // 2 characters
            expect(addOrUpdateCharactersDB).toHaveBeenCalledWith(expect.arrayContaining([
                expect.objectContaining({ id: 1, corporation_id: 10, alliance_id: 100 }),
                expect.objectContaining({ id: 2, corporation_id: 20, alliance_id: null })
            ]));
        });

        it('should skip if sanity check passes', async () => {
            const names = ['Char1'];
            getCharactersByName.mockResolvedValue([{ name: 'Char1' }]);

            await addCharactersFromESI(names, true);

            expect(fetchPOST).not.toHaveBeenCalled();
        });
        expect(fetchPOST).not.toHaveBeenCalled();
    });

    it('should handle empty input gracefully', async () => {
        await addCharactersFromESI([]);
        expect(fetchPOST).not.toHaveBeenCalled();
    });

    it('should handle ESI error in names to ids', async () => {
        fetchPOST.mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error',
            url: 'https://esi.evetech.net/universe/ids'
        });

        await addCharactersFromESI(['Char1']);

        expect(addOrUpdateCharactersDB).not.toHaveBeenCalled();
    });
});

describe('updateCharactersFromESI', () => {
    it('should update characters from ESI', async () => {
        const data = [{ id: 1 }];

        // Mock idsToCharacters flow
        // 1. ids -> affiliations
        fetchPOST.mockResolvedValueOnce({
            ok: true,
            json: async () => [{ character_id: 1, corporation_id: 10 }]
        });

        // 2. ids -> character details
        fetchGET.mockResolvedValue({
            ok: true,
            json: async () => ({ name: 'Char1', security_status: 0.1 }),
            headers: { get: () => null }
        });

        await updateCharactersFromESI(data);

        expect(addOrUpdateCharactersDB).toHaveBeenCalled();
    });
});

describe('updateAffiliationsFromESI', () => {
    it('should update affiliations only', async () => {
        const data = [{ id: 1, name: 'Char1' }];

        fetchPOST.mockResolvedValueOnce({
            ok: true,
            json: async () => [{ character_id: 1, corporation_id: 99, alliance_id: 999 }]
        });

        await updateAffiliationsFromESI(data);


        expect(addOrUpdateCharactersDB).toHaveBeenCalledWith([
            expect.objectContaining({
                id: 1,
                corporation_id: 99,
                alliance_id: 999
            })
        ]);
    });


    describe('idsToCharacters', () => {
        it('should handle Doomheim characters (biomass)', async () => {
            // 1. affiliations -> Doomheim
            fetchPOST.mockResolvedValueOnce({
                ok: true,
                json: async () => [{ character_id: 1, corporation_id: 1000001 }]
            });

            // 2. character details
            fetchGET.mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'Biomassed', security_status: 0 }),
                headers: { get: () => null }
            });

            const result = await idsToCharacters([1]);

            expect(result).toHaveLength(0);
            // biomassCharacter is mocked, check if it was called
            // Note: biomassCharacter is imported from database/characters.js which is mocked
            const { biomassCharacter } = await import('../../../src/lib/database/characters.js');
            expect(biomassCharacter).toHaveBeenCalledWith(1);
        });

        it('should parse cache expiry headers', async () => {
            // 1. affiliations
            fetchPOST.mockResolvedValueOnce({
                ok: true,
                json: async () => [{ character_id: 1, corporation_id: 10 }]
            });

            // 2. character details with Expires header
            const futureDate = new Date(Date.now() + 3600000).toUTCString();
            fetchGET.mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'Char1', security_status: 0 }),
                headers: { get: (name) => name === 'expires' ? futureDate : null }
            });

            const result = await idsToCharacters([1]);

            expect(result).toHaveLength(1);
            expect(result[0].esi_cache_expires).toBeInstanceOf(Date);
        });

        it('should handle ESI errors in affiliations', async () => {
            fetchPOST.mockResolvedValueOnce({
                ok: false,
                status: 500,
                text: async () => 'Error',
                url: 'url'
            });

            const result = await idsToCharacters([1]);
            expect(result).toHaveLength(0);
        });
    });
});
