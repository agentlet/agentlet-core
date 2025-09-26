/**
 * StorageManager - Enhanced localStorage and sessionStorage management with change detection
 * Provides storage operations and change subscription capabilities for both localStorage and sessionStorage
 */

export default class StorageManager {
    constructor() {
        this.listeners = new Map(); // Map of storage type to Set of listeners
        this.storageSnapshot = new Map(); // Map of storage type to Map of key-value pairs
        this.originalMethods = new Map();
        
        // Initialize listeners and snapshots for both storage types
        this.listeners.set('localStorage', new Set());
        this.listeners.set('sessionStorage', new Set());
        this.storageSnapshot.set('localStorage', new Map());
        this.storageSnapshot.set('sessionStorage', new Map());
        
        // Take initial snapshots
        this.updateSnapshot('localStorage');
        this.updateSnapshot('sessionStorage');
        
        // Override storage methods for same-tab change detection
        this.overrideStorageMethods();
        
        // Listen for storage events (changes from other tabs/windows)
        this.setupStorageEventListener();
        
        console.log('StorageManager initialized');
    }

    /**
     * Get a value from storage
     * @param {string} key - Storage key
     * @param {string} defaultValue - Default value if key doesn't exist
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     * @returns {string|undefined} Storage value
     */
    get(key, defaultValue = undefined, storageType = 'localStorage') {
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
     * @param {string} key - Storage key
     * @param {string} value - Storage value
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     */
    set(key, value, storageType = 'localStorage') {
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
            
            console.log(`${storageType} set: ${key} = ${this.maskSensitive(key, stringValue)}`);
        } catch (error) {
            console.error(`Failed to set ${storageType} item:`, error);
            throw new Error(`Failed to set ${storageType} item: ${error.message}`);
        }
    }

    /**
     * Remove a value from storage
     * @param {string} key - Storage key
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     * @returns {boolean} True if item was removed
     */
    remove(key, storageType = 'localStorage') {
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
                
                console.log(`${storageType} removed: ${key}`);
                return true;
            }
            
