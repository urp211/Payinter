/**
 * Boot: init DB (PGlite embedded or Postgres), apply migrations,
 * optionally seed demo data, start HTTP listener.
 */
import { config } from './config';
import { db } from './db';
import { seedDemoDataIfEmpty } from './db/seed';
import { buildApp } from './app';

async function main() {
  await db.init();
  await db.migrate();

  if (config.seed.demoData && config.demoMode) {
    await seedDemoDataIfEmpty(db);
  }

  const app = buildApp();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(JSON.stringify({
      msg: 'payinter-api listening',
      port: config.port,
      environment: config.demoMode ? 'sandbox' : 'production',
      db: db.isPg ? 'postgres' : 'pglite-embedded',
      demoMode: config.demoMode
    }));
  });
}

main().catch((e) => {
  console.error('boot failed', e);
  process.exit(1);
});
