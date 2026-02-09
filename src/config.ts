import process from 'node:process';

if (!process.env.ALLOWED_ORIGIN) {
  console.warn('WARNING: ALLOWED_ORIGIN not set, CORS will be restrictive');
}

export const config = {
  STORAGE_DIR: process.env.STORAGE_DIR || '/tmp/',
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || 'https://localhost',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
};
