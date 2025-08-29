/**
 * FormExtractor - Comprehensive form analysis utility for AI form filling
 * Extracts detailed information about form elements including structure, styling, and context
 */

class FormExtractor {
    constructor() {
        this.formElementTypes = [
            'input', 'textarea', 'select', 'button', 'fieldset', 'legend', 'optgroup', 'option'
        ];
        
        this.inputTypes = [
            'text', 'password', 'email', 'url', 'tel', 'number', 'range', 'date', 'datetime-local',
            'time', 'month', 'week', 'color', 'search', 'hidden', 'checkbox', 'radio', 'file',
            'submit', 'reset', 'button', 'image'
        ];
    }

    /**
     * Extract comprehensive form information from a DOM element
     * @param {Element} rootElement - The root element to analyze
     * @param {Object} options - Extraction options
     * @returns {Object} Detailed form structure
     */
    extractFormStructure(rootElement, options = {}) {
        const config = {
            includeHidden: options.includeHidden || false,
            includeDisabled: options.includeDisabled || false,
            includeReadOnly: options.includeReadOnly || true,
            extractText: options.extractText !== false,
            extractBoundingBoxes: options.extractBoundingBoxes !== false,
            ...options
        };

        const result = {
            metadata: this.extractMetadata(rootElement),
            forms: [],
            elements: [],
            textContent: config.extractText ? this.extractTextContent(rootElement) : null,
            boundingBox: config.extractBoundingBoxes ? this.getBoundingBox(rootElement) : null,
            extractedAt: new Date().toISOString(),
            config: config
        };

        // Extract form elements (both inside and outside <form> tags)
        const formElements = this.findFormElements(rootElement, config);
        
        // Group elements by their parent form (if any)
        const elementsByForm = this.groupElementsByForm(formElements);
        
        // Process each form group
        for (const [formElement, elements] of elementsByForm) {
            if (formElement) {
                // Elements inside a <form> tag
                result.forms.push(this.processForm(formElement, elements, config));
            } else {
                // Standalone elements not in a form
                result.elements = elements.map(element => 
                    this.extractElementInfo(element, rootElement, config)
                );
            }
        }

        return result;
    }

