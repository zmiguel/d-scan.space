/** @type { import("eslint").Linter.Config } */
module.exports = {
	root: true,
	extends: ['eslint:recommended', 'plugin:svelte/recommended', 'prettier'],
	parserOptions: {
		sourceType: 'module',
		ecmaVersion: 2020,
		extraFileExtensions: ['.svelte']
	},
	overrides: [
		{
			files: ['**.js'],
			parser: 'espree' // Default parser for JavaScript files
		}
	],
	env: {
		browser: true,
		es2017: true,
		node: true
	}
};
