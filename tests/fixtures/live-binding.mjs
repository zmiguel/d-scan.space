// An export reassigned after import, like SvelteKit's `private_env` (set by Server.init).
export let value = 'initial';

export function update(next) {
	value = next;
}
