/**
 * FormFiller - Simplified form filling utility
 * Fills form elements within a specific parent context to avoid collisions
 */

class FormFiller {
    constructor() {
        this.debugMode = false;
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
            skipDisabled: options.skipDisabled !== false,
            skipReadonly: options.skipReadonly !== false,
            skipHidden: options.skipHidden !== false,
            validateFields: options.validateFields || false,
            debugMode: options.debugMode || false,
            ...options
        };

        this.debugMode = config.debugMode;

        if (this.debugMode) {
            console.log('🔧 FormFiller: Starting fill operation', {
                parentElement: parentElement.tagName + (parentElement.id ? `#${parentElement.id}` : ''),
                selectorCount: Array.isArray(selectorValues) ? selectorValues.length : Object.keys(selectorValues).length
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
            return selectorValues.map(item => ({
                selector: item.selector,
                value: item.value,
                type: item.type || null
            }));
        } else if (typeof selectorValues === 'object') {
            return Object.entries(selectorValues).map(([selector, value]) => ({
                selector,
                value,
                type: null
            }));
        } else {
            throw new Error('selectorValues must be an array or object');
        }
    }

    /**
     * Fill a single element within the parent context
     */
    fillSingleElement(parentElement, item, config) {
        const { selector, value, type } = item;
        
        if (this.debugMode) {
            console.log(`🎯 Attempting to fill: ${selector} = ${value}`);
        }

        // Find element within parent context
        let element;
        try {
            element = parentElement.querySelector(selector);
        } catch (error) {
            throw new Error(`Invalid selector: ${selector} - ${error.message}`);
        }

        if (!element) {
            throw new Error(`Element not found with selector: ${selector}`);
        }

        // Verify element is within parent (extra safety check)
        if (!parentElement.contains(element) && parentElement !== element) {
            throw new Error(`Element found but not within parent context: ${selector}`);
        }

        // Check if element should be skipped
        const skipReason = this.shouldSkipElement(element, config);
        if (skipReason) {
            return {
                selector,
                status: 'skipped',
                reason: skipReason,
                element: this.getElementInfo(element)
            };
        }

        // Determine element type if not provided
        const elementType = type || this.getElementType(element);
        
        // Validate value if requested
        if (config.validateFields && !this.validateValue(element, value, elementType)) {
            throw new Error(`Invalid value for ${elementType} element: ${value}`);
        }

        // Perform the fill
        const fillResult = this.performFill(element, value, elementType, config);
        
        if (fillResult.success) {
            return {
                selector,
                status: 'success',
                value: fillResult.finalValue,
                element: this.getElementInfo(element)
            };
        } else {
            throw new Error(fillResult.error || 'Fill operation failed');
        }
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
        return element.type === 'hidden' ||
               element.style.display === 'none' ||
               element.style.visibility === 'hidden' ||
               element.hidden ||
               element.offsetWidth === 0 ||
               element.offsetHeight === 0;
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
     * Basic value validation for common types
     */
    validateValue(element, value, elementType) {
        switch (elementType) {
        case 'email':
            return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        case 'number':
        case 'range': {
            const num = parseFloat(value);
            if (isNaN(num)) return false;
            if (element.min && num < parseFloat(element.min)) return false;
            if (element.max && num > parseFloat(element.max)) return false;
            return true;
        }
        case 'select':
            return !value || element.querySelector(`option[value="${value}"]`) !== null;
        default:
            return true; // Most types accept any string
        }
    }

    /**
     * Perform the actual fill operation
     */
    performFill(element, value, elementType, config) {
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
            case 'textarea':
            case 'range':
            case 'date':
            case 'datetime-local':
            case 'time':
            case 'month':
            case 'week':
            case 'color':
                element.value = value;
                finalValue = element.value;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'input');
                    this.dispatchEvent(element, 'change');
                }
                break;

            case 'select':
                element.value = value;
                finalValue = element.value;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'change');
                }
                break;

            case 'checkbox': {
                const isChecked = this.parseBoolean(value);
                element.checked = isChecked;
                finalValue = element.checked;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'change');
                }
                break;
            }

            case 'radio':
                if (element.value === value || this.parseBoolean(value)) {
                    element.checked = true;
                    finalValue = element.value;
                    if (config.triggerEvents) {
                        this.dispatchEvent(element, 'change');
                    }
                } else {
                    finalValue = null; // Radio not selected
                }
                break;

            case 'file':
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
                }
                break;
            }

            return {
                success: true,
                finalValue
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
            const event = new Event(eventType, { bubbles: true, cancelable: true });
            element.dispatchEvent(event);
        } catch (_error) {
            // Fallback for older browsers
            if (document.createEvent) {
                const event = document.createEvent('HTMLEvents');
                event.initEvent(eventType, true, true);
                element.dispatchEvent(event);
            }
        }
    }

    /**
     * Get basic element information for results
     */
    getElementInfo(element) {
        return {
            tagName: element.tagName.toLowerCase(),
            type: this.getElementType(element),
            id: element.id || null,
            name: element.name || null,
            visible: !this.isHidden(element),
            enabled: !element.disabled
        };
    }

    /**
     * Fill form using AI-exported data format
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
                            type: element.type
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
                        type: element.type
                    });
                }
            });
        }
        
        return this.fillForm(parentElement, selectorValues, options);
    }

    /**
     * Fill multiple forms with basic retry logic
     */
    async fillMultipleForms(parentElement, formDataArray, options = {}) {
        const results = [];
        
        for (const formData of formDataArray) {
            const { selectors, retryAttempts = 1 } = formData;
            let lastResult = null;
            
            for (let attempt = 1; attempt <= retryAttempts; attempt++) {
                try {
                    lastResult = this.fillForm(parentElement, selectors, options);
                    
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
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            
            results.push(lastResult);
        }
        
        return results;
    }
}

export default FormFiller;