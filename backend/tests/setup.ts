/**
 * Vitest shared env: each test file runs in its own worker (vitest default),
 * so a per-file temp PGlite dir gives every file an isolated database.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.NODE_ENV = 'test';
process.env.DEMO_MODE = '1';
process.env.BCRYPT_ROUNDS = '4';
process.env.JWT_SECRET = 'test_access_secret_key_0123456789abcdef';
process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_0123456789ab';
process.env.PIN_PEPPER = 'test_pin_pepper';
process.env.QR_SIGNING_SECRET = 'test_qr_signing_key';
process.env.DATA_ENCRYPTION_KEY = 'test_data_enc_key';
process.env.DB_EMBEDDED_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'payinter-test-'))
  + path.sep + 'db';
process.env.MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'database', 'migrations');
process.env.SEED_DEMO_DATA = '1';
process.env.DEMO_USER_PASSWORD = 'TestUser123!';
process.env.ADMIN_PASSWORD = 'TestAdmin123!';
