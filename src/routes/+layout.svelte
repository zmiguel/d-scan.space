<script>
	import '../app.css';
	import { Navbar, NavBrand, NavLi, NavUl, NavHamburger } from 'flowbite-svelte';
	import { DarkMode } from 'flowbite-svelte';
</script>

<div class="relative px-8">
	<Navbar class="px-2 sm:px-4 fixed py-0 w-full z-20 top-0 start-0 border-b">
		<NavBrand href="/">
			<img src="https://flowbite-svelte.com/images/flowbite-svelte-icon-logo.svg" class="me-3 h-6 sm:h-9" alt="Flowbite Logo" />
			<span class="self-center whitespace-nowrap text-xl font-semibold dark:text-white">Flowbite</span>
		</NavBrand>
		<NavHamburger />
		<NavUl>
			<NavLi href="/" active={true}>Home</NavLi>
			<NavLi href="/about">About</NavLi>
			<NavLi href="/docs/components/navbar">Navbar</NavLi>
			<NavLi href="/pricing">Pricing</NavLi>
			<NavLi href="/contact">Contact</NavLi>
			<DarkMode class="p-0"/>
		</NavUl>
	</Navbar>
	<div class="mt-16 mb-8">
		<slot />
	</div>
</div>

