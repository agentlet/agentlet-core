/**
 * StorageManager - Enhanced localStorage and sessionStorage management with change detection
 * Provides storage operations and change subscription capabilities for both localStorage and sessionStorage
 */
import type {
    StorageManagerAPI,
    StorageStatistics,
    StorageType,
    BoundStorageAPI
} from '../../types/public-api';
import { logger } from '../system/Logger.js';

/** A single storage change-listener callback, matching {@link StorageManagerAPI}. */
type StorageChangeListener = (
    storageType: StorageType,
    key: string | null,
    newValue: string | null,
    oldValue: string | null
) => void;

/**
 * The three native `Storage` methods this file patches for same-tab change
 * detection. Stored together in one `Map<string, StorageOriginalMethod>`
 * (keyed by `` `${storageType}_setItem` `` etc.) since the arities differ; retrieval sites cast back to the
 * specific member they know they stored, mirroring how `ScriptInjector.ts`
 * uses narrow `as` casts around dynamic/untyped access rather than `any`.
 */
type StorageOriginalMethod = Storage['setItem'] | Storage['removeItem'] | Storage['clear'];

export default class StorageManager implements StorageManagerAPI {
    listeners: Map<StorageType, Set<StorageChangeListener>>;
    storageSnapshot: Map<StorageType, Map<string, string>>;
    originalMethods: Map<string, StorageOriginalMethod>;
    /** Bound reference to the `storage` event listener, so `cleanup()` can remove exactly it. */
    boundStorageEventListener: ((event: StorageEvent) => void) | null;

    constructor() {
        this.listeners = new Map(); // Map of storage type to Set of listeners
        this.storageSnapshot = new Map(); // Map of storage type to Map of key-value pairs
        this.originalMethods = new Map();
        this.boundStorageEventListener = null;

        // Initialize listeners and snapshots for both storage types
        this.listeners.set('localStorage', new Set());
        this.listeners.set('sessionStorage', new Set());
        this.storageSnapshot.set('localStorage', new Map());
        this.storageSnapshot.set('sessionStorage', new Map());

        // Take initial snapshots
        this.updateSnapshot('localStorage');
        this.updateSnapshot('sessionStorage');

        // Listen for storage events (changes from other tabs/windows). This
        // is a plain `addEventListener()`, not a monkey-patch: it has no
        // effect at all on the host page's own reads/writes, so - unlike
        // `overrideStorageMethods()` below - it is safe to always install.
        this.setupStorageEventListener();

        // Native Storage methods (`setItem`/`removeItem`/`clear`) are NOT
        // patched here anymore. Patching them globally rewrites how the
        // *host page's own code* behaves (see the module doc comment at the
        // top of this file) even when nothing ever calls
        // `addChangeListener()` - most agentlet-core embeds never do.
        // `addChangeListener()`/`removeChangeListener()` below install and
        // remove the patch lazily instead, per storage type, only while at
        // least one listener is registered for that type; `cleanup()`
        // restores anything still patched.
        logger.log('StorageManager initialized');
    }

    /**
     * Get a value from storage
     * @param key - Storage key
     * @param defaultValue - Default value if key doesn't exist
     * @param storageType - 'localStorage' or 'sessionStorage'
     * @returns Storage value
     */
    get(key: string, defaultValue: string | null | undefined = undefined, storageType: StorageType = 'localStorage'): string | null | undefined {
        if (!key || typeof key !== 'string') {
            throw new Error('Storage key must be a non-empty string');
        }

        this.validateStorageType(storageType);

        try {
            const storage = this.getStorage(storageType);
            const value = storage.getItem(key);
            return value !== null ? value : defaultValue;
        } catch (error) {
            console.error(`Failed to get ${storageType} item:`, error);
            return defaultValue;
        }
    }

    /**
     * Set a value in storage
     * @param key - Storage key
     * @param value - Storage value
     * @param storageType - 'localStorage' or 'sessionStorage'
     */
    set(key: string, value: string, storageType: StorageType = 'localStorage'): void {
        if (!key || typeof key !== 'string') {
            throw new Error('Storage key must be a non-empty string');
        }

        if (value === null || value === undefined) {
            throw new Error('Storage value cannot be null or undefined');
        }

        this.validateStorageType(storageType);

        try {
            const storage = this.getStorage(storageType);
            const oldValue = storage.getItem(key);
            const stringValue = String(value);

            storage.setItem(key, stringValue);

            // Update snapshot and notify listeners
            this.updateSnapshot(storageType);
            this.notifyChange(storageType, key, stringValue, oldValue);

            logger.log(`${storageType} set: ${key} = ${this.maskSensitive(key, stringValue)}`);
        } catch (error) {
            console.error(`Failed to set ${storageType} item:`, error);
            throw new Error(`Failed to set ${storageType} item: ${(error as Error).message}`);
        }
    }

