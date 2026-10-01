/**
 * Mapping memory: corrections the user made in the preview, kept on the
 * target origin with `storage.local`. Keyed by record type and form
 * signature. Every storage access is guarded: storage can be missing,
 * full, blocked or hold garbage, and none of that may break a fill.
 */
import type { StorageManagerAPI } from '../../../types/public-api';
import { logger } from '../../system/Logger.js';

export const MAPPING_STORAGE_KEY = 'agentlet-records-mappings';
const MAX_ENTRIES = 200;

interface StoredMapping {
    map: Record<string, string>;
    updatedAt: number;
}

type MappingStore = Record<string, StoredMapping>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class MappingMemory {
    constructor(private readonly storage: Pick<StorageManagerAPI, 'getJSON' | 'setJSON'> | null) {}

    private readStore(): MappingStore {
        if (!this.storage) return {};
        try {
            const raw = this.storage.getJSON<unknown>(MAPPING_STORAGE_KEY, null, 'localStorage');
            if (!isPlainObject(raw)) return {};
            const store: MappingStore = {};
            for (const id of Object.keys(raw)) {
                const entry = raw[id];
                if (!isPlainObject(entry) || !isPlainObject(entry.map)) continue;
                const map: Record<string, string> = {};
                for (const key of Object.keys(entry.map)) {
                    const selector = entry.map[key];
                    if (typeof selector === 'string' && key !== '__proto__') map[key] = selector;
                }
                store[id] = { map, updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : 0 };
            }
            return store;
        } catch (error) {
            logger.log('Mapping memory could not be read:', (error as Error).message);
            return {};
        }
    }

    private id(typeName: string, signature: string): string {
        return `${typeName}:${signature}`;
    }

    /** Record key to selector, for this record type and form. Empty when nothing is remembered or storage fails. */
    load(typeName: string, signature: string): Record<string, string> {
        return this.readStore()[this.id(typeName, signature)]?.map ?? {};
    }

    /** Merges `corrections` (record key to selector) into what is remembered. Returns false when storage failed. */
    save(typeName: string, signature: string, corrections: Record<string, string>): boolean {
        if (!this.storage || Object.keys(corrections).length === 0) return false;
        try {
            const store = this.readStore();
            const id = this.id(typeName, signature);
            store[id] = { map: { ...(store[id]?.map ?? {}), ...corrections }, updatedAt: Date.now() };
            const ids = Object.keys(store);
            if (ids.length > MAX_ENTRIES) {
                ids.sort((a, b) => store[a].updatedAt - store[b].updatedAt)
                    .slice(0, ids.length - MAX_ENTRIES)
                    .forEach(old => { delete store[old]; });
            }
            this.storage.setJSON(MAPPING_STORAGE_KEY, store, 'localStorage');
            return true;
        } catch (error) {
            logger.log('Mapping memory could not be saved:', (error as Error).message);
            return false;
        }
    }
}
