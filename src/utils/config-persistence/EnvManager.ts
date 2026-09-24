/**
 * BaseEnvironmentVariablesManager - Base class for environment variable management
 * Provides core functionality for managing environment variables
 */
import type { EnvAPI } from '../../types/public-api';

/** A single env-variable change-listener callback, matching {@link EnvAPI}. */
type EnvChangeListener = (key: string, newValue: string | undefined, oldValue: string | undefined) => void;

export class BaseEnvironmentVariablesManager implements EnvAPI {
    variables: Map<string, string>;
    listeners: Set<EnvChangeListener>;

    constructor() {
        this.variables = new Map();
        this.listeners = new Set();
    }

    /**
     * Get the display name for this environment variable manager
     * @returns Human-readable name for the storage type
     * @abstract
     */
    name(): string {
        throw new Error('name() method must be implemented by subclasses');
    }

    /**
     * Set an environment variable
     * @param key - Variable name
     * @param value - Variable value
     */
    set(key: string, value: string): void {
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
     * @param key - Variable name
     * @param defaultValue - Default value if not found
     * @returns Variable value
     */
    get(key: string, defaultValue: string | undefined = undefined): string | undefined {
        return this.variables.get(key) ?? defaultValue;
    }

    /**
     * Check if an environment variable exists
     * @param key - Variable name
     * @returns True if variable exists
     */
    has(key: string): boolean {
        return this.variables.has(key);
    }

    /**
     * Remove an environment variable
     * @param key - Variable name
     * @returns True if variable was removed
     */
    remove(key: string): boolean {
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
    clear(): void {
        const count = this.variables.size;
        this.variables.clear();

        // Notify listeners of clear
        this.notifyChange('*', undefined, undefined);

        console.log(`Cleared ${count} environment variables`);
    }

    /**
     * Get all environment variables
     * @param includeSensitive - Whether to include sensitive values (default: false)
     * @returns Object containing all variables
     */
    getAll(includeSensitive = false): Record<string, string> {
        const result: Record<string, string> = {};

        for (const [key, value] of this.variables) {
            result[key] = includeSensitive ? value : this.maskSensitive(key, value);
        }

        return result;
    }

    /**
     * Set multiple environment variables at once
     * @param variables - Object containing key-value pairs
     */
    setMultiple(variables: Record<string, string>): void {
        if (typeof variables !== 'object' || variables === null) {
            throw new Error('Variables must be an object');
        }

        Object.entries(variables).forEach(([key, value]) => {
            this.set(key, value);
        });
    }

    /**
     * Load environment variables from an object
     * @param envObject - Object containing environment variables
     * @param merge - Whether to merge with existing variables (default: true)
     */
    loadFromObject(envObject: Record<string, string>, merge = true): void {
        if (!merge) {
            this.clear();
        }

        this.setMultiple(envObject);
        console.log(`Loaded ${Object.keys(envObject).length} variables from object`);
    }

    /**
     * Add a change listener
     * @param callback - Callback function (key, newValue, oldValue) => void
     */
    addChangeListener(callback: EnvChangeListener): void {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        this.listeners.add(callback);
    }

    /**
     * Remove a change listener
     * @param callback - Callback function to remove
     */
    removeChangeListener(callback: EnvChangeListener): void {
        this.listeners.delete(callback);
    }

    /**
     * Create a proxy object for convenient access
     * @returns Proxy object for environment variables
     */
    createProxy(): EnvAPI {
        return new Proxy(this, {
            get(target, property: string | symbol): unknown {
                // Dynamic variable-name access (see EnvAPI's doc comment):
                // `target[property]` reads either a real method/field or -
                // when it isn't one - falls through to `target.get(property)`.
                const indexable = target as unknown as Record<string | symbol, unknown>;
                if (typeof property === 'string' && !indexable[property]) {
                    return target.get(property);
                }
                return indexable[property];
            },

            set(target, property: string | symbol, value: unknown): boolean {
                const indexable = target as unknown as Record<string | symbol, unknown>;
                if (typeof property === 'string' && !indexable[property]) {
                    // `value`'s real type is whatever the caller assigned via
                    // `agentlet.env.MY_VAR = ...` (see EnvAPI's doc comment);
                    // set() itself is the boundary that expects a string.
                    target.set(property, value as string);
                    return true;
                }
                indexable[property] = value;
                return true;
            },

            has(target, property: string | symbol): boolean {
                return target.has(property as string) || property in target;
            }
        }) as unknown as EnvAPI;
    }

    /**
     * Notify all listeners of a change
     * @private
     */
    notifyChange(key: string, newValue: string | undefined, oldValue: string | undefined): void {
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
    maskSensitive(key: string, value: string): string {
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
    storageKey: string;

    constructor(storageKey = 'agentlet') {
        super();
        this.storageKey = storageKey;

        // Load existing variables from storage
        this.loadFromStorage();

        console.log('LocalStorageEnvironmentVariablesManager initialized');
    }

    /**
     * Get the display name with domain information
     * @returns Human-readable name with domain
     */
    name(): string {
        const domain = typeof window !== 'undefined' && window.location
            ? window.location.hostname
            : 'unknown';
        return `Browser Local Storage (${domain})`;
    }

    /**
     * Load environment variables from localStorage
     */
    loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const parsed = JSON.parse(stored) as Record<string, string>;
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
    saveToStorage(): void {
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
    set(key: string, value: string): void {
        super.set(key, value);
        this.saveToStorage();
    }

    /**
     * Override remove to persist to localStorage
     */
    remove(key: string): boolean {
        const result = super.remove(key);
        if (result) {
            this.saveToStorage();
        }
        return result;
    }

    /**
     * Override clear to persist to localStorage
     */
    clear(): void {
        super.clear();
        localStorage.removeItem(this.storageKey);
    }

    /**
     * Override setMultiple to persist to localStorage
     */
    setMultiple(variables: Record<string, string>): void {
        super.setMultiple(variables);
        this.saveToStorage();
    }
}

/**
 * EnvManager - Default export for backward compatibility
 * Uses LocalStorageEnvironmentVariablesManager by default
 */
export default LocalStorageEnvironmentVariablesManager;
