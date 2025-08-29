/**
 * Enhanced Base Submodule class for Agentlet Core
 * Provides extensible submodule functionality with lifecycle management
 */
export default class BaseSubmodule {
    constructor(config = {}) {
        // Validate configuration
        this.validateConfig(config);
        
        // Core properties
        this.name = config.name;
        this.version = config.version || '1.0.0';
        this.description = config.description || '';
        this.parentModule = config.parentModule;
        
        // Pattern matching configuration
        this.patterns = Array.isArray(config.patterns) ? config.patterns : [config.urlPattern].filter(Boolean);
        this.matchMode = config.matchMode || 'includes';
        this.customMatcher = config.customMatcher;
        
        // State management
        this.isActive = false;
        this.lastExecutionResult = null;
        
        // Event system
        this.eventListeners = new Map();
        this.eventBus = config.eventBus;
        
        // Plugin capabilities
        this.capabilities = config.capabilities || [];
        this.permissions = config.permissions || [];
        this.dependencies = config.dependencies || [];
        this.settings = { ...this.getDefaultSettings(), ...config.settings };
        
        // Template system
        this.template = config.template;
        this.templateEngine = config.templateEngine;
        
        // Simplified lifecycle hooks
        this.hooks = {
            init: config.init || this.initSubmodule.bind(this),
            activate: config.activate || this.activateSubmodule.bind(this),
            cleanup: config.cleanup || this.cleanupSubmodule.bind(this)
        };
        
        // Storage change notifications
        this.requiresLocalStorageChangeNotification = config.requiresLocalStorageChangeNotification || false;
        
        // Performance tracking
        this.performanceMetrics = {
            initTime: 0,
            executionTime: 0,
            totalExecutions: 0,
            successfulExecutions: 0,
            failedExecutions: 0
        };
        
        // Execution history
        this.executionHistory = [];
        this.maxHistorySize = config.maxHistorySize || 50;
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
            parentModule: { type: 'string', required: false },
            capabilities: { type: 'array', required: false },
            permissions: { type: 'array', required: false },
            dependencies: { type: 'array', required: false },
            settings: { type: 'object', required: false }
        };
    }

    /**
     * Validate submodule configuration
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
            throw new Error(`Submodule configuration validation failed: ${errors.join('; ')}`);
        }
    }

    /**
     * Enhanced pattern matching
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
                    console.warn(`Invalid regex pattern in submodule ${this.name}:`, pattern);
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
                    console.warn(`Custom matcher error in submodule ${this.name}:`, e);
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
     * Simplified lifecycle hook: Complete submodule initialization
     * Called once during submodule startup
     */
    // eslint-disable-next-line require-await
    async initSubmodule() {
        console.log(`Initializing submodule: ${this.name}`);
        this.emit('lifecycle:init');
        
        // Override this method in your submodule for custom initialization logic
    }

    /**
     * Simplified lifecycle hook: Activate submodule functionality
     * Called when submodule becomes active or needs to execute
     */
    // eslint-disable-next-line require-await
    async activateSubmodule(context = {}) {
        console.log(`Activating submodule: ${this.name}`, context);
        this.emit('lifecycle:activate', context);
        
        // Override this method in your submodule for custom activation logic
    }

    /**
     * Simplified lifecycle hook: Clean up submodule resources
     * Called during submodule deactivation or cleanup
     */
    // eslint-disable-next-line require-await
    async cleanupSubmodule(context = {}) {
        console.log(`Cleaning up submodule: ${this.name}`, context);
        this.emit('lifecycle:cleanup', context);
        
        // Override this method in your submodule for custom cleanup logic
    }

    /**
     * Enhanced initialization with lifecycle management
     */
    async init() {
        const startTime = performance.now();
        
        try {
            // Call new simplified init hook (which calls old hooks for compatibility)
            await this.hooks.init();
            
            this.isActive = true;
            
            // Perform submodule-specific initialization
            await this.performInitialization();
            
            this.performanceMetrics.initTime = performance.now() - startTime;
            this.emit('initialized', { metrics: this.performanceMetrics });
            
            console.log(`Submodule ${this.name} initialized in ${this.performanceMetrics.initTime.toFixed(2)}ms`);
            
        } catch (error) {
            this.emit('error', { phase: 'initialization', error });
            throw new Error(`Failed to initialize submodule ${this.name}: ${error.message}`);
        }
    }

    /**
     * Override this method for custom initialization logic
     */
    // eslint-disable-next-line require-await
    async performInitialization() {
        console.log(`Initializing submodule: ${this.name}`);
    }

    /**
     * Enhanced cleanup with lifecycle hooks
     */
    async cleanup() {
        try {
            // Call new simplified cleanup hook (which calls old hooks for compatibility)
            await this.hooks.cleanup();
            
            this.isActive = false;
            this.removeEventListeners();
            
            // Perform submodule-specific cleanup
            await this.performCleanup();
            
            this.emit('cleanup');
            console.log(`Submodule ${this.name} cleaned up`);
            
        } catch (error) {
            this.emit('error', { phase: 'cleanup', error });
            console.error(`Error cleaning up submodule ${this.name}:`, error);
        }
    }

    /**
     * Override this method for custom cleanup logic
     */
    // eslint-disable-next-line require-await
    async performCleanup() {
        console.log(`Cleaning up submodule: ${this.name}`);
    }

    /**
     * Execute submodule functionality with comprehensive tracking
     */
    async execute(params = {}) {
        const startTime = performance.now();
        const executionId = this.generateExecutionId();
        
        try {
            // Call new simplified activate hook for execution
            await this.hooks.activate({ trigger: 'execute', params });
            
            this.performanceMetrics.totalExecutions++;
            this.emit('executionStarted', { executionId, params });
            
            // Perform the actual submodule work
            const result = await this.performExecution(params);
            
            const executionTime = performance.now() - startTime;
            this.performanceMetrics.executionTime += executionTime;
            this.performanceMetrics.successfulExecutions++;
            this.lastExecutionResult = result;
            
            // Record execution in history
            this.recordExecution({
                id: executionId,
                timestamp: new Date().toISOString(),
                params,
                result,
                executionTime,
                success: true
            });
            
            // Call new simplified cleanup hook with result
            await this.hooks.cleanup({ trigger: 'postExecution', result });
            
            this.emit('executionCompleted', { 
                executionId, 
                result, 
                executionTime,
                metrics: this.performanceMetrics 
            });
            
            return result;
            
        } catch (error) {
            const executionTime = performance.now() - startTime;
            this.performanceMetrics.failedExecutions++;
            
            // Record failed execution
            this.recordExecution({
                id: executionId,
                timestamp: new Date().toISOString(),
                params,
                error: error.message,
                executionTime,
                success: false
            });
            
            // Call cleanup hook even on failure
            try {
                await this.hooks.cleanup({ trigger: 'postExecution', error });
            } catch (cleanupError) {
                console.warn(`Cleanup error after failed execution in ${this.name}:`, cleanupError);
            }
            
            this.emit('executionFailed', { 
                executionId, 
                error, 
                executionTime,
                metrics: this.performanceMetrics 
            });
            
            throw error;
        }
    }

    /**
     * Override this method to implement submodule functionality
     */
    // eslint-disable-next-line require-await
    async performExecution(params) {
        console.log(`Executing submodule ${this.name} with params:`, params);
        return { message: 'Default execution completed', params };
    }

    /**
     * Generate unique execution ID
     */
    generateExecutionId() {
        return `${this.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Record execution in history
     */
    recordExecution(execution) {
        this.executionHistory.unshift(execution);
        
        // Limit history size
        if (this.executionHistory.length > this.maxHistorySize) {
            this.executionHistory = this.executionHistory.slice(0, this.maxHistorySize);
        }
        
        this.emit('executionRecorded', { execution });
    }

    /**
     * Get execution history
     */
    getExecutionHistory(limit = 10) {
        return this.executionHistory.slice(0, limit);
    }

    /**
     * Clear execution history
     */
    clearExecutionHistory() {
        this.executionHistory = [];
        this.emit('historyCleared');
    }

    /**
     * Enhanced content generation
     */
    getContent(context = {}) {
        try {
            const template = this.getTemplate();
            const data = { ...this.getTemplateData(), ...context };
            return this.renderTemplate(template, data);
            
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
            <div class="agentlet-submodule-content" data-submodule="{{name}}">
                <div class="agentlet-submodule-header">
                    <h4>{{displayName}}</h4>
                    <span class="agentlet-submodule-status {{statusClass}}">{{status}}</span>
                </div>
                <div class="agentlet-submodule-body">
                    <p><strong>Description:</strong> {{description}}</p>
                    <p><strong>Executions:</strong> {{totalExecutions}} ({{successRate}}% success)</p>
                    {{#if lastResult}}
                    <div class="agentlet-last-result">
                        <strong>Last Result:</strong> {{lastResult}}
                    </div>
                    {{/if}}
                </div>
                <div class="agentlet-submodule-actions">
                    {{actions}}
                </div>
            </div>
        `;
    }

    /**
     * Get data for template rendering
     */
    getTemplateData() {
        const successRate = this.performanceMetrics.totalExecutions > 0 
            ? ((this.performanceMetrics.successfulExecutions / this.performanceMetrics.totalExecutions) * 100).toFixed(1)
            : 0;
            
        return {
            name: this.name,
            displayName: this.name.charAt(0).toUpperCase() + this.name.slice(1),
            version: this.version,
            description: this.description,
            status: this.isActive ? 'Active' : 'Inactive',
            statusClass: this.isActive ? 'active' : 'inactive',
            totalExecutions: this.performanceMetrics.totalExecutions,
            successfulExecutions: this.performanceMetrics.successfulExecutions,
            failedExecutions: this.performanceMetrics.failedExecutions,
            successRate,
            averageExecutionTime: this.performanceMetrics.totalExecutions > 0 
                ? (this.performanceMetrics.executionTime / this.performanceMetrics.totalExecutions).toFixed(2)
                : 0,
            lastResult: this.lastExecutionResult ? JSON.stringify(this.lastExecutionResult) : null,
            actions: this.getActionButtons(),
            parentModule: this.parentModule
        };
    }

    /**
     * Simple template rendering
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
     * Get action buttons for the submodule
     */
    getActionButtons() {
        return `
            <button class="agentlet-btn agentlet-btn-sm" onclick="window.agentlet.submodules.get('${this.name}').execute()">
                Execute
            </button>
            <button class="agentlet-btn agentlet-btn-sm agentlet-btn-secondary" onclick="window.agentlet.submodules.get('${this.name}').showHistory()">
                History
            </button>
        `;
    }

    /**
     * Fallback content when rendering fails
     */
    getFallbackContent() {
        return `
            <div class="agentlet-submodule-error">
                <h4>${this.name} Submodule</h4>
                <p>Error rendering submodule content</p>
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
        return this;
    }

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

    emit(event, data = {}) {
        // Local listeners
        const listeners = this.eventListeners.get(event) || [];
        listeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in submodule event listener for ${event}:`, error);
            }
        });
        
        // Global event bus
        if (this.eventBus && typeof this.eventBus.emit === 'function') {
            this.eventBus.emit(`submodule:${this.name}:${event}`, {
                submodule: this.name,
                parentModule: this.parentModule,
                event,
                data
            });
        }
        
        return this;
    }

    removeEventListeners() {
        this.eventListeners.clear();
    }

    /**
     * Check if submodule has specific capability
     */
    hasCapability(capability) {
        return this.capabilities.includes(capability);
    }

    /**
     * Get default settings
     */
    getDefaultSettings() {
        return {
            enabled: true,
            autoExecute: false,
            debugMode: false,
            logLevel: 'info'
        };
    }

    /**
     * Update submodule settings
     */
    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.emit('settingsUpdated', { settings: this.settings });
    }

    /**
     * Enhanced URL update handling
     */
    async updatedURL(newUrl) {
        console.log(`${this.name} submodule: URL updated to ${newUrl}`);
        
        try {
            // Perform URL-specific logic
            await this.handleURLUpdate(newUrl);
            
            this.emit('urlUpdated', { url: newUrl });
            
        } catch (error) {
            this.emit('error', { phase: 'urlUpdate', error, url: newUrl });
        }
    }

    /**
     * Override this method for custom URL update handling
     */
    // eslint-disable-next-line require-await
    async handleURLUpdate(newUrl) {
        console.log(`Handling URL update in ${this.name} submodule: ${newUrl}`);
    }

    /**
     * localStorage change handler
     */
    onLocalStorageChange(key, newValue) {
        console.log(`${this.name} submodule: localStorage changed - ${key} = ${newValue}`);
        this.emit('localStorageChange', { key, newValue });
    }

    /**
     * Show execution history (can be overridden for custom UI)
     */
    showHistory() {
        const history = this.getExecutionHistory();
        console.table(history);
        this.emit('historyDisplayed', { history });
    }

    /**
     * Get submodule metadata
     */
    getMetadata() {
        return {
            name: this.name,
            version: this.version,
            description: this.description,
            parentModule: this.parentModule,
            patterns: this.patterns,
            matchMode: this.matchMode,
            capabilities: this.capabilities,
            permissions: this.permissions,
            dependencies: this.dependencies,
            isActive: this.isActive,
            performanceMetrics: this.performanceMetrics,
            settings: this.settings,
            executionHistorySize: this.executionHistory.length
        };
    }

    /**
     * Export submodule configuration
     */
    exportConfig() {
        return {
            name: this.name,
            version: this.version,
            patterns: this.patterns,
            matchMode: this.matchMode,
            parentModule: this.parentModule,
            settings: this.settings
        };
    }
}