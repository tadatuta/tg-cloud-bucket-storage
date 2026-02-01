import fs from 'node:fs/promises';
import { config } from './config.js';

export interface StorageData {
    workoutTypes?: { id: string; name: string }[];
    logs?: { id: string; workoutTypeId: string; reps: number; weight: number; date: string }[];
    profile?: {
        isPublic: boolean;
        displayName?: string;
        telegramUsername?: string;
        telegramUserId: number;
        createdAt: string;
    };
    [key: string]: any;
}

export interface PublicProfileData {
    displayName: string;
    identifier: string;
    stats: {
        totalWorkouts: number;
        totalVolume: number;
        favoriteExercise?: string;
        lastWorkoutDate?: string;
    };
    recentActivity: { date: string; exerciseCount: number }[];
}

interface UsernameIndex {
    [username: string]: string | number; // username -> userId
}

export class Storage {
    private static INDEX_FILE = `${config.STORAGE_DIR}/username_index.json`;

    static async read(userId: string | number): Promise<StorageData> {
        try {
            const content = await fs.readFile(`${config.STORAGE_DIR}/${userId}.json`, 'utf-8');
            return JSON.parse(content);
        } catch (e) { }

        return {};
    }

    static async write(userId: string | number, data: StorageData): Promise<void> {
        await fs.writeFile(`${config.STORAGE_DIR}/${userId}.json`, JSON.stringify(data));

        // Update username index if profile has username
        if (data.profile?.telegramUsername) {
            await this.updateUsernameIndex(data.profile.telegramUsername, userId);
        }
    }

    static async updateUsernameIndex(username: string, userId: string | number): Promise<void> {
        const index = await this.readUsernameIndex();
        index[username.toLowerCase()] = userId;
        await fs.writeFile(this.INDEX_FILE, JSON.stringify(index));
    }

    static async readUsernameIndex(): Promise<UsernameIndex> {
        try {
            const content = await fs.readFile(this.INDEX_FILE, 'utf-8');
            return JSON.parse(content);
        } catch (e) {
            return {};
        }
    }

    static async findUserIdByIdentifier(identifier: string): Promise<string | number | null> {
        // Check if it's an id_XXX format
        if (identifier.startsWith('id_')) {
            return identifier.replace('id_', '');
        }

        // Look up by username
        const index = await this.readUsernameIndex();
        return index[identifier.toLowerCase()] || null;
    }

    static async getPublicProfile(identifier: string): Promise<PublicProfileData | null> {
        const userId = await this.findUserIdByIdentifier(identifier);
        if (!userId) return null;

        const data = await this.read(userId);
        if (!data.profile?.isPublic) return null;

        const logs = data.logs || [];
        const workoutTypes = data.workoutTypes || [];

        // Calculate stats
        const totalVolume = logs.reduce((acc, l) => acc + (l.weight * l.reps), 0);
        const uniqueDays = new Set(logs.map(l => l.date.split('T')[0]));

        // Find favorite exercise (most logged)
        const exerciseCounts: Record<string, number> = {};
        logs.forEach(l => {
            exerciseCounts[l.workoutTypeId] = (exerciseCounts[l.workoutTypeId] || 0) + 1;
        });
        const favoriteTypeId = Object.entries(exerciseCounts)
            .sort(([, a], [, b]) => b - a)[0]?.[0];
        const favoriteExercise = workoutTypes.find(t => t.id === favoriteTypeId)?.name;

        // Get last workout date
        const sortedLogs = [...logs].sort((a, b) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        );
        const lastWorkoutDate = sortedLogs[0]?.date;

        // Recent activity (last 7 days with workouts)
        const recentDays: Record<string, number> = {};
        sortedLogs.slice(0, 100).forEach(l => {
            const day = l.date.split('T')[0];
            recentDays[day] = (recentDays[day] || 0) + 1;
        });
        const recentActivity = Object.entries(recentDays)
            .slice(0, 7)
            .map(([date, count]) => ({ date, exerciseCount: count }));

        return {
            displayName: data.profile.displayName || data.profile.telegramUsername || `User ${userId}`,
            identifier: data.profile.telegramUsername || `id_${userId}`,
            stats: {
                totalWorkouts: uniqueDays.size,
                totalVolume,
                favoriteExercise,
                lastWorkoutDate,
            },
            recentActivity,
        };
    }
}

