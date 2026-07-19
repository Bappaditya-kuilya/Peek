import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		testTimeout: 30000,
		environment: 'node',
		setupFiles: ['./vitest.setup.ts'],
		pool: 'forks',
		poolOptions: {
			forks: {
				singleFork: true,
				isolate: true,
			},
		},
		sequence: {
			hooks: 'list',
		},
	},
});