    /**
     * Remove a value from storage
     * @param key - Storage key
     * @param storageType - 'localStorage' or 'sessionStorage'
     * @returns True if item was removed
     */
    remove(key: string, storageType: StorageType = 'localStorage'): boolean {
        if (!key || typeof key !== 'string') {
            throw new Error('Storage key must be a non-empty string');
        }

        this.validateStorageType(storageType);

        try {
            const storage = this.getStorage(storageType);
            const oldValue = storage.getItem(key);

            if (oldValue !== null) {
                storage.removeItem(key);

                // Update snapshot and notify listeners
                this.updateSnapshot(storageType);
                this.notifyChange(storageType, key, null, oldValue);

                logger.log(`${storageType} removed: ${key}`);
                return true;
            }

            return false;
        } catch (error) {
            console.error(`Failed to remove ${storageType} item:`, error);
            throw new Error(`Failed to remove ${storageType} item: ${(error as Error).message}`);
        }
    }

    /**
     * Check if a key exists in storage
     * @param key - Storage key
     * @param storageType - 'localStorage' or 'sessionStorage'
     * @returns True if key exists
     */
    has(key: string, storageType: StorageType = 'localStorage'): boolean {
        this.validateStorageType(storageType);

        try {
            const storage = this.getStorage(storageType);
            return storage.getItem(key) !== null;
        } catch (error) {
            console.error(`Failed to check ${storageType} item:`, error);
            return false;
        }
    }

    /**
     * Clear all items from storage
     * @param storageType - 'localStorage' or 'sessionStorage'
     * @returns Number of items cleared
     */
    clear(storageType: StorageType = 'localStorage'): number {
        this.validateStorageType(storageType);

        try {
            const storage = this.getStorage(storageType);
            const count = storage.length;

            storage.clear();

            // Update snapshot and notify listeners
            this.updateSnapshot(storageType);
            this.notifyChange(storageType, '*', null, null);

            logger.log(`${storageType} cleared: ${count} items`);
            return count;
        } catch (error) {
            console.error(`Failed to clear ${storageType}:`, error);
            throw new Error(`Failed to clear ${storageType}: ${(error as Error).message}`);
        }
    }

    /**
     * Get all items from storage
     * @param storageType - 'localStorage' or 'sessionStorage'
     * @param includeSensitive - Whether to include sensitive values
     * @returns Object containing all storage items
     */
    getAll(storageType: StorageType = 'localStorage', includeSensitive = false): Record<string, string> {
        this.validateStorageType(storageType);

        try {
            const storage = this.getStorage(storageType);
            const items: Record<string, string> = {};

            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i)!; // i < storage.length guarantees a key exists here
                const value = storage.getItem(key)!; // key was just enumerated, so a value exists
                items[key] = includeSensitive ? value : this.maskSensitive(key, value);
            }

