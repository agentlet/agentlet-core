/**
 * ShortcutManager - Keyboard shortcuts management using hotkeys-js
 * Provides easy registration and management of keyboard shortcuts for Agentlet
 */
class ShortcutManager {
    constructor(librarySetup = null) {
        this.librarySetup = librarySetup;
        this.shortcuts = new Map();
        this.enabled = true;
        this.hotkeys = null; // Will be set when hotkeys-js is available
        
        console.log('⌨️ ShortcutManager initialized');
    }
    
    /**
     * Check if hotkeys-js is available
     * @returns {boolean}
     */
    isHotkeysAvailable() {
        return typeof window.hotkeys !== 'undefined' || this.hotkeys !== null;
    }
    
    /**
     * Ensure hotkeys-js library is loaded
     * @returns {Promise<boolean>}
     */
    async ensureHotkeys() {
        if (this.isHotkeysAvailable()) {
            return true;
        }
        
        if (this.librarySetup) {
            try {
                console.log('⌨️ Loading hotkeys-js library for keyboard shortcuts...');
                const success = await this.librarySetup.ensureLibrary('hotkeys');
                if (success && window.hotkeys) {
                    this.init(window.hotkeys);
                }
                return success;
            } catch (error) {
                console.warn('⌨️ Failed to load hotkeys-js library:', error.message);
                return false;
            }
        }
        
        return false;
    }
    
    /**
     * Initialize with hotkeys-js library
     * @param {Object} hotkeysLib - The hotkeys-js library instance
     */
    init(hotkeysLib) {
        this.hotkeys = hotkeysLib;
        
        // Configure hotkeys-js
        this.hotkeys.filter = (_event) => {
            // Allow shortcuts to work even in input fields if explicitly configured
            return true;
        };
        
        console.log('⌨️ ShortcutManager initialized with hotkeys-js');
    }
    
    /**
     * Register a keyboard shortcut
     * @param {string} keys - Key combination (e.g., 'ctrl+k', 'shift+shift', 'cmd+/')
     * @param {Function} callback - Function to call when shortcut is triggered
     * @param {Object} options - Additional options
     * @param {string} options.description - Description of what the shortcut does
     * @param {boolean} options.preventDefault - Whether to prevent default behavior (default: true)
     * @param {boolean} options.stopPropagation - Whether to stop event propagation (default: true)
     * @param {string} options.scope - Scope for the shortcut (default: 'all')
     * @param {boolean} options.allowInInputs - Allow shortcut to work in input fields (default: false)
     * @returns {Promise<boolean>} - True if registered successfully
     */
    async register(keys, callback, options = {}) {
        const hotkeysAvailable = await this.ensureHotkeys();
        if (!hotkeysAvailable) {
            console.warn('⌨️ Hotkeys library not available. Keyboard shortcuts are disabled.');
            return false;
        }
        
        if (!keys || typeof callback !== 'function') {
            console.error('⌨️ Invalid shortcut registration: keys and callback are required');
            return false;
        }
        
        const config = {
            description: options.description || `Shortcut for ${keys}`,
            preventDefault: options.preventDefault !== false,
            stopPropagation: options.stopPropagation !== false,
            scope: options.scope || 'all',
            allowInInputs: options.allowInInputs || false,
            ...options
        };
        
        // Wrap callback with our logic
        const wrappedCallback = (event, handler) => {
            if (!this.enabled) {
                return;
            }
            
            // Check if we should allow this shortcut in input fields
            const target = event.target || event.srcElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
            
            if (isInput && !config.allowInInputs) {
                return;
            }
            
            if (config.preventDefault) {
                event.preventDefault();
            }
            
            if (config.stopPropagation) {
                event.stopPropagation();
            }
            
            try {
                callback(event, handler);
            } catch (error) {
                console.error(`⌨️ Error in shortcut callback for ${keys}:`, error);
            }
        };
        
        // Register with hotkeys-js
        if (this.hotkeys && typeof this.hotkeys === 'function') {
            this.hotkeys(keys, config.scope, wrappedCallback);
        } else {
            console.error('⌨️ Hotkeys library not properly initialized');
            return false;
        }
        
        // Store in our registry
        this.shortcuts.set(keys, {
            callback,
            config,
            registered: new Date()
        });
        
        console.log(`⌨️ Registered shortcut: ${keys} - ${config.description}`);
        return true;
    }
    
    /**
     * Unregister a keyboard shortcut
     * @param {string} keys - Key combination to unregister
     * @param {string} scope - Scope to unregister from (default: 'all')
     * @returns {boolean} - True if unregistered successfully
     */
    unregister(keys, scope = 'all') {
        if (!this.hotkeys) {
            console.warn('⌨️ Hotkeys library not initialized');
            return false;
        }
        
        this.hotkeys.unbind(keys, scope);
        this.shortcuts.delete(keys);
        
        console.log(`⌨️ Unregistered shortcut: ${keys}`);
        return true;
    }
    
