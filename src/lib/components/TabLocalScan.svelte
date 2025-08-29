<script>
	import AllianceList from './AllianceList.svelte';
	import CorporationList from './CorporationList.svelte';
	import CharacterList from './CharacterList.svelte';

	let { data, corps, pilots } = $props();
</script>

<div class=" grid grid-cols-3 gap-2">
	<div class="col-span-1 border-e-2 border-gray-600">
		<AllianceList {data} />
	</div>
	<div class="col-span-1 border-e-2 border-gray-600">
		<CorporationList {corps} />
	</div>
	<div class="col-span-1">
		<CharacterList {pilots} />
	</div>
</div>
