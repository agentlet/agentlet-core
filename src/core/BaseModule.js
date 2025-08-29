/**
 * Enhanced Base Module class for Agentlet Core
 * Provides extensive extensibility and plugin capabilities
 */
export default class BaseModule {
    constructor(config = {}) {
        // Validate configuration
        this.validateConfig(config);
        
        // Core properties
        this.name = config.name;
        this.version = config.version || '1.0.0';
        this.description = config.description || '';
        
        // Pattern matching configuration
        this.patterns = Array.isArray(config.patterns) ? config.patterns : [config.urlPattern].filter(Boolean);
        this.matchMode = config.matchMode || 'includes'; // includes|regex|exact|custom
        this.customMatcher = config.customMatcher;
        
        // State management
        this.isActive = false;
        this.submodules = [];
        this.activeSubmodule = null;
        
        // Event system
        this.eventListeners = new Map();
        this.eventBus = config.eventBus;
        this.onSubmoduleChange = null;
        
        // Plugin capabilities
        this.capabilities = config.capabilities || [];
        this.permissions = config.permissions || [];
        this.dependencies = config.dependencies || [];
        this.settings = { ...this.getDefaultSettings(), ...config.settings };
        
        // Template system
        this.template = config.template;
        this.templateEngine = config.templateEngine;
        
        // Simplified lifecycle hooks (can be overridden)
        this.hooks = {
            init: config.init || this.initModule.bind(this),
            activate: config.activate || this.activateModule.bind(this),
            cleanup: config.cleanup || this.cleanupModule.bind(this)
        };
        
        // Storage change notifications
        this.requiresLocalStorageChangeNotification = config.requiresLocalStorageChangeNotification || false;
        
        // CSS injection
        this.injectedStyles = new Set();
        this.styleElement = null;
        
        // Performance tracking
        this.performanceMetrics = {
            initTime: 0,
            pageAnalysisTime: 0,
            renderTime: 0
        };
    }

    /**
     * Configuration schema for validation
     */
    static getConfigSchema() {
        return {
            name: { type: 'string', required: true },
            version: { type: 'string', required: false },
            patterns: { type: 'array', required: true },
            matchMode: { type: 'string', enum: ['includes', 'regex', 'exact', 'custom'], required: false },
            capabilities: { type: 'array', required: false },
            permissions: { type: 'array', required: false },
            dependencies: { type: 'array', required: false },
            settings: { type: 'object', required: false }
        };
    }

    /**
     * Validate module configuration against schema
     */
    validateConfig(config) {
        const schema = this.constructor.getConfigSchema();
        const errors = [];
        
        for (const [key, rules] of Object.entries(schema)) {
            const value = config[key];
            
            if (rules.required && (value === undefined || value === null)) {
                errors.push(`Required field '${key}' is missing`);
                continue;
            }
            
            if (value !== undefined) {
                if (rules.type === 'array' && !Array.isArray(value)) {
                    errors.push(`Field '${key}' must be an array`);
                }
                
                if (rules.type === 'string' && typeof value !== 'string') {
                    errors.push(`Field '${key}' must be a string`);
                }
                
                if (rules.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
                    errors.push(`Field '${key}' must be an object`);
                }
                
                if (rules.enum && !rules.enum.includes(value)) {
                    errors.push(`Field '${key}' must be one of: ${rules.enum.join(', ')}`);
                }
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`Module configuration validation failed: ${errors.join('; ')}`);
        }
    }

    /**
     * Enhanced pattern matching with multiple strategies
     */
    checkPattern(url) {
        if (!this.patterns || this.patterns.length === 0) {
            return false;
        }
        
        switch (this.matchMode) {
        case 'regex':
            return this.patterns.some(pattern => {
                try {
                    return new RegExp(pattern).test(url);
                } catch (_e) {
                    console.warn(`Invalid regex pattern in module ${this.name}:`, pattern);
                    return false;
                }
            });
                
        case 'exact':
            return this.patterns.includes(url);
                
        case 'custom':
            if (typeof this.customMatcher === 'function') {
                try {
                    return this.customMatcher(url, this.patterns);
                } catch (e) {
                    console.warn(`Custom matcher error in module ${this.name}:`, e);
                    return false;
                }
            }
            return false;
                
        default: // 'includes'
            return this.patterns.some(pattern => url.includes(pattern));
        }
    }

