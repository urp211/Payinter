/** Standalone migration runner: npm run migrate */
import { db } from './index';

(async () => {
  await db.init();
  await db.migrate();
  console.log('Migrations applied');
  await db.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
