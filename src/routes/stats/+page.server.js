import { getAllianceStats, getCharacterStats, getCorporationStats, getScanStats } from "$lib/database/stats";
import logger from "$lib/logger";


export async function load() {
    const [scanStats, characterStats, corporationStats, allianceStats] = await Promise.all([
        getScanStats(),
        getCharacterStats(),
        getCorporationStats(),
        getAllianceStats()
    ]);

    return {
        scanStats,
        characterStats,
        corporationStats,
        allianceStats
    };
}
