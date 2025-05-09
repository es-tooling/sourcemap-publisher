import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      reporter: ['lcov']
    },
    include: [
      'src/**/*.test.ts'
    ]
  }
});
