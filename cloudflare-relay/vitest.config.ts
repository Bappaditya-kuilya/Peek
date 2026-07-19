import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		testTimeout: 30000,
		environment: 'miniflare',
		miniflare: {
			modules: true,
			scriptPath: './src/index.ts',
			durableObjects: {
				PEEK_SESSION: 'PeekSession',
			},
			compatibilityDate: '2024-07-17',
			compatibilityFlags: ['nodejs_compat'],
		},
	},
});