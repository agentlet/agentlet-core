/**
 * BaseEnvironmentVariablesManager - Base class for environment variable management
 * Provides core functionality for managing environment variables
 */

export class BaseEnvironmentVariablesManager {
    constructor() {
        this.variables = new Map();
        this.listeners = new Set();
    }

    /**
     * Get the display name for this environment variable manager
     * @returns {string} Human-readable name for the storage type
     * @abstract
     */
    name() {
        throw new Error('name() method must be implemented by subclasses');
    }

    /**
     * Set an environment variable
     * @param {string} key - Variable name
     * @param {string} value - Variable value
     */
    set(key, value) {
        if (!key || typeof key !== 'string') {
            throw new Error('Environment variable key must be a non-empty string');
        }

        const oldValue = this.variables.get(key);
        this.variables.set(key, String(value));

        // Notify listeners of change
        this.notifyChange(key, value, oldValue);
        
        console.log(`Environment variable set: ${key} = ${this.maskSensitive(key, value)}`);
    }

    /**
     * Get an environment variable
     * @param {string} key - Variable name
     * @param {string} defaultValue - Default value if not found
     * @returns {string|undefined} Variable value
     */
    get(key, defaultValue = undefined) {
        return this.variables.get(key) ?? defaultValue;
    }

    /**
     * Check if an environment variable exists
     * @param {string} key - Variable name
     * @returns {boolean} True if variable exists
     */
    has(key) {
        return this.variables.has(key);
    }

    /**
     * Remove an environment variable
     * @param {string} key - Variable name
     * @returns {boolean} True if variable was removed
     */
    remove(key) {
        const existed = this.variables.has(key);
        const oldValue = this.variables.get(key);
        
        if (existed) {
            this.variables.delete(key);
            
            // Notify listeners of deletion
            this.notifyChange(key, undefined, oldValue);
            
            console.log(`Environment variable removed: ${key}`);
        }
        
        return existed;
    }

    /**
     * Clear all environment variables
     */
    clear() {
        const count = this.variables.size;
        this.variables.clear();

        // Notify listeners of clear
        this.notifyChange('*', undefined, undefined);
        
        console.log(`Cleared ${count} environment variables`);
    }

    /**
     * Get all environment variables
     * @param {boolean} includeSensitive - Whether to include sensitive values (default: false)
     * @returns {Object} Object containing all variables
     */
    getAll(includeSensitive = false) {
        const result = {};
        
        for (const [key, value] of this.variables) {
            result[key] = includeSensitive ? value : this.maskSensitive(key, value);
        }
        
        return result;
    }

    /**
     * Set multiple environment variables at once
     * @param {Object} variables - Object containing key-value pairs
     */
    setMultiple(variables) {
        if (typeof variables !== 'object' || variables === null) {
            throw new Error('Variables must be an object');
        }

        Object.entries(variables).forEach(([key, value]) => {
            this.set(key, value);
        });
    }

    /**
     * Load environment variables from an object
     * @param {Object} envObject - Object containing environment variables
     * @param {boolean} merge - Whether to merge with existing variables (default: true)
     */
    loadFromObject(envObject, merge = true) {
        if (!merge) {
            this.clear();
        }

        this.setMultiple(envObject);
        console.log(`Loaded ${Object.keys(envObject).length} variables from object`);
    }

    /**
     * Add a change listener
     * @param {Function} callback - Callback function (key, newValue, oldValue) => void
     */
    addChangeListener(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        
        this.listeners.add(callback);
    }

    /**
     * Remove a change listener
     * @param {Function} callback - Callback function to remove
     */
    removeChangeListener(callback) {
        this.listeners.delete(callback);
    }

    /**
     * Create a proxy object for convenient access
     * @returns {Proxy} Proxy object for environment variables
     */
    createProxy() {
        return new Proxy(this, {
            get(target, property) {
                if (typeof property === 'string' && !target[property]) {
                    return target.get(property);
                }
                return target[property];
            },
            
            set(target, property, value) {
                if (typeof property === 'string' && !target[property]) {
                    target.set(property, value);
                    return true;
                }
                target[property] = value;
                return true;
            },
            
            has(target, property) {
                return target.has(property) || property in target;
            }
        });
    }

    /**
     * Notify all listeners of a change
     * @private
     */
    notifyChange(key, newValue, oldValue) {
        this.listeners.forEach(callback => {
            try {
                callback(key, newValue, oldValue);
            } catch (error) {
                console.error('Error in environment variable change listener:', error);
            }
        });
    }

    /**
     * Mask sensitive values for logging
     * @private
     */
    maskSensitive(key, value) {
        const sensitiveKeys = ['password', 'secret', 'token', 'key', 'api_key', 'auth'];
        const isSensitive = sensitiveKeys.some(sensitive => 
            key.toLowerCase().includes(sensitive)
        );
        
        if (isSensitive && value && value.length > 4) {
            return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
        }
        
        return value;
    }
}

/**
 * LocalStorageEnvironmentVariablesManager - localStorage implementation
 * Extends BaseEnvironmentVariablesManager with localStorage persistence
 */

export class LocalStorageEnvironmentVariablesManager extends BaseEnvironmentVariablesManager {
    constructor(storageKey = 'agentlet') {
        super();
        this.storageKey = storageKey;
        
        // Load existing variables from storage
        this.loadFromStorage();
        
        console.log('LocalStorageEnvironmentVariablesManager initialized');
    }

    /**
     * Get the display name with domain information
     * @returns {string} Human-readable name with domain
     */
    name() {
        const domain = typeof window !== 'undefined' && window.location 
            ? window.location.hostname 
            : 'unknown';
        return `Browser Local Storage (${domain})`;
    }

    /**
     * Load environment variables from localStorage
     */
    loadFromStorage() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored);
                Object.entries(parsed).forEach(([key, value]) => {
                    this.variables.set(key, value);
                });
                console.log(`Loaded ${this.variables.size} environment variables from localStorage`);
            }
        } catch (error) {
            console.error('Failed to load environment variables from localStorage:', error);
        }
    }

    /**
     * Save environment variables to localStorage
     */
    saveToStorage() {
        try {
            const data = Object.fromEntries(this.variables);
            localStorage.setItem(this.storageKey, JSON.stringify(data));
            console.log('Environment variables saved to localStorage');
        } catch (error) {
            console.error('Failed to save environment variables to localStorage:', error);
            throw new Error('Failed to save environment variables');
        }
    }

    /**
     * Override set to persist to localStorage
     */
    set(key, value) {
        super.set(key, value);
        this.saveToStorage();
    }

    /**
     * Override remove to persist to localStorage
     */
    remove(key) {
        const result = super.remove(key);
        if (result) {
            this.saveToStorage();
        }
        return result;
    }

    /**
     * Override clear to persist to localStorage
     */
    clear() {
        super.clear();
        localStorage.removeItem(this.storageKey);
    }

    /**
     * Override setMultiple to persist to localStorage
     */
    setMultiple(variables) {
        super.setMultiple(variables);
        this.saveToStorage();
    }
}

/**
 * EnvManager - Default export for backward compatibility
 * Uses LocalStorageEnvironmentVariablesManager by default
 */
export default LocalStorageEnvironmentVariablesManager;