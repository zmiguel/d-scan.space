import { WorkerEntrypoint } from 'cloudflare:workers';

async function getCharacterFromESI(id) {
	const characterData = await fetch(`https://esi.evetech.net/latest/characters/${id}/?datasource=tranquility`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
		},
	});

	const characterInfo = await characterData.json();
	characterInfo.id = id;
	return characterInfo;
}

async function getAllianceFromESI(id) {
	const allianceData = await fetch(`https://esi.evetech.net/latest/alliances/${id}/?datasource=tranquility`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
		},
	});

	const allianceInfo = await allianceData.json();
	allianceInfo.id = id;
	return allianceInfo;
}

async function getCorporationFromESI(id) {
	const corporationData = await fetch(`https://esi.evetech.net/latest/corporations/${id}/?datasource=tranquility`, {
		method: 'GET',
		headers: {
			'Content-Type': 'application/json',
		},
	});

	const corporationInfo = await corporationData.json();
	corporationInfo.id = id;
	return corporationInfo;
}

export default class ESIClient extends WorkerEntrypoint {
	// Currently, entrypoints without a named handler are not supported
	async fetch() {
		return new Response(null, { status: 404 });
	}

	async namesToCharacters(names) {
		const response = await fetch('https://esi.evetech.net/latest/universe/ids/?datasource=tranquility&language=en', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(names),
			timeout: 60000,
		});

		if (!response.ok) {
			console.error(`Failed to get character ids from ESI ${JSON.stringify(response)}`);
			return [];
		}

		const data = await response.json();

		if (!data || !data.characters) {
			console.error('Tried to add characters from ESI but charactersIds array was empty');
			return [];
		}

		let characterData = [];
		const characterPromises = data.characters.map(async (character) => {
			const characterInfo = await getCharacterFromESI(character.id);
			characterData.push(characterInfo);
		});

		await Promise.all(characterPromises);

		return characterData;
	}

	async idsToAlliances(ids) {
		// get all alliances from esi and return them
		let allianceData = [];
		const alliancePromises = ids.map(async (id) => {
			const allianceInfo = await getAllianceFromESI(id);
			allianceData.push(allianceInfo);
		});

		await Promise.all(alliancePromises);

		return allianceData;
	}

	async idsToCorporations(ids) {
		// get all corporations from esi and return them
		let corporationData = [];
		const corporationPromises = ids.map(async (id) => {
			const corporationInfo = await getCorporationFromESI(id);
			corporationData.push(corporationInfo);
		});

		await Promise.all(corporationPromises);

		return corporationData;
	}

	async idsToCharacters(ids) {
		// get all characters from esi and return them
		let characterData = [];
		const characterPromises = ids.map(async (id) => {
			const characterInfo = await getCharacterFromESI(id);
			characterData.push(characterInfo);
		});

		await Promise.all(characterPromises);

		return characterData;
	}
}
