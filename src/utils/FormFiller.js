/**
 * FormFiller - Safe, context-aware form filling utility
 * Fills form elements within a specific parent context to avoid collisions
 * Uses AgentletCore's jQuery for better compatibility
 */

class FormFiller {
    constructor(jQueryInstance = null) {
        this.fillAttempts = 0;
        this.successfulFills = 0;
        this.errors = [];
        this.debugMode = false;
        this.$ = jQueryInstance || (typeof window !== 'undefined' && window.agentlet && window.agentlet.$) || null;
        
        if (!this.$ && typeof window !== 'undefined' && window.jQuery) {
            this.$ = window.jQuery;
        }
    }

    /**
     * Fill form elements within a parent context
     * @param {Element} parentElement - Parent element to limit scope
     * @param {Object|Array} selectorValues - Selectors and their values
     * @param {Object} options - Filling options
     * @returns {Object} Filling results
     */
    fillForm(parentElement, selectorValues, options = {}) {
        const config = {
            triggerEvents: options.triggerEvents !== false,
            validateValues: options.validateValues !== false,
            skipDisabled: options.skipDisabled !== false,
            skipReadonly: options.skipReadonly !== false,
            skipHidden: options.skipHidden !== false,
            waitForElement: options.waitForElement || 0,
            retryAttempts: options.retryAttempts || 1,
            debugMode: options.debugMode || false,
            onSuccess: options.onSuccess || null,
            onError: options.onError || null,
            onSkipped: options.onSkipped || null,
            ...options
        };

        this.debugMode = config.debugMode;
        this.fillAttempts = 0;
        this.successfulFills = 0;
        this.errors = [];

        if (this.debugMode) {
            console.log('🔧 FormFiller: Starting fill operation', {
                parentElement: parentElement.tagName + (parentElement.id ? `#${parentElement.id}` : ''),
                selectorCount: Array.isArray(selectorValues) ? selectorValues.length : Object.keys(selectorValues).length,
                config
            });
        }

        // Normalize input to consistent format
        const normalizedValues = this.normalizeSelectorValues(selectorValues);
        
        // Validate parent element
        if (!parentElement || !parentElement.querySelector) {
            throw new Error('Invalid parent element provided');
        }

        const results = {
            total: normalizedValues.length,
            successful: 0,
            failed: 0,
            skipped: 0,
            details: [],
            errors: []
        };

        // Process each selector/value pair
        for (const item of normalizedValues) {
            try {
                const result = this.fillSingleElement(parentElement, item, config);
                results.details.push(result);
                
                if (result.status === 'success') {
                    results.successful++;
                } else if (result.status === 'skipped') {
                    results.skipped++;
                } else {
                    results.failed++;
                }
            } catch (error) {
                const errorResult = {
                    selector: item.selector,
                    status: 'error',
                    error: error.message,
                    element: null
                };
                results.details.push(errorResult);
                results.errors.push(error.message);
                results.failed++;

                if (config.onError) {
                    config.onError(errorResult);
                }
            }
        }

        if (this.debugMode) {
            console.log('✅ FormFiller: Fill operation completed', results);
        }

        return results;
    }

    /**
     * Normalize selector values to consistent format
     */
    normalizeSelectorValues(selectorValues) {
        if (Array.isArray(selectorValues)) {
            // Array format: [{selector, value, type?}, ...]
            return selectorValues.map(item => ({
                selector: item.selector,
                value: item.value,
                type: item.type || null,
                options: item.options || {}
            }));
        } else if (typeof selectorValues === 'object') {
            // Object format: {selector: value, ...}
            return Object.entries(selectorValues).map(([selector, value]) => ({
                selector,
                value,
                type: null,
                options: {}
            }));
        } else {
            throw new Error('selectorValues must be an array or object');
        }
    }

