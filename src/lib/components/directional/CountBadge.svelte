<script>
	import { Badge, Tooltip } from 'flowbite-svelte';

	/** Small count badge with a hover/focus label ("On Grid" / "Off Grid"). Unique id per instance. */
	let { count, color, label } = $props();
	const uid = $props.id();
	const id = `count-${uid}`;
</script>

<Badge {id} {color} size="xs">{count}</Badge>
<Tooltip triggeredBy="#{id}" placement="top">{label}</Tooltip>
