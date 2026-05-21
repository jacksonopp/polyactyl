// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://jacksonopp.github.io',
	base: 'polyactyl',
	integrations: [
		starlight({
			title: 'Polyactyl',
			description: 'Desktop HTTP client powered by httpYac — documentation.',
			logo: {
				src: './public/polyactyl.png',
				alt: 'Polyactyl',
			},
			favicon: '/polyactyl.png',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/jacksonopp/polyactyl',
				},
			],
			customCss: ['./src/styles/custom.css'],
			defaultLocale: 'root',
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'guides/introduction' },
						{ label: 'Installation', slug: 'guides/installation' },
					],
				},
				{
					label: 'Features',
					items: [
						{ label: 'File Browser', slug: 'guides/file-browser' },
						{ label: 'Editor', slug: 'guides/editor' },
						{ label: 'Request Runner', slug: 'guides/request-runner' },
						{ label: 'Response Viewer', slug: 'guides/response-viewer' },
						{ label: 'Environments', slug: 'guides/environments' },
						{ label: 'Git Integration', slug: 'guides/git-integration' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Keyboard Shortcuts', slug: 'reference/keyboard-shortcuts' },
						{ label: 'httpYac Syntax', slug: 'reference/httpyac-syntax' },
					],
				},
			],
		}),
	],
});