    /**
     * Fill a single element within the parent context
     */
    fillSingleElement(parentElement, item, config) {
        this.fillAttempts++;
        
        const { selector, value, type } = item;
        
        if (this.debugMode) {
            console.log(`🎯 Attempting to fill: ${selector} = ${value}`);
        }

        // Find element within parent context using jQuery
        let element;
        try {
            if (this.$) {
                // Use jQuery for better selector support and scoping
                const $parent = this.$(parentElement);
                const $element = $parent.find(selector);
                
                if ($element.length === 0) {
                    element = null;
                } else if ($element.length === 1) {
                    element = $element[0]; // Get DOM element
                } else {
                    // Multiple elements found, use first one but warn
                    element = $element[0];
                    if (this.debugMode) {
                        console.warn(`Multiple elements found for selector: ${selector}, using first one`);
                    }
                }
            } else {
                // Fallback to native querySelector if jQuery not available
                element = parentElement.querySelector(selector);
            }
        } catch (error) {
            throw new Error(`Invalid selector: ${selector} - ${error.message}`);
        }

        if (!element) {
            if (config.waitForElement > 0) {
                // Try waiting for element to appear
                return this.waitAndFill(parentElement, item, config);
            }
            
            throw new Error(`Element not found with selector: ${selector}`);
        }

        // Verify element is within parent (extra safety check)
        if (this.$) {
            const $parent = this.$(parentElement);
            const $element = this.$(element);
            if (!$parent.find($element).length && !$parent.is($element)) {
                throw new Error(`Element found but not within parent context: ${selector}`);
            }
        } else {
            if (!parentElement.contains(element)) {
                throw new Error(`Element found but not within parent context: ${selector}`);
            }
        }

        // Check if element should be skipped
        const skipReason = this.shouldSkipElement(element, config);
        if (skipReason) {
            const result = {
                selector,
                status: 'skipped',
                reason: skipReason,
                element: this.getElementInfo(element)
            };
            
            if (config.onSkipped) {
                config.onSkipped(result);
            }
            
            return result;
        }

        // Determine element type if not provided
        const elementType = type || this.getElementType(element);
        
        // Validate value for element type
        if (config.validateValues && !this.validateValue(element, value, elementType)) {
            throw new Error(`Invalid value for ${elementType} element: ${value}`);
        }

        // Perform the fill
        const fillResult = this.performFill(element, value, elementType, config);
        
        if (fillResult.success) {
            this.successfulFills++;
            
            const result = {
                selector,
                status: 'success',
                value: fillResult.finalValue,
                element: this.getElementInfo(element),
                events: fillResult.events || []
            };
            
            if (config.onSuccess) {
                config.onSuccess(result);
            }
            
            return result;
        } else {
            throw new Error(fillResult.error || 'Fill operation failed');
        }
    }

    /**
     * Wait for element to appear and then fill
     */
    // eslint-disable-next-line require-await
    async waitAndFill(parentElement, item, config) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const checkInterval = 100; // Check every 100ms
            
            const checkForElement = () => {
                let element = null;
                
                if (this.$) {
                    // Use jQuery to check for element
                    const $parent = this.$(parentElement);
                    const $element = $parent.find(item.selector);
                    element = $element.length > 0 ? $element[0] : null;
                } else {
                    // Fallback to native selector
                    element = parentElement.querySelector(item.selector);
                }
                
                if (element) {
                    // Element found, proceed with fill
                    resolve(this.fillSingleElement(parentElement, item, { ...config, waitForElement: 0 }));
                } else if (Date.now() - startTime > config.waitForElement) {
                    // Timeout reached
                    resolve({
                        selector: item.selector,
                        status: 'failed',
                        error: `Element not found after waiting ${config.waitForElement}ms`,
                        element: null
                    });
                } else {
                    // Keep waiting
                    setTimeout(checkForElement, checkInterval);
                }
            };
            
