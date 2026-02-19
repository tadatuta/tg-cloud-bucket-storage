import { config } from './config.js';
import { Storage } from './storage.js';
import {
    validateTelegramInitData,
    parseTelegramInitData,
    validateTelegramLoginWidget,
    parseTelegramLoginWidgetData,
} from './telegram.js';

interface YcfEvent {
    httpMethod: string;
    headers: Record<string, string>;
    url: string;
    queryStringParameters: Record<string, string>;
    path: string;
    pathParameters: Record<string, string>;
    body: string;
    isBase64Encoded: boolean;
}

interface YcfResponse {
    statusCode: number;
    headers?: Record<string, string>;
    body?: string;
}

export const handler = async (event: YcfEvent): Promise<YcfResponse> => {
    const { httpMethod, headers, body } = event;

    console.info(`[handler] ${httpMethod} request received`);

    const responseHeaders: Record<string, string> = {
        'Access-Control-Allow-Origin': config.ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data, X-Telegram-Auth-Data',
        'Content-Type': 'application/json'
    };

    if (httpMethod === 'OPTIONS') {
        console.info('[handler] CORS preflight response');
        return {
            statusCode: 204,
            headers: responseHeaders,
        };
    }

    // Auth Validation — try Login Widget first, then Mini App initData
    let userId: number | undefined;

    const loginWidgetData = headers['X-Telegram-Auth-Data'] || headers['x-telegram-auth-data'];
    const initData = headers['X-Telegram-Init-Data'] || headers['x-telegram-init-data'];

    if (loginWidgetData) {
        // Telegram Login Widget auth
        console.info('[handler] Authenticating via Login Widget');
        try {
            const widgetData = JSON.parse(loginWidgetData) as Record<string, string>;
            const isValid = validateTelegramLoginWidget(widgetData);

            if (!isValid) {
                console.warn('[handler] Login Widget validation failed');
                return {
                    statusCode: 401,
                    headers: responseHeaders,
                    body: JSON.stringify({ error: 'Unauthorized' }),
                };
            }

            const { user } = parseTelegramLoginWidgetData(loginWidgetData);
            userId = user?.id;
        } catch (e) {
            console.error('[handler] Failed to parse Login Widget data', e);
            return {
                statusCode: 401,
                headers: responseHeaders,
                body: JSON.stringify({ error: 'Invalid auth data' }),
            };
        }
    } else if (initData) {
        // Mini App initData auth (legacy support)
        console.info('[handler] Authenticating via Mini App initData');
        const isValid = validateTelegramInitData(initData);

        if (!isValid && config.TELEGRAM_BOT_TOKEN !== 'dummy_token') {
            console.warn('[handler] Mini App initData validation failed');
            return {
                statusCode: 401,
                headers: responseHeaders,
                body: JSON.stringify({ error: 'Unauthorized' }),
            };
        }

        const { user } = parseTelegramInitData(initData);
        userId = user?.id;
    } else {
        console.warn('[handler] No auth data provided');
        return {
            statusCode: 401,
            headers: responseHeaders,
            body: JSON.stringify({ error: 'No authentication data provided' }),
        };
    }

    if (!userId) {
        console.warn('[handler] User ID not found in auth data');
        return {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: 'User ID not found in Telegram data' }),
        };
    }

    console.info(`[handler] Authenticated user: ${userId}`);

    try {
        if (httpMethod === 'GET') {
            console.info(`[handler] Reading data for user ${userId}`);
            const data = await Storage.read(userId);

            return {
                statusCode: 200,
                headers: responseHeaders,
                body: JSON.stringify(data),
            };
        } else if (httpMethod === 'POST') {
            let requestBody = body;
            if (event.isBase64Encoded) {
                requestBody = Buffer.from(body, 'base64').toString('utf-8');
            }

            try {
                const data = JSON.parse(requestBody || '{}');
                console.info(`[handler] Writing data for user ${userId}`);
                await Storage.write(userId, data);
                return {
                    statusCode: 200,
                    headers: responseHeaders,
                    body: JSON.stringify({ success: true }),
                };
            } catch (e) {
                console.error('[handler] Invalid JSON in request body', e);
                return {
                    statusCode: 400,
                    headers: responseHeaders,
                    body: JSON.stringify({ error: 'Invalid JSON' }),
                };
            }
        }

        console.warn(`[handler] Method not allowed: ${httpMethod}`);
        return {
            statusCode: 405,
            headers: responseHeaders,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    } catch (error) {
        console.error('[handler] Internal error:', error);
        return {
            statusCode: 500,
            headers: responseHeaders,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
};