    /**
     * Enable or disable all shortcuts
     * @param {boolean} enabled - Whether shortcuts should be enabled
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        console.log(`⌨️ Shortcuts ${enabled ? 'enabled' : 'disabled'}`);
    }
    
    /**
     * Get all registered shortcuts
     * @returns {Array} - Array of shortcut information
     */
    getShortcuts() {
        return Array.from(this.shortcuts.entries()).map(([keys, data]) => ({
            keys,
            description: data.config.description,
            scope: data.config.scope,
            registered: data.registered,
            allowInInputs: data.config.allowInInputs
        }));
    }
    
    /**
     * Check if a shortcut is registered
     * @param {string} keys - Key combination to check
     * @returns {boolean} - True if registered
     */
    isRegistered(keys) {
        return this.shortcuts.has(keys);
    }
    
    /**
     * Clear all registered shortcuts
     */
    clear() {
        if (!this.hotkeys) {
            return;
        }
        
        // Unbind all shortcuts
        for (const [keys, data] of this.shortcuts) {
            this.hotkeys.unbind(keys, data.config.scope);
        }
        
        this.shortcuts.clear();
        console.log('⌨️ All shortcuts cleared');
    }
    
    /**
     * Register common Agentlet shortcuts
     * @param {Object} config - Configuration object
     */
    async registerDefaultShortcuts(config = {}) {
        if (!window.agentlet?.utils?.Dialog) {
            console.warn('⌨️ Dialog not available, skipping default shortcuts');
            return;
        }

        // Ctrl/Cmd + ; - Quick Command (only if enabled)
        if (config.quickCommandDialogShortcut) {
            const callback = config.quickCommandCallback || ((result) => {
                if (result) {
                    console.log('⌨️ Quick command:', result);
                    // Here you could add logic to parse and execute commands
                }
            });

            await this.register('ctrl+;,cmd+;', () => {
                window.agentlet.utils.Dialog.quickCommand('Enter command...', callback);
            }, {
                description: 'Open quick command dialog',
                allowInInputs: false
            });
        }
        
        // Escape - Close dialogs (handled by Dialog class, but we can add global escape)
        await this.register('esc', () => {
            if (window.agentlet?.utils?.Dialog?.isActive) {
                window.agentlet.utils.Dialog.hide();
            }
        }, {
            description: 'Close active dialog',
            allowInInputs: true
        });
        
        console.log('⌨️ Default Agentlet shortcuts registered');
    }
    
    /**
     * Show help dialog with all registered shortcuts
     */
    showHelp() {
        if (!window.agentlet?.utils?.Dialog) {
            console.warn('⌨️ Dialog not available for shortcuts help');
            return;
        }
        
        const shortcuts = this.getShortcuts();
        const shortcutsList = shortcuts.map(shortcut => 
            `<tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; background: #f8f9fa;">
                    <kbd style="background: #e9ecef; padding: 2px 6px; border-radius: 3px; font-size: 12px;">
                        ${shortcut.keys.replace(/,/g, '</kbd> or <kbd style="background: #e9ecef; padding: 2px 6px; border-radius: 3px; font-size: 12px;">')}
                    </kbd>
                </td>
                <td style="padding: 8px; border: 1px solid #ddd;">${shortcut.description}</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px; color: #666;">
                    ${shortcut.allowInInputs ? 'Everywhere' : 'Outside inputs'}
                </td>
            </tr>`
        ).join('');
        
        const content = `
            <div style="max-height: 400px; overflow-y: auto;">
                <p>Currently registered keyboard shortcuts:</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background: #f8f9fa;">
                            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Shortcut</th>
                            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Description</th>
                            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Context</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shortcutsList || '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #666;">No shortcuts registered</td></tr>'}
                    </tbody>
                </table>
                
                <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px;">
                    <h4 style="margin: 0 0 10px 0; color: #007bff;">💡 Tips:</h4>
                    <ul style="margin: 0; padding-left: 20px;">
                        <li><strong>esc</strong> - Close active dialog</li>
                        <li>Some shortcuts may not work in input fields for security</li>
                        <li>Quick command shortcut (ctrl+; / cmd+;) is available if enabled in config</li>
                    </ul>
                </div>
            </div>
        `;
        
        window.agentlet.utils.Dialog.show('info', {
            title: 'Keyboard Shortcuts',
            message: content,
            icon: '⌨️',
            allowHtml: true,
            buttons: [
                { text: 'Close', value: 'close', primary: true }
            ]
        });
    }
    
    /**
     * Create a proxy object for global access
     */
    createProxy() {
        return {
            register: (keys, callback, options) => this.register(keys, callback, options),
            unregister: (keys, scope) => this.unregister(keys, scope),
            setEnabled: (enabled) => this.setEnabled(enabled),
            getShortcuts: () => this.getShortcuts(),
            isRegistered: (keys) => this.isRegistered(keys),
            clear: () => this.clear(),
            showHelp: () => this.showHelp(),
            enabled: this.enabled
        };
    }
}

export default ShortcutManager;