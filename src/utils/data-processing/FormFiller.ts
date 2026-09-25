/**
 * FormFiller - Simplified form filling utility
 * Fills form elements within a specific parent context to avoid collisions
 */
import type {
    FormFillValue,
    FormFillSelectorValues,
    FormFillOptions,
    FormFillElementInfo,
    FormFillDetail,
    FormFillResult,
    FormFillMultipleEntry,
    AIFormExport,
    FormFillerAPI
} from '../../types/public-api';

/** One normalized `{selector, value, type}` entry, after `normalizeSelectorValues()` folds either input shape into this. */
interface NormalizedFillItem {
    selector: string;
    value: FormFillValue;
    type: string | null;
}

/**
 * FormFiller reads/writes `<input>`/`<select>`/`<textarea>` members through
 * runtime duck typing keyed off `elementType` (itself derived from the
 * element's own tag/type), the same approach as `FormExtractor.ts`'s
 * `FormControlElement`. Every member here is optional because the element
 * matched by an arbitrary CSS selector could structurally be any `Element`
 * at the type level, even though in practice `elementType` gates each
 * runtime read to a compatible member.
 */
interface FormFillElement extends HTMLElement {
    type?: string;
    name?: string;
    value?: string;
    checked?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    min?: string;
    max?: string;
}

/** The internal (pre-validation-error) outcome of `performFill()`. */
type PerformFillResult =
    | { success: true; finalValue: unknown }
    | { success: false; error: string };

/**
 * Resolves the prototype that owns the native `value` accessor for a form
 * control, keyed off its tag name. `null` for anything else (the caller
 * falls back to a plain assignment).
 */
function nativeValueOwner(element: FormFillElement): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null {
    switch (element.tagName) {
    case 'INPUT':
        return HTMLInputElement.prototype;
    case 'TEXTAREA':
        return HTMLTextAreaElement.prototype;
    case 'SELECT':
        return HTMLSelectElement.prototype;
    default:
        return null;
    }
}

/**
 * Sets `element.value` through the native setter declared on the element's
 * own prototype (`HTMLInputElement`/`HTMLTextAreaElement`/`HTMLSelectElement`),
 * instead of a plain `element.value = value` assignment.
 *
 * This matters for elements a UI framework like React controls: React
 * installs its own `value` property descriptor directly on the DOM node
 * (shadowing the prototype's) to track what it last rendered, so a plain
 * assignment is absorbed by that instance-level setter and React's internal
 * value tracker never sees the change - the subsequent `input`/`change`
 * events fire, but React treats the value as unchanged from its own
 * perspective and the controlled component's state does not update. Calling
 * the prototype's setter function directly (`.call(element, value)`) bypasses
 * that instance-level override and writes straight into the browser's
 * underlying value slot, exactly like a real user keystroke would, so
 * React's change detection sees the new value.
 *
 * Falls back to a direct assignment when no native setter is found (e.g. an
 * element type without a `value` accessor, or an environment where the
 * descriptor is absent).
 */
function setNativeValue(element: FormFillElement, value: string): void {
    const owner = nativeValueOwner(element);
    const setter = owner && Object.getOwnPropertyDescriptor(owner, 'value')?.set;

    if (setter) {
        setter.call(element, value);
    } else {
        element.value = value;
    }
}

/**
 * Sets `element.checked` through the native setter declared on
 * `HTMLInputElement.prototype`, for the same reason `setNativeValue()` uses
 * the native `value` setter: React tracks checkbox/radio state the same way
 * it tracks text values, via an instance-level property descriptor that a
 * plain `element.checked = value` assignment would bypass.
 *
 * Unlike text/select inputs, this alone is not enough for React to notice:
 * React's change-detection for a checkbox/radio is wired to the `click`
 * event rather than `change` (a legacy IE workaround it still carries), so
 * `performFill()` also dispatches a `click` event for these two types. See
 * the `checkbox`/`radio` cases below.
 */
function setNativeChecked(element: FormFillElement, checked: boolean): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked')?.set;

    if (setter) {
        setter.call(element, checked);
    } else {
        element.checked = checked;
    }
}

class FormFiller implements FormFillerAPI {
    debugMode: boolean;

    constructor() {
        this.debugMode = false;
    }

