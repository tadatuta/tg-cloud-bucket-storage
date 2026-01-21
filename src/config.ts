import process from 'node:process';

export const config = {
  STORAGE_DIR: process.env.STORAGE_DIR || '/tmp/',
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN || '*',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
};