    // =================
    // SIMPLIFIED LIFECYCLE HOOKS
    // =================

    /**
     * Simplified lifecycle hook: Complete module initialization
     * Called once during module startup
     */
    // eslint-disable-next-line require-await
    async initModule() {
        console.log(`Initializing module: ${this.name}`);
        this.emit('lifecycle:init');
        
        // Override this method in your module for custom initialization logic
    }

    /**
     * Simplified lifecycle hook: Activate module functionality
     * Called when module becomes active or URL changes
     */
    // eslint-disable-next-line require-await
    async activateModule(context = {}) {
        console.log(`Activating module: ${this.name}`, context);
        this.emit('lifecycle:activate', context);
        
        // Override this method in your module for custom activation logic
    }

    /**
     * Simplified lifecycle hook: Clean up module resources
     * Called during module deactivation or system shutdown
     */
    // eslint-disable-next-line require-await
    async cleanupModule(context = {}) {
        console.log(`Cleaning up module: ${this.name}`, context);
        this.emit('lifecycle:cleanup', context);
        
        // Override this method in your module for custom cleanup logic
    }

    /**
     * Main initialization method with comprehensive lifecycle management
     */
    async init() {
        const startTime = performance.now();
        
        try {
            // Call new simplified init hook (which calls old hooks for compatibility)
            await this.hooks.init();
            
            this.isActive = true;
            
            // Core initialization
            await this.analyzePage();
            await this.launchModule();
            this.checkSubmodules(window.location.href);
            
            // Inject CSS styles
            this.injectStyles();
            
            this.performanceMetrics.initTime = performance.now() - startTime;
            this.emit('initialized', { metrics: this.performanceMetrics });
            
            console.log(`Module ${this.name} initialized in ${this.performanceMetrics.initTime.toFixed(2)}ms`);
            
        } catch (error) {
            this.emit('error', { phase: 'initialization', error });
            throw new Error(`Failed to initialize module ${this.name}: ${error.message}`);
        }
    }

    /**
     * Get CSS styles for the module
     * Override this method in modules to provide custom styles
     * @returns {string} CSS styles to inject
     */
    getStyles() {
        return `
            /* Default styles for ${this.name} module */
            .agentlet-module-${this.name} {
                /* Module-specific styles can be added here */
            }
        `;
    }

    /**
     * Inject CSS styles into the page
     * @param {string} styles - CSS styles to inject
     * @param {string} id - Optional ID for the style element
     */
    injectStyles(styles = null, id = null) {
        if (!styles) {
            styles = this.getStyles();
        }
        
        if (!styles || styles.trim() === '') {
            return; // No styles to inject
        }
        
        // Remove existing styles if updating
        this.removeStyles();
        
        // Create style element
        this.styleElement = document.createElement('style');
        this.styleElement.textContent = styles;
        
        // Set ID if provided
        if (id) {
            this.styleElement.id = id;
        } else {
            this.styleElement.id = `agentlet-module-${this.name}-styles`;
        }
        
        // Add data attributes for identification
        this.styleElement.setAttribute('data-agentlet-module', this.name);
        this.styleElement.setAttribute('data-agentlet-version', this.version);
        
        // Inject into document head
        document.head.appendChild(this.styleElement);
        
        // Track injected styles
        this.injectedStyles.add(this.styleElement.id);
        
        this.emit('stylesInjected', { 
            module: this.name, 
            styleId: this.styleElement.id,
            stylesLength: styles.length 
        });
        
        console.log(`Module ${this.name}: CSS styles injected (${styles.length} characters)`);
    }

    /**
     * Remove injected CSS styles
     */
    removeStyles() {
        if (this.styleElement && this.styleElement.parentNode) {
            this.styleElement.parentNode.removeChild(this.styleElement);
            this.injectedStyles.delete(this.styleElement.id);
            this.styleElement = null;
            
            this.emit('stylesRemoved', { module: this.name });
            console.log(`Module ${this.name}: CSS styles removed`);
        }
    }

