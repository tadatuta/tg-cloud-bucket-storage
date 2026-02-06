import { config } from './config.js';
import { Storage } from './storage.js';
import { validateTelegramInitData, parseTelegramInitData } from './telegram.js';

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
    const { httpMethod, headers, body, path } = event;

    const responseHeaders: Record<string, string> = {
        'Access-Control-Allow-Origin': config.ALLOWED_ORIGIN,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Telegram-Init-Data',
        'Content-Type': 'application/json'
    };

    if (httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: responseHeaders,
        };
    }

    // --- Public Profile Endpoint (no auth required) ---
    // Check for ?profile=<identifier> query parameter
    const profileIdentifier = event.queryStringParameters?.profile;
    if (profileIdentifier && httpMethod === 'GET') {
        const identifier = decodeURIComponent(profileIdentifier);
        try {
            const publicProfile = await Storage.getPublicProfile(identifier);
            if (!publicProfile) {
                return {
                    statusCode: 404,
                    headers: responseHeaders,
                    body: JSON.stringify({ error: 'Not found' }),
                };
            }
            return {
                statusCode: 200,
                headers: responseHeaders,
                body: JSON.stringify(publicProfile),
            };
        } catch (error) {
            console.error('Error fetching public profile:', error);
            return {
                statusCode: 500,
                headers: responseHeaders,
                body: JSON.stringify({ error: 'Internal Server Error' }),
            };
        }
    }

    // --- Auth Required for all other endpoints ---
    const initData = headers['X-Telegram-Init-Data'];
    const isValid = validateTelegramInitData(initData || '');

    if (!isValid) {
        return {
            statusCode: 401,
            headers: responseHeaders,
            body: JSON.stringify({ error: 'Unauthorized' }),
        };
    }

    const { user } = parseTelegramInitData(initData || '');
    const userId = user?.id;

    if (!userId) {
        return {
            statusCode: 400,
            headers: responseHeaders,
            body: JSON.stringify({ error: 'User ID not found in Telegram data' }),
        };
    }

    try {
        if (httpMethod === 'GET') {
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

                // Auto-populate profile with Telegram user info if updating profile
                if (data.profile && user) {
                    data.profile.telegramUserId = user.id;
                    if (user.username && !data.profile.telegramUsername) {
                        data.profile.telegramUsername = user.username;
                    }
                    if (user.photo_url) {
                        data.profile.photoUrl = user.photo_url;
                    }
                }

                await Storage.write(userId, data);
                return {
                    statusCode: 200,
                    headers: responseHeaders,
                    body: JSON.stringify({ success: true }),
                };
            } catch (e) {
                return {
                    statusCode: 400,
                    headers: responseHeaders,
                    body: JSON.stringify({ error: 'Invalid JSON' }),
                };
            }
        }

        return {
            statusCode: 405,
            headers: responseHeaders,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            headers: responseHeaders,
            body: JSON.stringify({ error: 'Internal Server Error' }),
        };
    }
};

