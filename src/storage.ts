import fs from 'node:fs/promises';
import { config } from './config.js';

export interface StorageData {
    [key: string]: any;
}

export class Storage {
    static async read(userId: string | number): Promise<StorageData> {
        try {
            const content = await fs.readFile(`${config.STORAGE_DIR}/${userId}.json`, 'utf-8');
            return JSON.parse(content);
        } catch (e) { }

        return {};
    }

    static async write(userId: string | number, data: StorageData): Promise<void> {
        await fs.writeFile(`${config.STORAGE_DIR}/${userId}.json`, JSON.stringify(data));
    }
}

