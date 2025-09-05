<script>
	import { Avatar } from 'flowbite-svelte';

	let { pilots } = $props();

	const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
	const lerp = (a, b, t) => a + (b - a) * t;
	const hslToString = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
	const mixHsl = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

	function secStatusColor(value) {
		const v = clamp(value, -10, 5);
		// endpoints: red (-10), gray (0), green (5)
		const red = [0, 75, 45];
		const gray = [0, 0, 50];
		const green = [140, 65, 40];

		if (v === 0) {
			return hslToString(...gray);
		}

		if (v < 0) {
			// Ease to be less gray near small negatives
			const tLinear = (v + 10) / 10; // -10 -> 0, 0 -> 1
			const t = Math.pow(tLinear, 3); // push towards red for values near 0
			const [h, s, l] = mixHsl(red, gray, t);
			return hslToString(h, s, l);
		} else {
			// Ease to be less gray near small positives
			const tLinear = v / 5; // 0 -> 0, 5 -> 1
			const t = Math.pow(tLinear, 1 / 3); // pull towards green for values near 0
			const [h, s, l] = mixHsl(gray, green, t);
			return hslToString(h, s, l);
		}
	}
</script>

<h1 class="ms-2 text-xl font-bold">Pilots</h1>
<div class="col-auto mt-2">
	{#each pilots as pilot (pilot.id)}
		<div class="flex flex-col items-start justify-between sm:flex-row sm:items-center">
			<div class="mt-1 flex items-center space-x-4 rtl:space-x-reverse">
				<Avatar
					cornerStyle="rounded"
					src="https://images.evetech.net/characters/{pilot.id}/portrait?size=64"
				/>
				<div class="font-medium dark:text-white">
					<div>
						{pilot.name}
						<span style:color={secStatusColor(pilot.sec_status)}>{pilot.sec_status.toFixed(3)}</span
						>
					</div>
					<div>
						{#if pilot.alliance_ticker}
							<span class="text-pink-600 dark:text-pink-400">[{pilot.alliance_ticker}]</span>
						{/if}
						<span class="text-primary-700 dark:text-primary-400"
							>{'<' + pilot.corporation_ticker + '>'}</span
						>
					</div>
				</div>
			</div>
		</div>
	{/each}
</div>
