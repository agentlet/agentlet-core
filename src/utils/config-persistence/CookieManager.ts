/**
 * CookieManager - Cookie management utility with change detection for Agentlet Core
 * Provides cookie CRUD operations and change subscription capabilities
 */
import type {
    CookieDeleteOptions,
    CookieSetOptions,
    CookieStatistics,
    CookiesAPI
} from '../../types/public-api';

/** A single cookie change-listener callback, matching {@link CookiesAPI}. */
type CookieChangeListener = (name: string, newValue: string | undefined, oldValue: string | undefined) => void;

/** Attributes parsed off a Set-Cookie-format string by the static `parseCookie()` helper. */
interface ParsedCookieAttributes {
    expires?: Date;
    maxAge?: number;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: string;
    /** Any other attribute the string carries, duck-typed since Set-Cookie attributes are open-ended. */
    [key: string]: unknown;
}

interface ParsedCookie {
    name: string;
    value: string;
    attributes: ParsedCookieAttributes;
}

export default class CookieManager implements CookiesAPI {
    listeners: Set<CookieChangeListener>;
    cookieSnapshot: Map<string, string>;
    pollInterval: ReturnType<typeof setInterval> | null;
    pollFrequency: number;

    constructor() {
        this.listeners = new Set();
        this.cookieSnapshot = new Map();
        this.pollInterval = null;
        this.pollFrequency = 1000; // Poll every 1 second by default

        // Take initial snapshot
        this.updateSnapshot();

        // Start monitoring for changes
        this.startMonitoring();

        console.log('CookieManager initialized');
    }

    /**
     * Get a cookie value
     * @param name - Cookie name
     * @param defaultValue - Default value if cookie doesn't exist
     * @returns Cookie value
     */
    get(name: string, defaultValue: string | undefined = undefined): string | undefined {
        if (!name || typeof name !== 'string') {
            throw new Error('Cookie name must be a non-empty string');
        }

        const cookies = this.getAllCookies();
        return cookies[name] ?? defaultValue;
    }