    /**
     * Update CSS styles (remove old and inject new)
     * @param {string} newStyles - New CSS styles
     * @param {string} id - Optional ID for the style element
     */
    updateStyles(newStyles = null, id = null) {
        this.removeStyles();
        this.injectStyles(newStyles, id);
    }

    /**
     * Get all currently injected style IDs for this module
     * @returns {Array} Array of style element IDs
     */
    getInjectedStyleIds() {
        return Array.from(this.injectedStyles);
    }

    /**
     * Check if styles are currently injected
     * @returns {boolean} True if styles are injected
     */
    hasInjectedStyles() {
        return this.styleElement !== null && this.styleElement.parentNode !== null;
    }

    /**
     * Enhanced cleanup with lifecycle hooks
     */
    async cleanup() {
        try {
            // Call new simplified cleanup hook (which calls old hooks for compatibility)
            await this.hooks.cleanup();
            
            this.isActive = false;
            this.cleanupSubmodules();
            this.removeEventListeners();
            
            // Remove injected styles
            this.removeStyles();
            
            this.emit('cleanup');
            console.log(`Module ${this.name} cleaned up`);
            
        } catch (error) {
            this.emit('error', { phase: 'cleanup', error });
            console.error(`Error cleaning up module ${this.name}:`, error);
        }
    }

    /**
     * Enhanced page analysis with performance tracking
     */
    async analyzePage() {
        const startTime = performance.now();
        
        try {
            // Override this method in modules for custom analysis
            await this.performPageAnalysis();
            
            this.performanceMetrics.pageAnalysisTime = performance.now() - startTime;
            this.emit('pageAnalyzed', { 
                url: window.location.href,
                metrics: this.performanceMetrics 
            });
            
        } catch (error) {
            this.emit('error', { phase: 'pageAnalysis', error });
            console.error(`Error analyzing page in module ${this.name}:`, error);
        }
    }

    /**
     * Override this method for custom page analysis
     */
    // eslint-disable-next-line require-await
    async performPageAnalysis() {
        console.log(`Analyzing page for ${this.name} module`);
    }

    /**
     * Enhanced module launching
     */
    async launchModule() {
        try {
            // Override this method in modules for custom module launching
            await this.performModuleLaunch();
            
            this.emit('moduleLaunched');
            
        } catch (error) {
            this.emit('error', { phase: 'moduleLaunch', error });
            console.error(`Error launching module ${this.name}:`, error);
        }
    }

    /**
     * Override this method for custom module launching
     */
    // eslint-disable-next-line require-await
    async performModuleLaunch() {
        console.log(`Launching ${this.name} module`);
    }

    /**
     * Enhanced content generation with template system
     */
    getContent(context = {}) {
        const startTime = performance.now();
        
        try {
            const template = this.getTemplate();
            const data = { ...this.getTemplateData(), ...context };
            const content = this.renderTemplate(template, data);
            
            // Add content from active submodule
            const submoduleContent = this.activeSubmodule ? this.activeSubmodule.getContent(context) : '';
            
            this.performanceMetrics.renderTime = performance.now() - startTime;
            
            return content + submoduleContent;
            
        } catch (error) {
            this.emit('error', { phase: 'contentGeneration', error });
            return this.getFallbackContent();
        }
    }

    /**
     * Get template for content rendering
     */
    getTemplate() {
        return this.template || this.getDefaultTemplate();
    }

    /**
     * Get default template
     */
    getDefaultTemplate() {
        return `
            <div class="agentlet-module-content" data-module="{{name}}">
                <div class="agentlet-module-header">
                    <h3>{{displayName}} AI Assistant</h3>
                    <span class="agentlet-module-version">v{{version}}</span>
                </div>
                <div class="agentlet-module-body">
                    <p><strong>Current URL:</strong> {{url}}</p>
                    <p><strong>Status:</strong> {{status}}</p>
                    {{#if activeSubmodule}}
                    <p><strong>Active Submodule:</strong> {{activeSubmodule}}</p>
                    {{/if}}
                </div>
                <div class="agentlet-module-actions">
                    {{actions}}
                </div>
            </div>
        `;
    }

