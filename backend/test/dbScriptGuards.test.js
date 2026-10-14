import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const backendRoot = fileURLToPath(new URL('..', import.meta.url))

function runGuardedScript(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: backendRoot,
    encoding: 'utf8',
    timeout: 5000,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      API_JWT_SECRET: 'test-only-secret-for-script-guard-tests',
      MYSQL_HOST: '127.0.0.1',
      MYSQL_PORT: '3306',
      MYSQL_USER: 'test-only-user',
      MYSQL_PASSWORD: 'test-only-password',
      MYSQL_DATABASE: 'not_the_development_database',
      DEMO_SEED_ENABLED: '1',
    },
  })
  return `${result.stdout}${result.stderr}`
}

test('migration script refuses an unapproved target database before connecting', () => {
  assert.match(runGuardedScript('scripts/migrate.js'), /Migration is restricted to NODE_ENV=development/)
})

test('demo seed refuses an unapproved target database before connecting', () => {
  assert.match(runGuardedScript('scripts/seed-demo.js'), /Demo seed is restricted to railway_reservation_dev/)
})

test('demo admin promotion refuses an unapproved target database before prompting', () => {
  assert.match(runGuardedScript('scripts/promote-demo-admin.js', ['admin@example.test']), /restricted to railway_reservation_dev development database/)
})
