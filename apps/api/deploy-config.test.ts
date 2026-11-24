// Release-integrity guard for the Cloudflare Workers Builds entry point.
// The Git-connected build runs `npx wrangler deploy` from the repository root, so /wrangler.toml must
// describe exactly the same Worker as `[env.production]` in apps/api/wrangler.toml (the manual deploy path).
// Kept outside src/ so the Worker typecheck (workers-types only) does not see Node imports.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { unstable_readConfig } from 'wrangler';

const here = dirname(fileURLToPath(import.meta.url));
const rootConfigPath = resolve(here, '../../wrangler.toml');
const apiConfigPath = resolve(here, 'wrangler.toml');

function deployShape(config: ReturnType<typeof unstable_readConfig>) {
  const base = dirname(resolve(config.configPath!));
  return {
    name: config.name,
    main: config.main && resolve(config.main),
    compatibility_date: config.compatibility_date,
    compatibility_flags: config.compatibility_flags,
    account_id: config.account_id,
    workers_dev: config.workers_dev,
    preview_urls: config.preview_urls,
    routes: config.routes,
    vars: config.vars,
    d1_databases: config.d1_databases.map(db => ({ ...db, migrations_dir: db.migrations_dir && resolve(base, db.migrations_dir) })),
    r2_buckets: config.r2_buckets,
    kv_namespaces: config.kv_namespaces,
    durable_objects: config.durable_objects,
    triggers: config.triggers,
  };
}

describe('Cloudflare Workers Builds root config', () => {
  const root = unstable_readConfig({ config: rootConfigPath });
  const production = unstable_readConfig({ config: apiConfigPath, env: 'production' });

  it('targets the production Worker with production-only settings', () => {
    expect(root.name).toBe('fayz-market-api');
    expect(root.vars).toMatchObject({ ENVIRONMENT: 'production' });
    expect(String(root.vars.PUBLIC_BASE_URL)).toMatch(/^https:\/\//);
    expect(root.d1_databases[0]?.database_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('is identical to apps/api [env.production] (no drift between the Git build and the manual deploy)', () => {
    expect(deployShape(root)).toEqual(deployShape(production));
  });

  // Regression (2026-11-25): `npx wrangler deploy --env production` run from the repository root, when the root
  // config had no [env.production], deployed a separate Worker "fayz-market-api-production" bound to the
  // production D1 and R2 instead of updating "fayz-market-api".
  it('root `--env production` updates the same Worker, never a "-production" copy', () => {
    const rootProduction = unstable_readConfig({ config: rootConfigPath, env: 'production' });
    expect(rootProduction.name).toBe('fayz-market-api');
    expect(deployShape(rootProduction)).toEqual(deployShape(production));
  });

  it('every documented deploy command resolves to the one production Worker name', () => {
    const names = [root, unstable_readConfig({ config: rootConfigPath, env: 'production' }), production].map(c => c.name);
    expect(new Set(names)).toEqual(new Set(['fayz-market-api']));
  });

  it('never carries secret values', () => {
    for (const config of [root, unstable_readConfig({ config: rootConfigPath, env: 'production' })]) {
      const secretish = Object.keys(config.vars).filter(key => /SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE/i.test(key));
      expect(secretish).toEqual([]);
    }
  });
});