    /**
     * Fill form elements within a parent context
     * @param parentElement - Parent element to limit scope
     * @param selectorValues - Selectors and their values
     * @param options - Filling options
     * @returns Filling results
     */
    fillForm(parentElement: Element, selectorValues: FormFillSelectorValues, options: FormFillOptions = {}): FormFillResult {
        const config: FormFillOptions = {
            triggerEvents: options.triggerEvents !== false,
            skipDisabled: options.skipDisabled !== false,
            skipReadonly: options.skipReadonly !== false,
            skipHidden: options.skipHidden !== false,
            validateFields: options.validateFields || false,
            debugMode: options.debugMode || false,
            ...options
        };

        this.debugMode = config.debugMode as boolean;

        if (this.debugMode) {
            console.log('🔧 FormFiller: Starting fill operation', {
                parentElement: parentElement.tagName + ((parentElement as HTMLElement).id ? `#${(parentElement as HTMLElement).id}` : ''),
                selectorCount: Array.isArray(selectorValues) ? selectorValues.length : Object.keys(selectorValues).length
            });
        }

        // Normalize input to consistent format
        const normalizedValues = this.normalizeSelectorValues(selectorValues);

        // Validate parent element
        if (!parentElement || !parentElement.querySelector) {
            throw new Error('Invalid parent element provided');
        }

        const results: FormFillResult = {
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
                const errorResult: FormFillDetail = {
                    selector: item.selector,
                    status: 'error',
                    error: (error as Error).message,
                    element: null
                };
                results.details.push(errorResult);
                results.errors.push((error as Error).message);
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
    normalizeSelectorValues(selectorValues: FormFillSelectorValues): NormalizedFillItem[] {
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
    fillSingleElement(parentElement: Element, item: NormalizedFillItem, config: FormFillOptions): FormFillDetail {
        const { selector, value, type } = item;

        if (this.debugMode) {
            console.log(`🎯 Attempting to fill: ${selector} = ${value}`);
        }

        // Find element within parent context
        let element: FormFillElement | null;
        try {
            element = parentElement.querySelector<FormFillElement>(selector);
        } catch (error) {
            throw new Error(`Invalid selector: ${selector} - ${(error as Error).message}`);
        }

        if (!element) {
            throw new Error(`Element not found with selector: ${selector}`);
        }

        // Verify element is within parent (extra safety check)
        if (!parentElement.contains(element) && (parentElement as Element) !== element) {
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
    shouldSkipElement(element: FormFillElement, config: FormFillOptions): string | null {
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
    isHidden(element: FormFillElement): boolean {
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
    getElementType(element: FormFillElement): string {
        const tagName = element.tagName.toLowerCase();

        if (tagName === 'input') {
            return element.type || 'text';
        }

        return tagName;
    }

    /**
     * Basic value validation for common types
     */
    validateValue(element: FormFillElement, value: FormFillValue, elementType: string): boolean {
        switch (elementType) {
        case 'email':
            return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value as string);
        case 'number':
        case 'range': {
            const num = parseFloat(value as string);
            if (isNaN(num)) return false;
            if (element.min && num < parseFloat(element.min)) return false;
            if (element.max && num > parseFloat(element.max)) return false;
            return true;
        }
        case 'select':
            return !value || element.querySelector(`option[value="${value as string}"]`) !== null;
        default:
            return true; // Most types accept any string
        }
    }

    /**
     * Perform the actual fill operation
     */
    performFill(element: FormFillElement, value: FormFillValue, elementType: string, config: FormFillOptions): PerformFillResult {
        let finalValue: unknown = value;

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
                setNativeValue(element, value as string);
                finalValue = element.value;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'input');
                    this.dispatchEvent(element, 'change');
                }
                break;

            case 'select':
                setNativeValue(element, value as string);
                finalValue = element.value;
                if (config.triggerEvents) {
                    this.dispatchEvent(element, 'change');
                }
                break;

            case 'checkbox': {
                const isChecked = this.parseBoolean(value);
                setNativeChecked(element, isChecked);
                finalValue = element.checked;
                if (config.triggerEvents) {
                    // See the comment on setNativeChecked(): React only
                    // treats a checkbox/radio as changed in response to a
                    // 'click' event, so that has to be dispatched alongside
                    // 'change' for a React-controlled checkbox/radio to
                    // actually update. A script-dispatched 'click' Event
                    // (as opposed to calling element.click()) does not
                    // trigger the browser's native toggle behavior, so this
                    // does not fight with the checked value just set above.
                    this.dispatchEvent(element, 'click');
                    this.dispatchEvent(element, 'change');
                }
                break;
            }

            case 'radio':
                if (element.value === value || this.parseBoolean(value)) {
                    setNativeChecked(element, true);
                    finalValue = element.value;
                    if (config.triggerEvents) {
                        // See the 'checkbox' case above for why 'click' is
                        // dispatched alongside 'change'.
                        this.dispatchEvent(element, 'click');
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
                setNativeValue(element, value as string);
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
                error: (error as Error).message
            };
        }
    }

    /**
     * Parse boolean values from various formats
     */
    parseBoolean(value: unknown): boolean {
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
    dispatchEvent(element: Element, eventType: string): void {
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
    getElementInfo(element: FormFillElement): FormFillElementInfo {
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
    fillFromAIData(
        parentElement: Element,
        aiFormData: AIFormExport,
        userValues: Record<string, FormFillValue>,
        options: FormFillOptions = {}
    ): FormFillResult {
        const selectorValues: Array<{ selector: string; value: FormFillValue; type: string }> = [];

        // Process forms
        if (aiFormData.forms) {
            aiFormData.forms.forEach(form => {
                form.elements.forEach(element => {
                    const value = userValues[element.name as string] || userValues[element.id as string];
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
                const value = userValues[element.name as string] || userValues[element.id as string];
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
    async fillMultipleForms(
        parentElement: Element,
        formDataArray: FormFillMultipleEntry[],
        options: FormFillOptions = {}
    ): Promise<FormFillResult[]> {
        const results: FormFillResult[] = [];

        for (const formData of formDataArray) {
            const { selectors, retryAttempts = 1 } = formData;
            let lastResult: FormFillResult | null = null;

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
                        errors: [(error as Error).message]
                    };
                }

                if (attempt < retryAttempts) {
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            results.push(lastResult as FormFillResult);
        }

        return results;
    }
}

export default FormFiller;