    /**
     * Set a cookie
     * @param name - Cookie name
     * @param value - Cookie value
     * @param options - Cookie options
     * @param options.maxAge - Max age in seconds
     * @param options.expires - Expiration date
     * @param options.path - Cookie path
     * @param options.domain - Cookie domain
     * @param options.secure - Secure flag
     * @param options.sameSite - SameSite attribute
     * @param options.httpOnly - HttpOnly flag (Note: not effective in client-side JS)
     */
    set(name: string, value: string, options: CookieSetOptions = {}): void {
        if (!name || typeof name !== 'string') {
            throw new Error('Cookie name must be a non-empty string');
        }

        if (value === null || value === undefined) {
            throw new Error('Cookie value cannot be null or undefined');
        }

        const oldValue = this.get(name);
        const stringValue = String(value);

        // Build cookie string
        let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(stringValue)}`;

        // Add options
        if (options.maxAge !== undefined) {
            cookieString += `; Max-Age=${options.maxAge}`;
        }

        if (options.expires instanceof Date) {
            cookieString += `; Expires=${options.expires.toUTCString()}`;
        }

        if (options.path) {
            cookieString += `; Path=${options.path}`;
        }

        if (options.domain) {
            cookieString += `; Domain=${options.domain}`;
        }

        if (options.secure) {
            cookieString += '; Secure';
        }

        if (options.sameSite) {
            cookieString += `; SameSite=${options.sameSite}`;
        }

        if (options.httpOnly) {
            cookieString += '; HttpOnly';
        }

        // Set the cookie
        try {
            document.cookie = cookieString;

            // Update snapshot and notify listeners
            this.updateSnapshot();
            this.notifyChange(name, stringValue, oldValue);

            console.log(`Cookie set: ${name} = ${this.maskSensitive(name, stringValue)}`);
        } catch (error) {
            console.error('Failed to set cookie:', error);
            throw new Error(`Failed to set cookie: ${(error as Error).message}`);
        }
    }

    /**
     * Delete a cookie
     * @param name - Cookie name
     * @param options - Cookie options (path, domain needed for proper deletion)
     */
    delete(name: string, options: CookieDeleteOptions = {}): boolean {
        if (!name || typeof name !== 'string') {
            throw new Error('Cookie name must be a non-empty string');
        }

        const oldValue = this.get(name);

        if (oldValue !== undefined) {
            // Set cookie with past expiration date
            this.set(name, '', {
                ...options,
                expires: new Date(0),
                maxAge: 0
            });

            console.log(`Cookie deleted: ${name}`);
            return true;
        }

        return false;
    }

    /**
     * Check if a cookie exists
     * @param name - Cookie name
     * @returns True if cookie exists
     */
    has(name: string): boolean {
        return this.get(name) !== undefined;
    }

    /**
     * Get all cookies as an object
     * @returns Object containing all cookies
     */
    getAllCookies(): Record<string, string> {
        const cookies: Record<string, string> = {};

        if (document.cookie) {
            document.cookie.split(';').forEach(cookie => {
                const [name, ...valueParts] = cookie.split('=');
                const trimmedName = name.trim();
                const value = valueParts.join('=').trim();

                if (trimmedName) {
                    try {
                        cookies[decodeURIComponent(trimmedName)] = decodeURIComponent(value);
                    } catch (_error) {
                        // If decoding fails, use raw values
                        cookies[trimmedName] = value;
                    }
                }
            });
        }

        return cookies;
    }

    /**
     * Clear all cookies (attempts to delete all accessible cookies)
     * @param options - Options for deletion (path, domain)
     */
    clearAll(options: CookieDeleteOptions = {}): number {
        const cookies = this.getAllCookies();
        const cookieNames = Object.keys(cookies);

        cookieNames.forEach(name => {
            this.delete(name, options);
        });

        console.log(`Attempted to clear ${cookieNames.length} cookies`);
        return cookieNames.length;
    }

    /**
     * Get cookies matching a pattern
     * @param pattern - Pattern to match cookie names
     * @returns Object containing matching cookies
     */
    getMatching(pattern: string | RegExp): Record<string, string> {
        const allCookies = this.getAllCookies();
        const matching: Record<string, string> = {};

        const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern);

        Object.entries(allCookies).forEach(([name, value]) => {
            if (regex.test(name)) {
                matching[name] = value;
            }
        });

        return matching;
    }

    /**
     * Add a change listener
     * @param callback - Callback function (name, newValue, oldValue) => void
     */
    addChangeListener(callback: CookieChangeListener): void {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }

        this.listeners.add(callback);
        console.log('Cookie change listener added');
    }

    /**
     * Remove a change listener
     * @param callback - Callback function to remove
     */
    removeChangeListener(callback: CookieChangeListener): boolean {
        const removed = this.listeners.delete(callback);
        if (removed) {
            console.log('Cookie change listener removed');
        }
        return removed;
    }

    /**
     * Start monitoring cookies for changes
     */
    startMonitoring(): void {
        if (this.pollInterval) {
            return; // Already monitoring
        }

        this.pollInterval = setInterval(() => {
            this.checkForChanges();
        }, this.pollFrequency);

        console.log(`Cookie monitoring started (polling every ${this.pollFrequency}ms)`);
    }

    /**
     * Stop monitoring cookies for changes
     */
    stopMonitoring(): void {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            console.log('Cookie monitoring stopped');
        }
    }

    /**
     * Set the polling frequency for change detection
     * @param frequency - Frequency in milliseconds
     */
    setPollFrequency(frequency: number): void {
        if (typeof frequency !== 'number' || frequency < 100) {
            throw new Error('Poll frequency must be a number >= 100ms');
        }

        this.pollFrequency = frequency;

        // Restart monitoring with new frequency
        if (this.pollInterval) {
            this.stopMonitoring();
            this.startMonitoring();
        }
    }

    /**
     * Check for cookie changes
     * @private
     */
    checkForChanges(): void {
        const currentCookies = this.getAllCookies();
        const currentSnapshot = new Map(Object.entries(currentCookies));

        // Check for new or changed cookies
        for (const [name, value] of currentSnapshot) {
            const oldValue = this.cookieSnapshot.get(name);
            if (oldValue !== value) {
                this.notifyChange(name, value, oldValue);
            }
        }

        // Check for deleted cookies
        for (const [name, oldValue] of this.cookieSnapshot) {
            if (!currentSnapshot.has(name)) {
                this.notifyChange(name, undefined, oldValue);
            }
        }

        // Update snapshot
        this.cookieSnapshot = currentSnapshot;
    }

    /**
     * Update the cookie snapshot
     * @private
     */
    updateSnapshot(): void {
        const cookies = this.getAllCookies();
        this.cookieSnapshot = new Map(Object.entries(cookies));
    }

    /**
     * Notify all listeners of a change
     * @private
     */
    notifyChange(name: string, newValue: string | undefined, oldValue: string | undefined): void {
        this.listeners.forEach(callback => {
            try {
                callback(name, newValue, oldValue);
            } catch (error) {
                console.error('Error in cookie change listener:', error);
            }
        });
    }

    /**
     * Mask sensitive values for logging
     * @private
     */
    maskSensitive(name: string, value: string): string {
        const sensitiveKeys = ['session', 'auth', 'token', 'password', 'secret', 'key'];
        const isSensitive = sensitiveKeys.some(sensitive =>
            name.toLowerCase().includes(sensitive)
        );

        if (isSensitive && value && value.length > 4) {
            return value.substring(0, 2) + '*'.repeat(value.length - 4) + value.substring(value.length - 2);
        }

        return value;
    }

    /**
     * Parse cookie attributes from Set-Cookie header format
     * @param cookieString - Cookie string in Set-Cookie format
     * @returns Parsed cookie object
     */
    static parseCookie(cookieString: string): ParsedCookie {
        const parts = cookieString.split(';');
        const [nameValue] = parts;
        const [name, value] = nameValue.split('=');

        const parsed: ParsedCookie = {
            name: name.trim(),
            value: value ? value.trim() : '',
            attributes: {}
        };

        // Parse attributes
        parts.slice(1).forEach(part => {
            const [key, val] = part.split('=');
            const trimmedKey = key.trim().toLowerCase();

            switch (trimmedKey) {
            case 'expires':
                parsed.attributes.expires = new Date(val);
                break;
            case 'max-age':
                parsed.attributes.maxAge = parseInt(val);
                break;
            case 'domain':
                parsed.attributes.domain = val.trim();
                break;
            case 'path':
                parsed.attributes.path = val.trim();
                break;
            case 'secure':
                parsed.attributes.secure = true;
                break;
            case 'httponly':
                parsed.attributes.httpOnly = true;
                break;
            case 'samesite':
                parsed.attributes.sameSite = val ? val.trim() : 'Lax';
                break;
            default:
                parsed.attributes[trimmedKey] = val ? val.trim() : true;
            }
        });

        return parsed;
    }

    /**
     * Get statistics about cookies
     * @returns Statistics object
     */
    getStatistics(): CookieStatistics {
        const cookies = this.getAllCookies();
        const entries = Object.entries(cookies);

        return {
            total: entries.length,
            totalSize: document.cookie.length,
            averageSize: entries.length > 0 ? Math.round(document.cookie.length / entries.length) : 0,
            names: entries.map(([name]) => name).sort(),
            listeners: this.listeners.size,
            monitoring: !!this.pollInterval,
            pollFrequency: this.pollFrequency
        };
    }

    /**
     * Export cookies in various formats
     * @param format - Export format ('json', 'netscape', 'curl')
     * @param includeSensitive - Whether to include sensitive values
     * @returns Formatted export string
     */
    export(format = 'json', includeSensitive = false): string {
        const cookies = this.getAllCookies();
        const processedCookies: Record<string, string> = {};

        // Process cookies (mask sensitive if needed)
        Object.entries(cookies).forEach(([name, value]) => {
            processedCookies[name] = includeSensitive ? value : this.maskSensitive(name, value);
        });

        switch (format.toLowerCase()) {
        case 'json':
            return JSON.stringify(processedCookies, null, 2);

        case 'netscape': {
            // Netscape cookie file format
            let netscape = '# Netscape HTTP Cookie File\n';
            Object.entries(processedCookies).forEach(([name, value]) => {
                netscape += `${window.location.hostname}\tTRUE\t/\tFALD\t0\t${name}\t${value}\n`;
            });
            return netscape;
        }

        case 'curl':
            // cURL cookie format
            return Object.entries(processedCookies)
                .map(([name, value]) => `${name}=${value}`)
                .join('; ');

        default:
            throw new Error(`Unsupported export format: ${format}`);
        }
    }

    /**
     * Create a proxy object for convenient access
     * @returns Proxy object for cookie access
     */
    createProxy(): CookiesAPI {
        return new Proxy(this, {
            get(target, property: string | symbol): unknown {
                // Dynamic cookie-name access (see CookiesAPI's doc comment):
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
                    // `agentlet.cookies.myCookie = ...` (see CookiesAPI's doc
                    // comment); set() itself expects a string.
                    target.set(property, value as string);
                    return true;
                }
                indexable[property] = value;
                return true;
            },

            has(target, property: string | symbol): boolean {
                return target.has(property as string) || property in target;
            }
        }) as unknown as CookiesAPI;
    }

    /**
     * Cleanup method
     */
    cleanup(): void {
        this.stopMonitoring();
        this.listeners.clear();
        console.log('CookieManager cleaned up');
    }
}
