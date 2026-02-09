import { config } from './config.js';
import { Storage } from './storage.js';
import { validateTelegramInitData, parseTelegramInitData } from './telegram.js';
import { generateRecommendation } from './ai.js';
import { marked } from 'marked';

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
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
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

            const aiAction = event.queryStringParameters?.action === 'ai';

            if (aiAction) {
                try {
                    const data = JSON.parse(requestBody || '{}');
                    // Fetch full user data to pass to AI
                    const userData = await Storage.read(userId);

                    const recommendation = await generateRecommendation({
                        ...data,
                        profile: userData.profile,
                        logs: userData.logs,
                        workouts: userData.workouts,
                        workoutTypes: userData.workoutTypes
                    });

                    const recommendationHtml = await marked(recommendation);

                    return {
                        statusCode: 200,
                        headers: responseHeaders,
                        body: JSON.stringify({ recommendation: recommendationHtml }),
                    };
                } catch (e) {
                    console.error(e);
                    return {
                        statusCode: 500,
                        headers: responseHeaders,
                        body: JSON.stringify({ error: 'AI Generation Failed' }),
                    };
                }
            } else {
                try {
                    const data = JSON.parse(requestBody || '{}');

                    // Input validation
                    const MAX_NAME_LENGTH = 100;
                    const MAX_LOGS = 10000;
                    const MAX_DISPLAY_NAME = 100;

                    // Validate workout types
                    if (data.workoutTypes) {
                        for (const type of data.workoutTypes) {
                            if (type.name && type.name.length > MAX_NAME_LENGTH) {
                                return {
                                    statusCode: 400,
                                    headers: responseHeaders,
                                    body: JSON.stringify({ error: 'Workout type name too long' }),
                                };
                            }
                        }
                    }

                    // Validate logs count (prevent DoS via massive arrays)
                    if (data.logs && data.logs.length > MAX_LOGS) {
                        return {
                            statusCode: 400,
                            headers: responseHeaders,
                            body: JSON.stringify({ error: 'Too many log entries' }),
                        };
                    }

                    // Validate profile display name
                    if (data.profile?.displayName && data.profile.displayName.length > MAX_DISPLAY_NAME) {
                        return {
                            statusCode: 400,
                            headers: responseHeaders,
                            body: JSON.stringify({ error: 'Display name too long' }),
                        };
                    }

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