            return false;
        } catch (error) {
            console.error(`Failed to remove ${storageType} item:`, error);
            throw new Error(`Failed to remove ${storageType} item: ${error.message}`);
        }
    }

    /**
     * Check if a key exists in storage
     * @param {string} key - Storage key
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     * @returns {boolean} True if key exists
     */
    has(key, storageType = 'localStorage') {
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
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     * @returns {number} Number of items cleared
     */
    clear(storageType = 'localStorage') {
        this.validateStorageType(storageType);

        try {
            const storage = this.getStorage(storageType);
            const count = storage.length;
            
            storage.clear();
            
            // Update snapshot and notify listeners
            this.updateSnapshot(storageType);
            this.notifyChange(storageType, '*', null, null);
            
            console.log(`${storageType} cleared: ${count} items`);
            return count;
        } catch (error) {
            console.error(`Failed to clear ${storageType}:`, error);
            throw new Error(`Failed to clear ${storageType}: ${error.message}`);
        }
    }

    /**
     * Get all items from storage
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     * @param {boolean} includeSensitive - Whether to include sensitive values
     * @returns {Object} Object containing all storage items
     */
    getAll(storageType = 'localStorage', includeSensitive = false) {
        this.validateStorageType(storageType);

        try {
            const storage = this.getStorage(storageType);
            const items = {};
            
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                const value = storage.getItem(key);
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
     * @param {string|RegExp} pattern - Pattern to match keys
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     * @returns {Object} Object containing matching items
     */
    getMatching(pattern, storageType = 'localStorage') {
        this.validateStorageType(storageType);

        const allItems = this.getAll(storageType, true);
        const matching = {};
        
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
     * @param {string} key - Storage key
     * @param {*} defaultValue - Default value if key doesn't exist or parsing fails
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     * @returns {*} Parsed JSON value
     */
    getJSON(key, defaultValue = null, storageType = 'localStorage') {
        const value = this.get(key, null, storageType);
        
        if (value === null) {
            return defaultValue;
        }
        
        try {
            return JSON.parse(value);
        } catch (error) {
            console.error(`Failed to parse JSON for key ${key}:`, error);
            return defaultValue;
        }
    }

    /**
     * Set JSON value in storage
     * @param {string} key - Storage key
     * @param {*} value - Value to stringify and store
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     */
    setJSON(key, value, storageType = 'localStorage') {
        try {
            const jsonString = JSON.stringify(value);
            this.set(key, jsonString, storageType);
        } catch (error) {
            console.error(`Failed to stringify JSON for key ${key}:`, error);
            throw new Error(`Failed to stringify JSON for key ${key}: ${error.message}`);
        }
    }

    /**
     * Set multiple items at once
     * @param {Object} items - Object containing key-value pairs
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     */
    setMultiple(items, storageType = 'localStorage') {
        if (typeof items !== 'object' || items === null) {
            throw new Error('Items must be an object');
        }

        Object.entries(items).forEach(([key, value]) => {
            this.set(key, value, storageType);
        });
    }

    /**
     * Add a change listener
     * @param {Function} callback - Callback function (storageType, key, newValue, oldValue) => void
     * @param {string} storageType - 'localStorage', 'sessionStorage', or 'both'
     */
    addChangeListener(callback, storageType = 'both') {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        if (storageType === 'both') {
            this.listeners.get('localStorage').add(callback);
            this.listeners.get('sessionStorage').add(callback);
        } else {
            this.validateStorageType(storageType);
            this.listeners.get(storageType).add(callback);
        }
        
        console.log(`Storage change listener added for ${storageType}`);
    }

    /**
     * Remove a change listener
     * @param {Function} callback - Callback function to remove
     * @param {string} storageType - 'localStorage', 'sessionStorage', or 'both'
     */
    removeChangeListener(callback, storageType = 'both') {
        let removed = false;
        
        if (storageType === 'both') {
            removed = this.listeners.get('localStorage').delete(callback) || removed;
            removed = this.listeners.get('sessionStorage').delete(callback) || removed;
        } else {
            this.validateStorageType(storageType);
            removed = this.listeners.get(storageType).delete(callback);
        }
        
        if (removed) {
            console.log(`Storage change listener removed for ${storageType}`);
        }
        
        return removed;
    }

    /**
     * Override storage methods for same-tab change detection
     * @private
     */
    overrideStorageMethods() {
        ['localStorage', 'sessionStorage'].forEach(storageType => {
            const storage = this.getStorage(storageType);
            
            if (!storage) return;
            
            // Store original methods
            this.originalMethods.set(`${storageType}_setItem`, storage.setItem.bind(storage));
            this.originalMethods.set(`${storageType}_removeItem`, storage.removeItem.bind(storage));
            this.originalMethods.set(`${storageType}_clear`, storage.clear.bind(storage));
            
            // Override setItem
            storage.setItem = (key, value) => {
                const oldValue = storage.getItem(key);
                this.originalMethods.get(`${storageType}_setItem`)(key, value);
                this.handleStorageChange(storageType, key, value, oldValue);
            };
            
            // Override removeItem
            storage.removeItem = (key) => {
                const oldValue = storage.getItem(key);
                this.originalMethods.get(`${storageType}_removeItem`)(key);
                this.handleStorageChange(storageType, key, null, oldValue);
            };
            
            // Override clear
            storage.clear = () => {
                this.originalMethods.get(`${storageType}_clear`)();
                this.handleStorageChange(storageType, '*', null, null);
            };
        });
        
        console.log('Storage methods overridden for change detection');
    }

    /**
     * Set up storage event listener for cross-tab changes
     * @private
     */
    setupStorageEventListener() {
        window.addEventListener('storage', (event) => {
            // Storage events only fire for changes from other tabs/windows
            const storageType = event.storageArea === localStorage ? 'localStorage' : 'sessionStorage';
            this.handleStorageChange(storageType, event.key, event.newValue, event.oldValue);
        });
        
        console.log('Storage event listener set up for cross-tab change detection');
    }

    /**
     * Handle storage changes
     * @private
     */
    handleStorageChange(storageType, key, newValue, oldValue) {
        // Update snapshot
        this.updateSnapshot(storageType);
        
        // Notify listeners
        this.notifyChange(storageType, key, newValue, oldValue);
    }

    /**
     * Update storage snapshot
     * @private
     */
    updateSnapshot(storageType) {
        const storage = this.getStorage(storageType);
        const snapshot = new Map();
        
        if (storage) {
            for (let i = 0; i < storage.length; i++) {
                const key = storage.key(i);
                const value = storage.getItem(key);
                snapshot.set(key, value);
            }
        }
        
        this.storageSnapshot.set(storageType, snapshot);
    }

    /**
     * Notify all listeners of a change
     * @private
     */
    notifyChange(storageType, key, newValue, oldValue) {
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
    getStorage(storageType) {
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
    validateStorageType(storageType) {
        if (!['localStorage', 'sessionStorage'].includes(storageType)) {
            throw new Error(`Invalid storage type: ${storageType}. Must be 'localStorage' or 'sessionStorage'`);
        }
    }

    /**
     * Mask sensitive values for logging
     * @private
     */
    maskSensitive(key, value) {
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
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     * @returns {Object} Statistics object
     */
    getStatistics(storageType = 'localStorage') {
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
                listeners: this.listeners.get(storageType).size,
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
                error: error.message
            };
        }
    }

    /**
     * Export storage data in various formats
     * @param {string} format - Export format ('json', 'csv', 'tsv')
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     * @param {boolean} includeSensitive - Whether to include sensitive values
     * @returns {string} Formatted export string
     */
    export(format = 'json', storageType = 'localStorage', includeSensitive = false) {
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
     * @param {string} storageType - 'localStorage' or 'sessionStorage'
     * @returns {Proxy} Proxy object for storage access
     */
    createProxy(storageType = 'localStorage') {
        this.validateStorageType(storageType);
        
        return new Proxy(this, {
            get(target, property) {
                if (typeof property === 'string' && !target[property]) {
                    return target.get(property, undefined, storageType);
                }
                return target[property];
            },
            
            set(target, property, value) {
                if (typeof property === 'string' && !target[property]) {
                    target.set(property, value, storageType);
                    return true;
                }
                target[property] = value;
                return true;
            },
            
            has(target, property) {
                return target.has(property, storageType) || property in target;
            }
        });
    }

    /**
     * Cleanup method
     */
    cleanup() {
        // Restore original storage methods
        ['localStorage', 'sessionStorage'].forEach(storageType => {
            const storage = this.getStorage(storageType);
            
            if (storage && this.originalMethods.has(`${storageType}_setItem`)) {
                storage.setItem = this.originalMethods.get(`${storageType}_setItem`);
                storage.removeItem = this.originalMethods.get(`${storageType}_removeItem`);
                storage.clear = this.originalMethods.get(`${storageType}_clear`);
            }
        });
        
        // Clear listeners
        this.listeners.forEach(listenerSet => listenerSet.clear());
        
        console.log('StorageManager cleaned up');
    }
}