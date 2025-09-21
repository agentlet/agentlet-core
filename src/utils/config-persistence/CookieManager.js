/**
 * CookieManager - Cookie management utility with change detection for Agentlet Core
 * Provides cookie CRUD operations and change subscription capabilities
 */

export default class CookieManager {
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
     * @param {string} name - Cookie name
     * @param {string} defaultValue - Default value if cookie doesn't exist
     * @returns {string|undefined} Cookie value
     */
    get(name, defaultValue = undefined) {
        if (!name || typeof name !== 'string') {
            throw new Error('Cookie name must be a non-empty string');
        }

        const cookies = this.getAllCookies();
        return cookies[name] ?? defaultValue;
    }

    /**
     * Set a cookie
     * @param {string} name - Cookie name
     * @param {string} value - Cookie value
     * @param {Object} options - Cookie options
     * @param {number} options.maxAge - Max age in seconds
     * @param {Date} options.expires - Expiration date
     * @param {string} options.path - Cookie path
     * @param {string} options.domain - Cookie domain
     * @param {boolean} options.secure - Secure flag
     * @param {string} options.sameSite - SameSite attribute
     * @param {boolean} options.httpOnly - HttpOnly flag (Note: not effective in client-side JS)
     */
    set(name, value, options = {}) {
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
            throw new Error(`Failed to set cookie: ${error.message}`);
        }
    }

    /**
     * Delete a cookie
     * @param {string} name - Cookie name
     * @param {Object} options - Cookie options (path, domain needed for proper deletion)
     */
    delete(name, options = {}) {
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
     * @param {string} name - Cookie name
     * @returns {boolean} True if cookie exists
     */
    has(name) {
        return this.get(name) !== undefined;
    }

    /**
     * Get all cookies as an object
     * @returns {Object} Object containing all cookies
     */
    getAllCookies() {
        const cookies = {};
        
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
     * @param {Object} options - Options for deletion (path, domain)
     */
    clearAll(options = {}) {
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
     * @param {string|RegExp} pattern - Pattern to match cookie names
     * @returns {Object} Object containing matching cookies
     */
    getMatching(pattern) {
        const allCookies = this.getAllCookies();
        const matching = {};
        
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
     * @param {Function} callback - Callback function (name, newValue, oldValue) => void
     */
    addChangeListener(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        
        this.listeners.add(callback);
        console.log('Cookie change listener added');
    }

    /**
     * Remove a change listener
     * @param {Function} callback - Callback function to remove
     */
    removeChangeListener(callback) {
        const removed = this.listeners.delete(callback);
        if (removed) {
            console.log('Cookie change listener removed');
        }
        return removed;
    }

    /**
     * Start monitoring cookies for changes
     */
    startMonitoring() {
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
    stopMonitoring() {
        if (this.pollInterval) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
            console.log('Cookie monitoring stopped');
        }
    }

    /**
     * Set the polling frequency for change detection
     * @param {number} frequency - Frequency in milliseconds
     */
    setPollFrequency(frequency) {
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
    checkForChanges() {
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
    updateSnapshot() {
        const cookies = this.getAllCookies();
        this.cookieSnapshot = new Map(Object.entries(cookies));
    }

    /**
     * Notify all listeners of a change
     * @private
     */
    notifyChange(name, newValue, oldValue) {
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
    maskSensitive(name, value) {
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
     * @param {string} cookieString - Cookie string in Set-Cookie format
     * @returns {Object} Parsed cookie object
     */
    static parseCookie(cookieString) {
        const parts = cookieString.split(';');
        const [nameValue] = parts;
        const [name, value] = nameValue.split('=');
        
        const parsed = {
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
     * @returns {Object} Statistics object
     */
    getStatistics() {
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
     * @param {string} format - Export format ('json', 'netscape', 'curl')
     * @param {boolean} includeSensitive - Whether to include sensitive values
     * @returns {string} Formatted export string
     */
    export(format = 'json', includeSensitive = false) {
        const cookies = this.getAllCookies();
        const processedCookies = {};
        
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
     * @returns {Proxy} Proxy object for cookie access
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
     * Cleanup method
     */
    cleanup() {
        this.stopMonitoring();
        this.listeners.clear();
        console.log('CookieManager cleaned up');
    }
}