    /**
     * Extract metadata about the root element
     */
    extractMetadata(element) {
        return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || null,
            className: element.className || null,
            classes: element.classList ? Array.from(element.classList) : [],
            attributes: this.getElementAttributes(element),
            selector: this.generateSelector(element),
            url: window.location.href,
            title: document.title
        };
    }

    /**
     * Find all form-related elements within the root element
     */
    findFormElements(rootElement, config) {
        const elements = [];
        const selector = this.formElementTypes.join(', ');
        
        // Include the root element if it's a form element
        if (this.formElementTypes.includes(rootElement.tagName.toLowerCase())) {
            elements.push(rootElement);
        }
        
        // Find all descendant form elements
        const descendants = rootElement.querySelectorAll(selector);
        elements.push(...Array.from(descendants));
        
        // Filter based on config
        return elements.filter(element => {
            if (!config.includeHidden && this.isHidden(element)) return false;
            if (!config.includeDisabled && element.disabled) return false;
            if (!config.includeReadOnly && element.readOnly) return false;
            return true;
        });
    }

    /**
     * Group form elements by their parent form
     */
    groupElementsByForm(elements) {
        const groups = new Map();
        
        for (const element of elements) {
            const form = element.closest('form');
            
            if (!groups.has(form)) {
                groups.set(form, []);
            }
            groups.get(form).push(element);
        }
        
        return groups;
    }

    /**
     * Process a complete form with its elements
     */
    processForm(formElement, elements, config) {
        return {
            type: 'form',
            element: this.extractElementInfo(formElement, formElement, config),
            elements: elements
                .filter(el => el !== formElement)
                .map(el => this.extractElementInfo(el, formElement, config)),
            structure: this.analyzeFormStructure(formElement, elements),
            validation: this.extractValidationInfo(formElement, elements)
        };
    }

    /**
     * Extract comprehensive information about a form element
     */
    extractElementInfo(element, rootElement, config) {
        const info = {
            // Basic element info
            tagName: element.tagName.toLowerCase(),
            type: this.getElementType(element),
            
            // Identification
            id: element.id || null,
            name: element.name || null,
            className: element.className || null,
            classes: element.classList ? Array.from(element.classList) : [],
            
            // Selectors and targeting - only the most reliable selector
            selector: this.getBestSelector(element, rootElement),
            selectors: this.generateSelectors(element, rootElement), // Keep all for debugging
            
            // Form-specific attributes
            attributes: this.getFormAttributes(element),
            
            // Values and content
            value: this.getElementValue(element),
            defaultValue: this.getDefaultValue(element),
            placeholder: element.placeholder || null,
            
            // Constraints and validation
            constraints: this.extractConstraints(element),
            validation: this.extractElementValidation(element),
            
            // Appearance and state
            state: this.getElementState(element),
            boundingBox: config.extractBoundingBoxes ? this.getBoundingBox(element) : null,
            
            // Context and labels
            labels: this.findLabels(element, rootElement),
            context: this.extractElementContext(element, rootElement),
            
            // Options for select/radio/checkbox groups
            options: this.extractOptions(element),
            
            // Accessibility
            accessibility: this.extractAccessibilityInfo(element)
        };

        return info;
    }

    /**
     * Get the effective type of an element
     */
    getElementType(element) {
        const tagName = element.tagName.toLowerCase();
        
        if (tagName === 'input') {
            return element.type || 'text';
        }
        
        return tagName;
    }

    /**
     * Generate the best single selector for an element
     */
    generateSelector(element) {
        // ID selector (highest certainty)
        if (element.id) {
            return `#${element.id}`;
        }
        
        // Name attribute (high certainty for form elements)
        if (element.name) {
            return `[name="${element.name}"]`;
        }
        
        // Class-based selector
        if (element.classList.length > 0) {
            return `.${  Array.from(element.classList).join('.')}`;
        }
        
        // Data attributes
        const dataAttrs = this.getDataAttributes(element);
        for (const [attr, value] of Object.entries(dataAttrs)) {
            return `[${attr}="${value}"]`;
        }
        
        // Fallback to tag name
        return element.tagName.toLowerCase();
    }

    /**
     * Get the most reliable selector for the element
     */
    getBestSelector(element, rootElement) {
        const selectors = this.generateSelectors(element, rootElement);
        return selectors.length > 0 ? selectors[0] : {
            type: 'fallback',
            selector: element.tagName.toLowerCase(),
            certainty: 0.1,
            description: 'Fallback tag selector'
        };
    }

    /**
     * Generate multiple selector strategies for targeting the element
     */
    generateSelectors(element, rootElement) {
        const selectors = [];
        
        // ID selector (highest certainty)
        if (element.id) {
            selectors.push({
                type: 'id',
                selector: `#${element.id}`,
                certainty: 0.95,
                description: 'ID selector - highly reliable'
            });
        }
        
        // Name attribute (high certainty for form elements)
        if (element.name) {
            selectors.push({
                type: 'name',
                selector: `[name="${element.name}"]`,
                certainty: 0.85,
                description: 'Name attribute - reliable for forms'
            });
        }
        
        // Class-based selectors
        if (element.classList.length > 0) {
            const classSelector = `.${  Array.from(element.classList).join('.')}`;
            selectors.push({
                type: 'class',
                selector: classSelector,
                certainty: 0.6,
                description: 'Class selector - may not be unique'
            });
        }
        
        // Data attributes
        const dataAttrs = this.getDataAttributes(element);
        for (const [attr, value] of Object.entries(dataAttrs)) {
            selectors.push({
                type: 'data-attribute',
                selector: `[${attr}="${value}"]`,
                certainty: 0.7,
                description: 'Data attribute selector'
            });
        }
        
        // Relative position to root
        const relativePath = this.getRelativePath(element, rootElement);
        if (relativePath) {
            selectors.push({
                type: 'relative-path',
                selector: relativePath,
                certainty: 0.4,
                description: 'Position-based selector - fragile'
            });
        }
        
        // XPath
        selectors.push({
            type: 'xpath',
            selector: this.getXPath(element, rootElement),
            certainty: 0.5,
            description: 'XPath selector'
        });
        
        return selectors.sort((a, b) => b.certainty - a.certainty);
    }

    /**
     * Extract form-specific attributes
     */
    getFormAttributes(element) {
        const formAttrs = {};
        const relevantAttrs = [
            'type', 'name', 'value', 'placeholder', 'required', 'disabled', 'readonly',
            'autocomplete', 'autofocus', 'multiple', 'accept', 'min', 'max', 'step',
            'minlength', 'maxlength', 'pattern', 'size', 'rows', 'cols', 'wrap',
            'form', 'formaction', 'formmethod', 'formtarget', 'formnovalidate'
        ];
        
        for (const attr of relevantAttrs) {
            if (element.hasAttribute(attr)) {
                formAttrs[attr] = element.getAttribute(attr);
            }
        }
        
        return formAttrs;
    }

    /**
     * Get element value in appropriate format
     */
    getElementValue(element) {
        const type = this.getElementType(element);
        
        switch (type) {
        case 'checkbox':
        case 'radio':
            return {
                checked: element.checked,
                value: element.value
            };
        case 'select':
            return {
                selectedIndex: element.selectedIndex,
                selectedValue: element.value,
                selectedOptions: Array.from(element.selectedOptions).map(opt => ({
                    value: opt.value,
                    text: opt.textContent.trim()
                }))
            };
        case 'file': {
            return {
                files: element.files ? Array.from(element.files).map(f => f.name) : [],
                accept: element.accept
            };
        }
        default:
            return element.value || null;
        }
    }

    /**
     * Get default value
     */
    getDefaultValue(element) {
        const type = this.getElementType(element);
        
        switch (type) {
        case 'checkbox':
        case 'radio':
            return {
                defaultChecked: element.defaultChecked,
                defaultValue: element.defaultValue
            };
        case 'select': {
            const defaultOption = Array.from(element.options).find(opt => opt.defaultSelected);
            return defaultOption ? {
                value: defaultOption.value,
                text: defaultOption.textContent.trim()
            } : null;
        }
        default:
            return element.defaultValue || null;
        }
    }

    /**
     * Extract validation constraints
     */
    extractConstraints(element) {
        const constraints = {};
        
        if (element.required) constraints.required = true;
        if (element.minLength) constraints.minLength = element.minLength;
        if (element.maxLength) constraints.maxLength = element.maxLength;
        if (element.min) constraints.min = element.min;
        if (element.max) constraints.max = element.max;
        if (element.step) constraints.step = element.step;
        if (element.pattern) constraints.pattern = element.pattern;
        
        return constraints;
    }

    /**
     * Extract element validation state
     */
    extractElementValidation(element) {
        return {
            validity: element.validity ? {
                valid: element.validity.valid,
                badInput: element.validity.badInput,
                customError: element.validity.customError,
                patternMismatch: element.validity.patternMismatch,
                rangeOverflow: element.validity.rangeOverflow,
                rangeUnderflow: element.validity.rangeUnderflow,
                stepMismatch: element.validity.stepMismatch,
                tooLong: element.validity.tooLong,
                tooShort: element.validity.tooShort,
                typeMismatch: element.validity.typeMismatch,
                valueMissing: element.validity.valueMissing
            } : null,
            validationMessage: element.validationMessage || null,
            customValidity: element.checkValidity ? element.checkValidity() : null
        };
    }

    /**
     * Get element state
     */
    getElementState(element) {
        return {
            disabled: element.disabled,
            readonly: element.readOnly,
            hidden: this.isHidden(element),
            focused: document.activeElement === element,
            visible: this.isVisible(element),
            interactable: this.isInteractable(element)
        };
    }

    /**
     * Find associated labels
     */
    findLabels(element, rootElement) {
        const labels = [];
        
        // Labels with 'for' attribute
        if (element.id) {
            const forLabels = rootElement.querySelectorAll(`label[for="${element.id}"]`);
            labels.push(...Array.from(forLabels).map(label => ({
                type: 'explicit',
                element: label,
                text: label.textContent.trim(),
                position: this.getRelativePosition(label, element)
            })));
        }
        
        // Implicit labels (element inside label)
        const parentLabel = element.closest('label');
        if (parentLabel) {
            labels.push({
                type: 'implicit',
                element: parentLabel,
                text: parentLabel.textContent.trim(),
                position: 'parent'
            });
        }
        
        // ARIA labels
        if (element.getAttribute('aria-label')) {
            labels.push({
                type: 'aria-label',
                text: element.getAttribute('aria-label'),
                position: 'attribute'
            });
        }
        
        if (element.getAttribute('aria-labelledby')) {
            const labelIds = element.getAttribute('aria-labelledby').split(' ');
            for (const labelId of labelIds) {
                const labelElement = document.getElementById(labelId);
                if (labelElement) {
                    labels.push({
                        type: 'aria-labelledby',
                        element: labelElement,
                        text: labelElement.textContent.trim(),
                        position: this.getRelativePosition(labelElement, element)
                    });
                }
            }
        }
        
        return labels;
    }

    /**
     * Extract element context (surrounding text, hints, etc.)
     */
    extractElementContext(element, rootElement) {
        const context = {
            beforeText: this.getTextBefore(element, 100),
            afterText: this.getTextAfter(element, 100),
            parentText: this.getParentText(element),
            siblingElements: this.getSiblingInfo(element),
            fieldset: this.getFieldsetInfo(element),
            placeholder: element.placeholder || null,
            title: element.title || null,
            helpText: this.findHelpText(element, rootElement)
        };
        
        return context;
    }

    /**
     * Extract options for select/radio/checkbox groups
     */
    extractOptions(element) {
        const type = this.getElementType(element);
        
        if (type === 'select') {
            // Ensure we capture ALL options using multiple methods
            const allOptions = [];
            
            // Method 1: Use element.options HTMLOptionsCollection (most reliable)
            if (element.options && element.options.length > 0) {
                allOptions.push(...Array.from(element.options));
            }
            
            // Method 2: Fallback - query all option elements (safety net)
            if (allOptions.length === 0) {
                const optionElements = element.querySelectorAll('option');
                allOptions.push(...Array.from(optionElements));
            }
            
            return {
                multiple: element.multiple || false,
                size: element.size || 1,
                totalOptions: allOptions.length,
                options: allOptions.map((option, index) => ({
                    index,
                    value: option.value || '',
                    text: (option.textContent || option.innerText || '').trim(),
                    selected: option.selected || false,
                    defaultSelected: option.defaultSelected || false,
                    disabled: option.disabled || false,
                    group: option.parentElement && option.parentElement.tagName === 'OPTGROUP' ? 
                        (option.parentElement.label || option.parentElement.getAttribute('label') || null) : null
                }))
            };
        }
        
        if (type === 'radio' || type === 'checkbox') {
            // Find related elements with same name
            const name = element.name;
            if (name) {
                const related = Array.from(document.querySelectorAll(`[name="${name}"]`))
                    .map((el, index) => ({
                        index,
                        value: el.value,
                        checked: el.checked,
                        element: el,
                        label: this.findLabels(el, document).map(l => l.text).join(' '),
                        position: this.getBoundingBox(el)
                    }));
                
                return {
                    group: related,
                    groupSize: related.length
                };
            }
        }
        
        return null;
    }

    /**
     * Extract accessibility information
     */
    extractAccessibilityInfo(element) {
        return {
            role: element.getAttribute('role'),
            ariaLabel: element.getAttribute('aria-label'),
            ariaLabelledby: element.getAttribute('aria-labelledby'),
            ariaDescribedby: element.getAttribute('aria-describedby'),
            ariaRequired: element.getAttribute('aria-required'),
            ariaInvalid: element.getAttribute('aria-invalid'),
            tabIndex: element.tabIndex,
            accessKey: element.accessKey
        };
    }

    /**
     * Analyze form structure and relationships
     */
    analyzeFormStructure(formElement, elements) {
        const structure = {
            sections: this.identifyFormSections(formElement),
            groups: this.identifyFieldGroups(elements),
            flow: this.analyzeFormFlow(elements),
            layout: this.analyzeFormLayout(elements)
        };
        
        return structure;
    }

    /**
     * Extract text content from root element
     */
    extractTextContent(element) {
        return {
            fullText: element.textContent.trim(),
            innerText: element.innerText || '',
            headings: this.extractHeadings(element),
            paragraphs: this.extractParagraphs(element),
            lists: this.extractLists(element)
        };
    }

    /**
     * Get bounding box information
     */
    getBoundingBox(element) {
        if (!element.getBoundingClientRect) return null;
        
        const rect = element.getBoundingClientRect();
        return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            left: rect.left,
            centerX: rect.x + rect.width / 2,
            centerY: rect.y + rect.height / 2,
            area: rect.width * rect.height,
            visible: this.isInViewport(rect)
        };
    }

    /**
     * Utility methods
     */
    
    isHidden(element) {
        return element.type === 'hidden' || 
               element.style.display === 'none' ||
               element.style.visibility === 'hidden' ||
               element.hidden;
    }

    isVisible(element) {
        return !this.isHidden(element) && 
               element.offsetWidth > 0 && 
               element.offsetHeight > 0;
    }

    isInteractable(element) {
        return this.isVisible(element) && 
               !element.disabled && 
               !element.readOnly;
    }

    isInViewport(rect) {
        return rect.top >= 0 &&
               rect.left >= 0 &&
               rect.bottom <= window.innerHeight &&
               rect.right <= window.innerWidth;
    }

    getElementAttributes(element) {
        const attrs = {};
        for (const attr of element.attributes) {
            attrs[attr.name] = attr.value;
        }
        return attrs;
    }

    getDataAttributes(element) {
        const dataAttrs = {};
        for (const attr of element.attributes) {
            if (attr.name.startsWith('data-')) {
                dataAttrs[attr.name] = attr.value;
            }
        }
        return dataAttrs;
    }

    generateCSSSelector(element) {
        if (element.id) {
            return `#${CSS.escape(element.id)}`;
        }

        const path = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let selector = element.nodeName.toLowerCase();
            
            if (element.className) {
                const classes = Array.from(element.classList)
                    .filter(cls => cls && !cls.startsWith('agentlet-'))
                    .slice(0, 3); // Limit to 3 classes for brevity
                if (classes.length > 0) {
                    selector += `.${  classes.map(cls => CSS.escape(cls)).join('.')}`;
                }
            }
            
            path.unshift(selector);
            element = element.parentElement;
            
            // Stop at a reasonable depth
            if (path.length >= 5) break;
        }
        
        return path.join(' > ');
    }

    getRelativePath(element, rootElement) {
        const path = [];
        let current = element;
        
        while (current && current !== rootElement && current !== document.body) {
            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children);
                const index = siblings.indexOf(current);
                path.unshift(`${current.tagName.toLowerCase()}:nth-child(${index + 1})`);
            }
            current = parent;
        }
        
        return path.length > 0 ? path.join(' > ') : null;
    }

    getXPath(element, rootElement) {
        const path = [];
        let current = element;
        
        while (current && current !== rootElement && current !== document.documentElement) {
            const parent = current.parentElement;
            if (parent) {
                const siblings = Array.from(parent.children).filter(el => el.tagName === current.tagName);
                const index = siblings.indexOf(current) + 1;
                path.unshift(`${current.tagName.toLowerCase()}[${index}]`);
            }
            current = parent;
        }
        
        return path.length > 0 ? `./${path.join('/')}` : null;
    }

    getTextBefore(element, maxLength = 100) {
        const walker = document.createTreeWalker(
            element.parentElement,
            NodeFilter.SHOW_TEXT,
            null,
            false
        );
        
        let text = '';
        let node;
        
        while ((node = walker.nextNode())) {
            if (node.parentElement.contains(element)) break;
            text += node.textContent;
        }
        
        return text.trim().slice(-maxLength);
    }

    getTextAfter(element, _maxLength = 100) {
        // Similar implementation for text after element
        return ''; // Simplified for brevity
    }

    getParentText(element) {
        const parent = element.parentElement;
        if (!parent) return null;
        
        return parent.textContent.replace(element.textContent, '').trim();
    }

    getSiblingInfo(element) {
        const siblings = Array.from(element.parentElement?.children || []);
        return siblings
            .filter(el => el !== element)
            .map(el => ({
                tagName: el.tagName.toLowerCase(),
                text: el.textContent.trim().slice(0, 50),
                classes: Array.from(el.classList)
            }));
    }

    getFieldsetInfo(element) {
        const fieldset = element.closest('fieldset');
        if (!fieldset) return null;
        
        const legend = fieldset.querySelector('legend');
        return {
            legend: legend ? legend.textContent.trim() : null,
            text: fieldset.textContent.trim()
        };
    }

    findHelpText(element, _rootElement) {
        // Look for help text associated with the element
        const helpTexts = [];
        
        // ARIA described by
        if (element.getAttribute('aria-describedby')) {
            const descIds = element.getAttribute('aria-describedby').split(' ');
            for (const id of descIds) {
                const descElement = document.getElementById(id);
                if (descElement) {
                    helpTexts.push({
                        type: 'aria-describedby',
                        text: descElement.textContent.trim()
                    });
                }
            }
        }
        
        // Look for common help text patterns
        const parent = element.parentElement;
        if (parent) {
            const helpElements = parent.querySelectorAll('.help-text, .hint, .description, [class*="help"], [class*="hint"]');
            for (const helpEl of helpElements) {
                helpTexts.push({
                    type: 'contextual',
                    text: helpEl.textContent.trim()
                });
            }
        }
        
        return helpTexts;
    }

    getRelativePosition(el1, el2) {
        const rect1 = el1.getBoundingClientRect();
        const rect2 = el2.getBoundingClientRect();
        
        if (rect1.bottom < rect2.top) return 'above';
        if (rect1.top > rect2.bottom) return 'below';
        if (rect1.right < rect2.left) return 'left';
        if (rect1.left > rect2.right) return 'right';
        return 'overlapping';
    }

    extractHeadings(element) {
        const headings = [];
        for (let i = 1; i <= 6; i++) {
            const elements = element.querySelectorAll(`h${i}`);
            headings.push(...Array.from(elements).map(h => ({
                level: i,
                text: h.textContent.trim()
            })));
        }
        return headings;
    }

    extractParagraphs(element) {
        return Array.from(element.querySelectorAll('p')).map(p => p.textContent.trim());
    }

    extractLists(element) {
        return Array.from(element.querySelectorAll('ul, ol')).map(list => ({
            type: list.tagName.toLowerCase(),
            items: Array.from(list.querySelectorAll('li')).map(li => li.textContent.trim())
        }));
    }

    identifyFormSections(_formElement) {
        // Identify logical sections based on fieldsets, headings, etc.
        return [];
    }

    identifyFieldGroups(_elements) {
        // Group related fields (radio groups, address fields, etc.)
        return [];
    }

    analyzeFormFlow(_elements) {
        // Analyze tab order and form flow
        return {};
    }

    analyzeFormLayout(_elements) {
        // Analyze visual layout of form elements
        return {};
    }

    extractValidationInfo(formElement, elements) {
        return {
            noValidate: formElement.noValidate,
            constraints: elements.map(el => this.extractConstraints(el)),
            customValidation: this.detectCustomValidation(formElement)
        };
    }

    detectCustomValidation(_formElement) {
        // Detect custom validation scripts/libraries
        return {};
    }

    /**
     * Export form data in a clean, AI-ready format with only the best selectors
     * @param {Element} rootElement - The root element to analyze
     * @param {Object} options - Export options
     * @returns {Object} Clean form data optimized for AI consumption
     */
    exportForAI(rootElement, options = {}) {
        const config = {
            includeHidden: options.includeHidden || false,
            includeDisabled: options.includeDisabled || false,
            includeReadOnly: options.includeReadOnly !== false,
            includeBoundingBoxes: options.includeBoundingBoxes || false,
            groupByForm: options.groupByForm !== false,
            includeContext: options.includeContext !== false,
            ...options
        };

        // Extract full form data
        const fullData = this.extractFormStructure(rootElement, config);
        
        // Create clean export
        const cleanExport = {
            metadata: {
                url: fullData.metadata.url,
                title: fullData.metadata.title,
                extractedAt: fullData.extractedAt,
                totalForms: fullData.forms.length,
                totalElements: fullData.forms.reduce((sum, form) => sum + form.elements.length, 0) + fullData.elements.length
            },
            forms: fullData.forms.map(form => this.cleanFormForAI(form, config)),
            standaloneElements: fullData.elements.map(element => this.cleanElementForAI(element, config))
        };

        return cleanExport;
    }

    /**
     * Clean form data for AI consumption
     */
    cleanFormForAI(form, config) {
        return {
            id: form.element.id,
            name: form.element.name,
            action: form.element.attributes.action,
            method: form.element.attributes.method,
            selector: form.element.selector.selector,
            elements: form.elements.map(element => this.cleanElementForAI(element, config))
        };
    }

    /**
     * Clean element data for AI consumption
     */
    cleanElementForAI(element, config) {
        const cleanElement = {
            // Core identification
            type: element.type,
            id: element.id,
            name: element.name,
            selector: element.selector.selector,
            selectorType: element.selector.type,
            certainty: Math.round(element.selector.certainty * 100),

            // Labels and context
            label: element.labels.map(l => l.text).join(' | ') || null,
            placeholder: element.placeholder || null,

            // Current state and value
            value: this.getCleanValue(element),
            required: element.constraints.required || false,
            disabled: element.state.disabled || false,
            visible: element.state.visible || false,
            interactable: element.state.interactable || false
        };

        // Add options for select/radio/checkbox elements
        if (element.options) {
            if (element.type === 'select') {
                cleanElement.options = {
                    multiple: element.options.multiple,
                    choices: element.options.options.map(opt => ({
                        value: opt.value,
                        text: opt.text,
                        selected: opt.selected,
                        disabled: opt.disabled,
                        group: opt.group
                    }))
                };
            } else if (element.type === 'radio' || element.type === 'checkbox') {
                cleanElement.options = {
                    group: element.options.group?.map(opt => ({
                        value: opt.value,
                        checked: opt.checked,
                        label: opt.label
                    })) || []
                };
            }
        }

        // Add validation constraints
        if (Object.keys(element.constraints).length > 0) {
            cleanElement.constraints = { ...element.constraints };
        }

        // Add context if requested
        if (config.includeContext && element.context) {
            const context = {};
            if (element.context.helpText?.length > 0) {
                context.helpText = element.context.helpText.map(h => h.text).join(' ');
            }
            if (element.context.fieldset?.legend) {
                context.fieldset = element.context.fieldset.legend;
            }
            if (Object.keys(context).length > 0) {
                cleanElement.context = context;
            }
        }

        // Add bounding box if requested
        if (config.includeBoundingBoxes && element.boundingBox) {
            cleanElement.position = {
                x: Math.round(element.boundingBox.x),
                y: Math.round(element.boundingBox.y),
                width: Math.round(element.boundingBox.width),
                height: Math.round(element.boundingBox.height),
                visible: element.boundingBox.visible
            };
        }

        return cleanElement;
    }

    /**
     * Get clean value representation for different element types
     */
    getCleanValue(element) {
        switch (element.type) {
        case 'checkbox':
        case 'radio':
            return {
                checked: element.value?.checked || false,
                value: element.value?.value || ''
            };
        case 'select':
            if (element.value?.selectedOptions) {
                return element.options?.multiple ? 
                    element.value.selectedOptions.map(opt => opt.value) :
                    element.value.selectedValue;
            }
            return element.value?.selectedValue || '';
        case 'file':
            return {
                files: element.value?.files || [],
                accept: element.value?.accept || ''
            };
        default:
            return element.value || '';
        }
    }

    /**
     * Quick export function for simple use cases
     * @param {Element} element - Element to analyze (form or container)
     * @returns {Array} Array of form fields ready for AI processing
     */
    quickExport(element) {
        const data = this.exportForAI(element, {
            includeHidden: false,
            includeDisabled: false,
            includeBoundingBoxes: false,
            includeContext: false
        });

        // Flatten to simple array of fields
        const fields = [];
        
        // Add form elements
        data.forms.forEach(form => {
            form.elements.forEach(element => {
                if (element.interactable) {
                    fields.push({
                        selector: element.selector,
                        type: element.type,
                        name: element.name,
                        label: element.label,
                        value: element.value,
                        required: element.required,
                        options: element.options?.choices || element.options?.group || null
                    });
                }
            });
        });

        // Add standalone elements
        data.standaloneElements.forEach(element => {
            if (element.interactable) {
                fields.push({
                    selector: element.selector,
                    type: element.type,
                    name: element.name,
                    label: element.label,
                    value: element.value,
                    required: element.required,
                    options: element.options?.choices || element.options?.group || null
                });
            }
        });

        return fields;
    }
}

export default FormExtractor;