    /**
     * Get data for template rendering
     */
    getTemplateData() {
        return {
            name: this.name,
            displayName: this.name.charAt(0).toUpperCase() + this.name.slice(1),
            version: this.version,
            description: this.description,
            url: window.location.href,
            status: this.isActive ? 'Active' : 'Inactive',
            activeSubmodule: this.activeSubmodule?.name || null,
            capabilities: this.capabilities,
            actions: this.getActionButtons()
        };
    }

    /**
     * Simple template rendering (can be enhanced with external engines)
     */
    renderTemplate(template, data) {
        if (this.templateEngine && typeof this.templateEngine.render === 'function') {
            return this.templateEngine.render(template, data);
        }
        
        // Simple template engine
        return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            const value = data[key];
            return value !== undefined ? value : '';
        }).replace(/\{\{#if (\w+)\}\}(.*?)\{\{\/if\}\}/gs, (match, key, content) => {
            return data[key] ? content : '';
        });
    }

    /**
     * Get action buttons for the module
     */
    getActionButtons() {
        return `
            <button class="agentlet-btn agentlet-btn-primary" onclick="window.agentlet.modules.get('${this.name}').performAction('analyze')">
                Analyze Page
            </button>
        `;
    }

    /**
     * Fallback content when rendering fails
     */
    getFallbackContent() {
        return `
            <div class="agentlet-module-error">
                <h3>${this.name} Module</h3>
                <p>Error rendering module content</p>
            </div>
        `;
    }

    /**
     * Event system implementation
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
        return this; // Allow chaining
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
        return this;
    }

    /**
     * Emit event to listeners and global event bus
     */
    emit(event, data = {}) {
        // Local listeners
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event listener for ${event}:`, error);
            }
        });
        
        // Global event bus
        if (this.eventBus && typeof this.eventBus.emit === 'function') {
            this.eventBus.emit(`module:${this.name}:${event}`, {
                module: this.name,
                event,
                data
            });
        }
        
        return this;
    }

    /**
     * Remove all event listeners
     */
    removeEventListeners() {
        this.eventListeners.clear();
    }

    /**
     * Check if module has specific capability
     */
    hasCapability(capability) {
        return this.capabilities.includes(capability);
    }

    /**
     * Request permission for sensitive operations
     */
    async requestPermission(permission) {
        if (this.permissions.includes(permission)) {
            return true;
        }
        
        // Integration with permission system
        if (this.eventBus && typeof this.eventBus.request === 'function') {
            try {
                const granted = await this.eventBus.request('permission:request', {
                    module: this.name,
                    permission: permission
                });
                
                if (granted) {
                    this.permissions.push(permission);
                }
                
                return granted;
            } catch (error) {
                console.error(`Error requesting permission ${permission}:`, error);
                return false;
            }
        }
        
        return false;
    }

    /**
     * Get default settings
     */
    getDefaultSettings() {
        return {
            enabled: true,
            debugMode: false,
            logLevel: 'info'
        };
    }

    /**
     * Update module settings
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.emit('settingsUpdated', { settings: this.settings });
    }

    /**
     * Enhanced URL update handling
     */
    async updatedURL(newUrl) {
        const oldUrl = this.lastUrl || window.location.href;
        this.lastUrl = newUrl;
        
        console.log(`${this.name} module: URL updated from ${oldUrl} to ${newUrl}`);
        
        try {
            // Call new simplified activate hook with URL context
            await this.hooks.activate({ oldUrl, newUrl, trigger: 'urlChange' });
            
            if (this.checkPattern(newUrl)) {
                console.log(`Still on ${this.name} application`);
                
                // Check submodules if module is active
                if (this.submodules.length > 0) {
                    this.checkSubmodules(newUrl);
                }
            } else {
                if (this.isActive) {
                    console.log(`Left ${this.name} application`);
                    this.emit('applicationLeft', { oldUrl, newUrl });
                }
            }
        } catch (error) {
            this.emit('error', { phase: 'urlUpdate', error, oldUrl, newUrl });
        }
    }

    /**
     * Enhanced submodule management
     */
    setSubmoduleChangeCallback(callback) {
        this.onSubmoduleChange = callback;
    }

    /**
     * Check and manage submodules
     */
    checkSubmodules(url) {
        if (this.submodules.length === 0) return;
        
        console.log(`Checking submodules for ${this.name} module, URL: ${url}`);
        
        // First, deactivate submodule if it no longer matches
        if (this.activeSubmodule && !this.activeSubmodule.checkPattern(url)) {
            console.log(`Deactivating submodule: ${this.activeSubmodule.name}`);
            this.activeSubmodule.cleanup();
            this.activeSubmodule = null;
            this.emit('submoduleDeactivated');
        }

        // Then, find the first matching submodule and activate only that one
        for (const submodule of this.submodules) {
            if (submodule.checkPattern(url)) {
                if (this.activeSubmodule !== submodule) {
                    // Deactivate any currently active submodule first
                    if (this.activeSubmodule) {
                        console.log(`Deactivating previous submodule: ${this.activeSubmodule.name}`);
                        this.activeSubmodule.cleanup();
                    }
                    
                    // Activate the new submodule
                    console.log(`Activating submodule: ${submodule.name}`);
                    submodule.init();
                    this.activeSubmodule = submodule;
                    this.emit('submoduleActivated', { submodule: submodule.name });
                    break;
                } else {
                    // Update existing submodule
                    submodule.updatedURL(url);
                    break;
                }
            }
        }

        console.log(`Active submodule: ${this.activeSubmodule ? this.activeSubmodule.name : 'None'}`);
        
        // Always notify main app when submodules change
        if (this.onSubmoduleChange) {
            this.onSubmoduleChange();
        }
    }

    /**
     * Cleanup all submodules
     */
    cleanupSubmodules() {
        if (this.activeSubmodule) {
            this.activeSubmodule.cleanup();
            this.activeSubmodule = null;
            this.emit('submoduleDeactivated');
        }
    }

    /**
     * Enhanced localStorage change handler
     */
    onLocalStorageChange(key, newValue) {
        console.log(`${this.name} module: localStorage changed - ${key} = ${newValue}`);
        
        this.emit('localStorageChange', { key, newValue });
        
        // If this module has an active submodule, notify it if it requested notifications
        if (this.activeSubmodule && this.activeSubmodule.requiresLocalStorageChangeNotification 
            && typeof this.activeSubmodule.onLocalStorageChange === 'function') {
            console.log(`Notifying submodule ${this.activeSubmodule.name} about localStorage change`);
            this.activeSubmodule.onLocalStorageChange(key, newValue);
        }
    }

    /**
     * Perform module action
     */
    async performAction(action, params = {}) {
        try {
            this.emit('actionStarted', { action, params });
            
            switch (action) {
            case 'analyze':
                await this.analyzePage();
                break;
            case 'refresh':
                await this.refreshContent();
                break;
            default:
                if (typeof this[action] === 'function') {
                    await this[action](params);
                } else {
                    throw new Error(`Unknown action: ${action}`);
                }
            }
            
            this.emit('actionCompleted', { action, params });
            
        } catch (error) {
            this.emit('actionFailed', { action, params, error });
            throw error;
        }
    }

    /**
     * Content refresh method
     */
    // eslint-disable-next-line require-await
    async refreshContent() {
        console.log(`${this.name} module: Refreshing content`);
        
        this.emit('contentRefreshStarted');
        
        if (typeof window.agentlet !== 'undefined' && window.agentlet.ui && window.agentlet.ui.refreshContent) {
            window.agentlet.ui.refreshContent(this);
        }
        
        this.emit('contentRefreshCompleted');
    }

    /**
     * Get module metadata
     */
    getMetadata() {
        return {
            name: this.name,
            version: this.version,
            description: this.description,
            patterns: this.patterns,
            matchMode: this.matchMode,
            capabilities: this.capabilities,
            permissions: this.permissions,
            dependencies: this.dependencies,
            isActive: this.isActive,
            activeSubmodule: this.activeSubmodule?.name || null,
            performanceMetrics: this.performanceMetrics,
            settings: this.settings
        };
    }

    /**
     * Export module configuration for persistence
     */
    exportConfig() {
        return {
            name: this.name,
            version: this.version,
            patterns: this.patterns,
            matchMode: this.matchMode,
            settings: this.settings
        };
    }

    /**
     * Override this method to provide a custom panel title
     * @returns {string|null} Custom title or null for default
     */
    getPanelTitle() {
        return null; // Default implementation returns null to use default title
    }
}