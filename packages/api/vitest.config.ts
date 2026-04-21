import { defineConfig } from 'vitest/config'

const testDb = process.env.TEST_DATABASE_URL
  ?? 'postgresql://castle:CHANGE-ME@localhost:5433/castle_budget_test'

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 15000,
    setupFiles: ['./test/setup.ts'],
    // Tests share one Postgres test DB; parallel workers would race on the
    // per-test TRUNCATE in setup.ts and corrupt each other's state.
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL: testDb,
      DATABASE_URL: testDb,
      JWT_SECRET: 'test-jwt-secret',
      COOKIE_SECRET: 'test-cookie-secret',
      NODE_ENV: 'test',
    },
  },
})
