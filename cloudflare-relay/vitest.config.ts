import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		testTimeout: 30000,
		pool: '@cloudflare/vitest-pool-workers',
		workers: {
			wrangler: { configPath: './wrangler.toml' },
		},
	},
});