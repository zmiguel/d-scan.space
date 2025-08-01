<script>
    import {} from 'flowbite-svelte';

    export let data;

    const { scanStats, characterStats, corporationStats, allianceStats } = data;

    // Helper function to calculate percentage
    function getPercentage(value, total) {
        if (total === 0) return 0;
        return ((value / total) * 100).toFixed(1);
    }
</script>

<svelte:head>
    <title>Stats | D-Scan Space!</title>
</svelte:head>

<div class="content-center pt-4">
    <h1 class="text-2xl font-bold text-gray-800 dark:text-gray-200">Stats</h1>
    <br />

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <!-- Scans Stats -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Scans</h2>
            <div class="space-y-3">
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Total Scans:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">{scanStats.totalScans.toLocaleString()}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Total Groups:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">{scanStats.totalScanGroups.toLocaleString()}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Public Scans:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {scanStats.publicScans.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(scanStats.publicScans, scanStats.totalScans)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Public Groups:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {scanStats.publicScanGroups.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(scanStats.publicScanGroups, scanStats.totalScanGroups)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Groups w/o System:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {scanStats.scanGroupsWithoutSystem.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(scanStats.scanGroupsWithoutSystem, scanStats.totalScanGroups)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Local Scans:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {scanStats.localScans.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(scanStats.localScans, scanStats.totalScans)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Directional Scans:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {scanStats.directionalScans.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(scanStats.directionalScans, scanStats.totalScans)}%)</span>
                    </span>
                </div>
            </div>
        </div>

        <!-- Characters Stats -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Characters</h2>
            <div class="space-y-3">
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Total:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">{characterStats.totalCharacters.toLocaleString()}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen 24h:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {characterStats.charactersLastSeen24h.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(characterStats.charactersLastSeen24h, characterStats.totalCharacters)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen Week:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {characterStats.charactersLastSeenWeek.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(characterStats.charactersLastSeenWeek, characterStats.totalCharacters)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen Month:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {characterStats.charactersLastSeenMonth.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(characterStats.charactersLastSeenMonth, characterStats.totalCharacters)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen Year:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {characterStats.charactersLastSeenYear.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(characterStats.charactersLastSeenYear, characterStats.totalCharacters)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Updated 24h:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {characterStats.charactersUpdated24h.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(characterStats.charactersUpdated24h, characterStats.totalCharacters)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">No Alliance:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {characterStats.charactersWithoutAlliance.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(characterStats.charactersWithoutAlliance, characterStats.totalCharacters)}%)</span>
                    </span>
                </div>
            </div>
        </div>

        <!-- Corporations Stats -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Corporations</h2>
            <div class="space-y-3">
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Total:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">{corporationStats.totalCorporations.toLocaleString()}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen 24h:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {corporationStats.corporationsLastSeen24h.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(corporationStats.corporationsLastSeen24h, corporationStats.totalCorporations)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen Week:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {corporationStats.corporationsLastSeenWeek.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(corporationStats.corporationsLastSeenWeek, corporationStats.totalCorporations)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen Month:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {corporationStats.corporationsLastSeenMonth.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(corporationStats.corporationsLastSeenMonth, corporationStats.totalCorporations)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen Year:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {corporationStats.corporationsLastSeenYear.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(corporationStats.corporationsLastSeenYear, corporationStats.totalCorporations)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Updated 24h:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {corporationStats.corporationsUpdated24h.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(corporationStats.corporationsUpdated24h, corporationStats.totalCorporations)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">No Alliance:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {corporationStats.corporationsWithoutAlliance.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(corporationStats.corporationsWithoutAlliance, corporationStats.totalCorporations)}%)</span>
                    </span>
                </div>
            </div>
        </div>

        <!-- Alliances Stats -->
        <div class="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 class="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">Alliances</h2>
            <div class="space-y-3">
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Total:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">{allianceStats.totalAlliances.toLocaleString()}</span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen 24h:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {allianceStats.alliancesLastSeen24h.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(allianceStats.alliancesLastSeen24h, allianceStats.totalAlliances)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen Week:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {allianceStats.alliancesLastSeenWeek.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(allianceStats.alliancesLastSeenWeek, allianceStats.totalAlliances)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen Month:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {allianceStats.alliancesLastSeenMonth.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(allianceStats.alliancesLastSeenMonth, allianceStats.totalAlliances)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Seen Year:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {allianceStats.alliancesLastSeenYear.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(allianceStats.alliancesLastSeenYear, allianceStats.totalAlliances)}%)</span>
                    </span>
                </div>
                <div class="flex justify-between">
                    <span class="text-gray-600 dark:text-gray-400">Updated 24h:</span>
                    <span class="font-semibold text-gray-800 dark:text-gray-200">
                        {allianceStats.alliancesUpdated24h.toLocaleString()}
                        <span class="text-sm text-gray-500 dark:text-gray-400">({getPercentage(allianceStats.alliancesUpdated24h, allianceStats.totalAlliances)}%)</span>
                    </span>
                </div>
            </div>
        </div>
    </div>
</div>