            return items;
        } catch (error) {
            console.error(`Failed to get all ${storageType} items:`, error);
            return {};
        }
    }

    /**
     * Get items matching a pattern
     * @param pattern - Pattern to match keys
     * @param storageType - 'localStorage' or 'sessionStorage'
     * @returns Object containing matching items
     */
    getMatching(pattern: string | RegExp, storageType: StorageType = 'localStorage'): Record<string, string> {
        this.validateStorageType(storageType);

        const allItems = this.getAll(storageType, true);
        const matching: Record<string, string> = {};

        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);

        Object.entries(allItems).forEach(([key, value]) => {
            if (regex.test(key)) {
                matching[key] = value;
            }
        });

        return matching;
    }

    /**
     * Get and parse JSON value from storage
     * @param key - Storage key
     * @param defaultValue - Default value if key doesn't exist or parsing fails
     * @param storageType - 'localStorage' or 'sessionStorage'
     * @returns Parsed JSON value
     */
    getJSON<T = unknown>(key: string, defaultValue: T | null = null, storageType: StorageType = 'localStorage'): T | null {
        const value = this.get(key, null, storageType);

        if (value === null) {
            return defaultValue;
        }

        try {
            // `get(key, null, ...)` only returns `undefined` when its own
            // defaultValue argument is `undefined` - since we pass `null`
            // above and already excluded `null` itself, `value` is a string here.
            return JSON.parse(value as string) as T;
        } catch (error) {
            console.error(`Failed to parse JSON for key ${key}:`, error);
            return defaultValue;
        }
    }

    /**
     * Set JSON value in storage
     * @param key - Storage key
     * @param value - Value to stringify and store
     * @param storageType - 'localStorage' or 'sessionStorage'
     */
    setJSON(key: string, value: unknown, storageType: StorageType = 'localStorage'): void {
        try {
            const jsonString = JSON.stringify(value);
            this.set(key, jsonString, storageType);
        } catch (error) {
            console.error(`Failed to stringify JSON for key ${key}:`, error);
            throw new Error(`Failed to stringify JSON for key ${key}: ${(error as Error).message}`);
        }
    }

    /**
     * Set multiple items at once
     * @param items - Object containing key-value pairs
     * @param storageType - 'localStorage' or 'sessionStorage'
     */
    setMultiple(items: Record<string, string>, storageType: StorageType = 'localStorage'): void {
        if (typeof items !== 'object' || items === null) {
            throw new Error('Items must be an object');
        }

        Object.entries(items).forEach(([key, value]) => {
            this.set(key, value, storageType);
        });
    }

    /**
     * Add a change listener. Lazily patches `localStorage`/`sessionStorage`'s
     * `setItem`/`removeItem`/`clear` for the affected type(s) the first time
     * a listener is registered for that type - same-tab writes can only be
     * observed by intercepting them, but that side effect on the host page
     * only exists while a caller has actually opted into it here.
     * @param callback - Callback function (storageType, key, newValue, oldValue) => void
     * @param storageType - 'localStorage', 'sessionStorage', or 'both'
     */
    addChangeListener(callback: StorageChangeListener, storageType: StorageType | 'both' = 'both'): void {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        if (storageType === 'both') {
            this.ensurePatched('localStorage');
            this.ensurePatched('sessionStorage');
            this.listeners.get('localStorage')!.add(callback);
            this.listeners.get('sessionStorage')!.add(callback);
        } else {
            this.validateStorageType(storageType);
            this.ensurePatched(storageType);
            this.listeners.get(storageType)!.add(callback);
        }

        logger.log(`Storage change listener added for ${storageType}`);
    }

    /**
     * Remove a change listener. Once the last listener for a storage type is
     * removed, that type's native methods are restored (see
     * `maybeUnpatch()`) - mirroring `addChangeListener()`'s lazy install.
     * @param callback - Callback function to remove
     * @param storageType - 'localStorage', 'sessionStorage', or 'both'
     */
    removeChangeListener(callback: StorageChangeListener, storageType: StorageType | 'both' = 'both'): boolean {
        let removed = false;

        if (storageType === 'both') {
            removed = this.listeners.get('localStorage')!.delete(callback) || removed;
            removed = this.listeners.get('sessionStorage')!.delete(callback) || removed;
            this.maybeUnpatch('localStorage');
            this.maybeUnpatch('sessionStorage');
        } else {
            this.validateStorageType(storageType);
            removed = this.listeners.get(storageType)!.delete(callback);
            this.maybeUnpatch(storageType);
        }

        if (removed) {
            logger.log(`Storage change listener removed for ${storageType}`);
        }

        return removed;
    }

    /**
     * Patches one storage type's `setItem`/`removeItem`/`clear` for same-tab
     * change detection, if not already patched. Called lazily by
     * `addChangeListener()` rather than unconditionally from the
     * constructor - see the constructor's comment.
     * @private
     */
    ensurePatched(storageType: StorageType): void {
        if (this.originalMethods.has(`${storageType}_setItem`)) {
            return; // Already patched for this type.
        }

        const storage = this.getStorage(storageType);
        if (!storage) return;

        // Store original methods
        this.originalMethods.set(`${storageType}_setItem`, storage.setItem.bind(storage));
        this.originalMethods.set(`${storageType}_removeItem`, storage.removeItem.bind(storage));
        this.originalMethods.set(`${storageType}_clear`, storage.clear.bind(storage));

        // Override setItem
        storage.setItem = (key: string, value: string): void => {
            const oldValue = storage.getItem(key);
            // Retrieved by the key it was stored under above, so this is really a Storage['setItem'].
            (this.originalMethods.get(`${storageType}_setItem`) as Storage['setItem'])(key, value);
            this.handleStorageChange(storageType, key, value, oldValue);
        };

        // Override removeItem
        storage.removeItem = (key: string): void => {
            const oldValue = storage.getItem(key);
            (this.originalMethods.get(`${storageType}_removeItem`) as Storage['removeItem'])(key);
            this.handleStorageChange(storageType, key, null, oldValue);
        };

        // Override clear
        storage.clear = (): void => {
            (this.originalMethods.get(`${storageType}_clear`) as Storage['clear'])();
            this.handleStorageChange(storageType, '*', null, null);
        };

        logger.log(`Storage methods overridden for change detection (${storageType})`);
    }

    /**
     * Restores one storage type's native `setItem`/`removeItem`/`clear` once
     * nothing is listening for its changes any more. No-op if that type
     * isn't currently patched, or still has listeners.
     * @private
     */
    maybeUnpatch(storageType: StorageType): void {
        if (this.listeners.get(storageType)!.size > 0) {
            return; // Still in use.
        }
        if (!this.originalMethods.has(`${storageType}_setItem`)) {
            return; // Not patched.
        }

        const storage = this.getStorage(storageType);
        if (storage) {
            storage.setItem = this.originalMethods.get(`${storageType}_setItem`) as Storage['setItem'];
            storage.removeItem = this.originalMethods.get(`${storageType}_removeItem`) as Storage['removeItem'];
            storage.clear = this.originalMethods.get(`${storageType}_clear`) as Storage['clear'];
        }

        this.originalMethods.delete(`${storageType}_setItem`);
        this.originalMethods.delete(`${storageType}_removeItem`);
        this.originalMethods.delete(`${storageType}_clear`);

        logger.log(`Storage methods restored, no more listeners (${storageType})`);
    }

    /**
     * Set up storage event listener for cross-tab changes. A plain
     * `addEventListener()`, not a monkey-patch (see the constructor's
     * comment) - always installed, and removed again in `cleanup()`.
     * @private
     */
    setupStorageEventListener(): void {
        this.boundStorageEventListener = (event: StorageEvent): void => {
            // Storage events only fire for changes from other tabs/windows
            const storageType: StorageType = event.storageArea === localStorage ? 'localStorage' : 'sessionStorage';
            this.handleStorageChange(storageType, event.key, event.newValue, event.oldValue);
        };
        window.addEventListener('storage', this.boundStorageEventListener);

        logger.log('Storage event listener set up for cross-tab change detection');
    }

    /**
     * Handle storage changes
     * @private
     */
    handleStorageChange(storageType: StorageType, key: string | null, newValue: string | null, oldValue: string | null): void {
        // Update snapshot
        this.updateSnapshot(storageType);

        // Notify listeners
        this.notifyChange(storageType, key, newValue, oldValue);
    }

    /**
     * Update storage snapshot
     * @private
     */
    updateSnapshot(storageType: StorageType): void {
        const storage = this.getStorage(storageType);
        const snapshot = new Map<string, string>();

        if (storage) {
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i)!; // i < storage.length guarantees a key exists here
                const value = storage.getItem(key)!; // key was just enumerated, so a value exists
                snapshot.set(key, value);
            }
        }

        this.storageSnapshot.set(storageType, snapshot);
    }

    /**
     * Notify all listeners of a change
     * @private
     */
    notifyChange(storageType: StorageType, key: string | null, newValue: string | null, oldValue: string | null): void {
        const listeners = this.listeners.get(storageType);

        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(storageType, key, newValue, oldValue);
                } catch (error) {
                    console.error(`Error in ${storageType} change listener:`, error);
                }
            });
        }
    }

    /**
     * Get storage object
     * @private
     */
    getStorage(storageType: StorageType): Storage {
        switch (storageType) {
        case 'localStorage':
            return window.localStorage;
        case 'sessionStorage':
            return window.sessionStorage;
        default:
            throw new Error(`Invalid storage type: ${storageType}`);
        }
    }

    /**
     * Validate storage type
     * @private
     */
    validateStorageType(storageType: StorageType): void {
        if (!['localStorage', 'sessionStorage'].includes(storageType)) {
            throw new Error(`Invalid storage type: ${storageType}. Must be 'localStorage' or 'sessionStorage'`);
        }
    }

    /**
     * Mask sensitive values for logging
     * @private
     */
    maskSensitive(key: string, value: string): string {
        const sensitiveKeys = ['password', 'secret', 'token', 'key', 'auth', 'session'];
        const isSensitive = sensitiveKeys.some(sensitive =>
            key.toLowerCase().includes(sensitive)
        );

        if (isSensitive && value && value.length > 4) {
            return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
        }

        return value;
    }

    /**
     * Get statistics about storage
     * @param storageType - 'localStorage' or 'sessionStorage'
     * @returns Statistics object
     */
    getStatistics(storageType: StorageType = 'localStorage'): StorageStatistics {
        this.validateStorageType(storageType);

        try {
            const storage = this.getStorage(storageType);
            const items = this.getAll(storageType, false);
            const keys = Object.keys(items);

            // Calculate total size
            let totalSize = 0;
            keys.forEach(key => {
                totalSize += key.length + (storage.getItem(key) || '').length;
            });

            return {
                type: storageType,
                total: keys.length,
                totalSize: totalSize,
                averageSize: keys.length > 0 ? Math.round(totalSize / keys.length) : 0,
                keys: keys.sort(),
                listeners: this.listeners.get(storageType)!.size,
                available: !!storage
            };
        } catch (error) {
            console.error(`Failed to get ${storageType} statistics:`, error);
            return {
                type: storageType,
                total: 0,
                totalSize: 0,
                averageSize: 0,
                keys: [],
                listeners: 0,
                available: false,
                error: (error as Error).message
            };
        }
    }

    /**
     * Export storage data in various formats
     * @param format - Export format ('json', 'csv', 'tsv')
     * @param storageType - 'localStorage' or 'sessionStorage'
     * @param includeSensitive - Whether to include sensitive values
     * @returns Formatted export string
     */
    export(format = 'json', storageType: StorageType = 'localStorage', includeSensitive = false): string {
        this.validateStorageType(storageType);

        const data = this.getAll(storageType, includeSensitive);

        switch (format.toLowerCase()) {
        case 'json':
            return JSON.stringify(data, null, 2);

        case 'csv': {
            const csvRows = ['Key,Value'];
            Object.entries(data).forEach(([key, value]) => {
                // Escape quotes and wrap in quotes if contains comma/quote
                const escapedKey = key.includes(',') || key.includes('"') ? `"${key.replace(/"/g, '""')}"` : key;
                const escapedValue = value.includes(',') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
                csvRows.push(`${escapedKey},${escapedValue}`);
            });
            return csvRows.join('\n');
        }

        case 'tsv': {
            const tsvRows = ['Key\tValue'];
            Object.entries(data).forEach(([key, value]) => {
                tsvRows.push(`${key}\t${value}`);
            });
            return tsvRows.join('\n');
        }

        default:
            throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Create a proxy object for convenient access
     * @param storageType - 'localStorage' or 'sessionStorage'
     * @returns Proxy object for storage access
     */
    createProxy(storageType: StorageType = 'localStorage'): BoundStorageAPI {
        this.validateStorageType(storageType);

        return new Proxy(this, {
            get(target, property: string | symbol): unknown {
                // Dynamic key access (see BoundStorageAPI's doc comment):
                // `target[property]` reads either a real method/field or -
                // when it isn't one - falls through to `target.get(property)`.
                const indexable = target as unknown as Record<string | symbol, unknown>;
                if (typeof property === 'string' && !indexable[property]) {
                    return target.get(property, undefined, storageType);
                }
                return indexable[property];
            },

            set(target, property: string | symbol, value: unknown): boolean {
                const indexable = target as unknown as Record<string | symbol, unknown>;
                if (typeof property === 'string' && !indexable[property]) {
                    // `value`'s real type is whatever the caller assigned via
                    // `agentlet.storage.local.myKey = ...`; set() itself
                    // expects a string.
                    target.set(property, value as string, storageType);
                    return true;
                }
                indexable[property] = value;
                return true;
            },

            has(target, property: string | symbol): boolean {
                return target.has(property as string, storageType) || property in target;
            }
        }) as unknown as BoundStorageAPI;
    }

    /**
     * Cleanup method. Leaves the page exactly as `overrideStorageMethods()`/
     * `setupStorageEventListener()` found it: restores any storage type still
     * patched (regardless of how it got that way) and removes the `storage`
     * event listener added in the constructor.
     */
    cleanup(): void {
        // Restore original storage methods
        const storageTypes: StorageType[] = ['localStorage', 'sessionStorage'];

        storageTypes.forEach(storageType => {
            const storage = this.getStorage(storageType);

            if (storage && this.originalMethods.has(`${storageType}_setItem`)) {
                storage.setItem = this.originalMethods.get(`${storageType}_setItem`) as Storage['setItem'];
                storage.removeItem = this.originalMethods.get(`${storageType}_removeItem`) as Storage['removeItem'];
                storage.clear = this.originalMethods.get(`${storageType}_clear`) as Storage['clear'];
            }
        });
        this.originalMethods.clear();

        // Remove the cross-tab `storage` event listener
        if (this.boundStorageEventListener) {
            window.removeEventListener('storage', this.boundStorageEventListener);
            this.boundStorageEventListener = null;
        }

        // Clear listeners
        this.listeners.forEach(listenerSet => listenerSet.clear());

        logger.log('StorageManager cleaned up');
    }
}