            checkForElement();
        });
    }

    /**
     * Check if element should be skipped
     */
    shouldSkipElement(element, config) {
        if (config.skipDisabled && element.disabled) {
            return 'Element is disabled';
        }
        
        if (config.skipReadonly && element.readOnly) {
            return 'Element is readonly';
        }
        
        if (config.skipHidden && this.isHidden(element)) {
            return 'Element is hidden';
        }
        
        return null;
    }

    /**
     * Check if element is hidden
     */
    isHidden(element) {
        if (this.$) {
            // Use jQuery's more reliable visibility detection
            const $element = this.$(element);
            return element.type === 'hidden' ||
                   !$element.is(':visible') ||
                   $element.css('display') === 'none' ||
                   $element.css('visibility') === 'hidden' ||
                   element.hidden;
        } else {
            // Fallback to native checks
            return element.type === 'hidden' ||
                   element.style.display === 'none' ||
                   element.style.visibility === 'hidden' ||
                   element.hidden ||
                   element.offsetWidth === 0 ||
                   element.offsetHeight === 0;
        }
    }

    /**
     * Get element type for filling logic
     */
    getElementType(element) {
        const tagName = element.tagName.toLowerCase();
        
        if (tagName === 'input') {
            return element.type || 'text';
        }
        
        return tagName;
    }

    /**
     * Validate value for element type
     */
    validateValue(element, value, elementType) {
        switch (elementType) {
        case 'email':
            return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        case 'url':
            try {
                return !value || new URL(value);
            } catch {
                return false;
            }
        case 'number':
        case 'range': {
            const num = parseFloat(value);
            if (isNaN(num)) return false;
            if (element.min && num < parseFloat(element.min)) return false;
            if (element.max && num > parseFloat(element.max)) return false;
            return true;
        }
        case 'date':
        case 'datetime-local':
        case 'time':
            return !value || !isNaN(Date.parse(value));
        case 'tel':
            return !value || /^[\d\s\-+()]+$/.test(value);
        case 'select':
            // Check if value exists in options
            if (this.$) {
                const $element = this.$(element);
                const optionExists = $element.find(`option[value="${value}"]`).length > 0;
                return !value || optionExists;
            } else {
                const option = Array.from(element.options).find(opt => opt.value === value);
                return !value || !!option;
            }
        default:
            return true; // Most types accept any string
        }
    }

    /**
     * Perform the actual fill operation
     */
    performFill(element, value, elementType, config) {
        const events = [];
        let finalValue = value;
        
        try {
            switch (elementType) {
            case 'text':
            case 'password':
            case 'email':
            case 'url':
            case 'tel':
            case 'search':
            case 'number':
            case 'hidden':
                element.value = value;
                finalValue = element.value;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'input');
                    this.dispatchEvent(element, 'change');
                    events.push('input', 'change');
                }
                break;

            case 'textarea':
                element.value = value;
                finalValue = element.value;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'input');
                    this.dispatchEvent(element, 'change');
                    events.push('input', 'change');
                }
                break;

            case 'select':
                element.value = value;
                finalValue = element.value;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'change');
                    events.push('change');
                }
                break;

            case 'checkbox': {
                const isChecked = this.parseBoolean(value);
                element.checked = isChecked;
                finalValue = element.checked;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'change');
                    events.push('change');
                }
                break;
            }

            case 'radio':
                if (element.value === value || this.parseBoolean(value)) {
                    element.checked = true;
                    finalValue = element.value;
                    if (config.triggerEvents) {
                        this.dispatchEvent(element, 'change');
                        events.push('change');
                    }
                } else {
                    finalValue = null; // Radio not selected
                }
                break;

            case 'range':
                element.value = value;
                finalValue = element.value;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'input');
                    this.dispatchEvent(element, 'change');
                    events.push('input', 'change');
                }
                break;

            case 'date':
            case 'datetime-local':
            case 'time':
            case 'month':
            case 'week':
                element.value = value;
                finalValue = element.value;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'change');
                    events.push('change');
                }
                break;

            case 'color':
                element.value = value;
                finalValue = element.value;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'change');
                    events.push('change');
                }
                break;

            case 'file':
                // File inputs are special - cannot be set programmatically for security
                return {
                    success: false,
                    error: 'File inputs cannot be filled programmatically for security reasons'
                };

            default:
                // Fallback for unknown types
                element.value = value;
                finalValue = element.value;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'change');
                    events.push('change');
                }
                break;
            }

            return {
                success: true,
                finalValue,
                events
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Parse boolean values from various formats
     */
    parseBoolean(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'string') {
            const lower = value.toLowerCase();
            return lower === 'true' || lower === 'yes' || lower === '1' || lower === 'on';
        }
        if (typeof value === 'number') return value !== 0;
        return Boolean(value);
    }

    /**
     * Dispatch DOM events
     */
    dispatchEvent(element, eventType) {
        try {
            if (this.$) {
                // Use jQuery's trigger method for better compatibility
                this.$(element).trigger(eventType);
            } else {
                // Fallback to native event dispatching
                const event = new Event(eventType, { bubbles: true, cancelable: true });
                element.dispatchEvent(event);
            }
        } catch (_error) {
            // Final fallback for older browsers
            if (document.createEvent) {
                const event = document.createEvent('HTMLEvents');
                event.initEvent(eventType, true, true);
                element.dispatchEvent(event);
            }
        }
    }

    /**
     * Get element information for results
     */
    getElementInfo(element) {
        const info = {
            tagName: element.tagName.toLowerCase(),
            type: this.getElementType(element),
            id: element.id || null,
            name: element.name || null,
            className: element.className || null
        };
        
        // Add jQuery-specific information if available
        if (this.$) {
            const $element = this.$(element);
            info.visible = $element.is(':visible');
            info.enabled = !$element.prop('disabled');
        }
        
        return info;
    }

    /**
     * Bulk fill multiple forms with retry logic
     */
    async fillMultipleForms(parentElement, formDataArray, options = {}) {
        const results = [];
        
        for (const formData of formDataArray) {
            const { selectors, retryAttempts = 1 } = formData;
            let lastResult = null;
            
            for (let attempt = 1; attempt <= retryAttempts; attempt++) {
                try {
                    lastResult = this.fillForm(parentElement, selectors, {
                        ...options,
                        retryAttempts: 1 // Prevent nested retries
                    });
                    
                    if (lastResult.failed === 0) {
                        break; // Success, no need to retry
                    }
                } catch (error) {
                    lastResult = {
                        total: 0,
                        successful: 0,
                        failed: 1,
                        skipped: 0,
                        details: [],
                        errors: [error.message]
                    };
                }
                
                if (attempt < retryAttempts) {
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            results.push(lastResult);
        }
        
        return results;
    }

    /**
     * Smart fill using AI-exported form data format
     */
    fillFromAIData(parentElement, aiFormData, userValues, options = {}) {
        const selectorValues = [];
        
        // Process forms
        if (aiFormData.forms) {
            aiFormData.forms.forEach(form => {
                form.elements.forEach(element => {
                    const value = userValues[element.name] || userValues[element.id];
                    if (value !== undefined && element.interactable) {
                        selectorValues.push({
                            selector: element.selector,
                            value: value,
                            type: element.type,
                            options: element.options || {}
                        });
                    }
                });
            });
        }
        
        // Process standalone elements
        if (aiFormData.standaloneElements) {
            aiFormData.standaloneElements.forEach(element => {
                const value = userValues[element.name] || userValues[element.id];
                if (value !== undefined && element.interactable) {
                    selectorValues.push({
                        selector: element.selector,
                        value: value,
                        type: element.type,
                        options: element.options || {}
                    });
                }
            });
        }
        
        return this.fillForm(parentElement, selectorValues, options);
    }

    /**
     * Get fill statistics
     */
    getStats() {
        return {
            totalAttempts: this.fillAttempts,
            successfulFills: this.successfulFills,
            successRate: this.fillAttempts > 0 ? (this.successfulFills / this.fillAttempts) * 100 : 0,
            errors: [...this.errors]
        };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.fillAttempts = 0;
        this.successfulFills = 0;
        this.errors = [];
    }
}

export default FormFiller;