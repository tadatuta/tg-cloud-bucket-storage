import { createHash, createHmac } from 'node:crypto';
import { config } from './config.js';

export interface TelegramUser {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
    allows_write_to_pm?: boolean;
}

export function parseTelegramInitData(initData: string): { user?: TelegramUser } {
    const urlParams = new URLSearchParams(initData);
    const userStr = urlParams.get('user');
    if (!userStr) return {};

    try {
        return { user: JSON.parse(userStr) };
    } catch (e) {
        return {};
    }
}

export function validateTelegramInitData(initData: string): boolean {

    if (!config.TELEGRAM_BOT_TOKEN) return false;

    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    urlParams.delete('hash');

    const dataCheckString = Array.from(urlParams.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData')
        .update(config.TELEGRAM_BOT_TOKEN)
        .digest();

    const calculatedHash = createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    return calculatedHash === hash;
}

/**
 * Validates data received from Telegram Login Widget.
 * Uses SHA256(bot_token) as secret key (different from Mini App).
 * See: https://core.telegram.org/widgets/login#checking-authorization
 */
export function validateTelegramLoginWidget(data: Record<string, string>): boolean {
    if (!config.TELEGRAM_BOT_TOKEN) {
        console.error('[telegram] Bot token not configured');
        return false;
    }

    const hash = data['hash'];
    if (!hash) {
        console.warn('[telegram] No hash in login widget data');
        return false;
    }

    // Build data-check-string: sorted key=value pairs joined by \n
    const dataCheckString = Object.keys(data)
        .filter((key) => key !== 'hash')
        .sort()
        .map((key) => `${key}=${data[key]}`)
        .join('\n');

    // Secret key = SHA256(bot_token) — NOT HMAC like in Mini App
    const secretKey = createHash('sha256')
        .update(config.TELEGRAM_BOT_TOKEN)
        .digest();

    const calculatedHash = createHmac('sha256', secretKey)
        .update(dataCheckString)
        .digest('hex');

    const isValid = calculatedHash === hash;
    console.info(`[telegram] Login Widget validation: ${isValid ? 'success' : 'failed'}`);

    // Optional: check auth_date freshness (allow up to 24 hours)
    if (isValid && data['auth_date']) {
        const authDate = parseInt(data['auth_date'], 10);
        const now = Math.floor(Date.now() / 1000);
        if (now - authDate > 86400) {
            console.warn('[telegram] Login Widget data is older than 24 hours');
            return false;
        }
    }

    return isValid;
}

/** Parse Telegram Login Widget data from JSON string */
export function parseTelegramLoginWidgetData(jsonStr: string): { user?: TelegramUser } {
    try {
        const data = JSON.parse(jsonStr) as Record<string, unknown>;
        const id = data['id'];

        if (typeof id !== 'number') return {};

        return {
            user: {
                id: id,
                first_name: (data['first_name'] as string) || '',
                last_name: data['last_name'] as string | undefined,
                username: data['username'] as string | undefined,
            },
        };
    } catch (e) {
        console.error('[telegram] Failed to parse Login Widget data', e);
        return {};
    }
}
