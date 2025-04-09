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
}
