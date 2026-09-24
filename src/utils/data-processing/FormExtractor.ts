/**
 * FormExtractor - Simplified form analysis utility for AI form filling
 * Extracts essential form information with focus on practical usability
 */
import type {
    FormElementValue,
    FormElementOptionsInfo,
    FormElementInfo,
    FormGroup,
    FormExtractionOptions,
    FormExtractionResult,
    CleanFormElement,
    AIFormExport,
    QuickExportField,
    FormExtractorAPI
} from '../../types/public-api';

/** Shorthand for the `metadata` shape returned by `extractMetadata()`/carried on `FormExtractionResult`. */
type FormMetadata = FormExtractionResult['metadata'];

/**
 * FormExtractor treats `<input>`/`<select>`/`<textarea>`/`<button>` (and,
 * via `processForm`, the enclosing `<form>` itself) uniformly through
 * runtime duck typing rather than narrowing per tag - e.g. reading
 * `.checked` on a `<select>`, which is simply `undefined` at runtime and
 * harmless because every read here is gated by a `getElementType()` check
 * or a falsy-fallback (`|| false`, `? ... : []`, etc), exactly as the
 * original `.js` relied on.
 *
 * Members present on ALL of `HTMLInputElement`/`HTMLSelectElement`/
 * `HTMLTextAreaElement`/`HTMLButtonElement` stay required; the rest -
 * present on only some of them, or absent altogether on `HTMLFormElement`
 * (which `processForm` also feeds through this file, for the `<form>`
 * element itself) - are optional to match that shape. This mirrors
 * `ScriptInjector.ts`'s minimal local interfaces for dynamic/duck-typed
 * surfaces, rather than a full `@types`-accurate union (which would
 * require explicit narrowing before nearly every property read).
 */
interface FormControlElement extends HTMLElement {
    name: string;
    type?: string;
    value?: string;
    disabled?: boolean;
    required?: boolean;
    readOnly?: boolean;
    checked?: boolean;
    placeholder?: string;
    multiple?: boolean;
    options?: HTMLOptionsCollection;
    selectedOptions?: HTMLCollectionOf<HTMLOptionElement>;
    files?: FileList | null;
    accept?: string;
}

class FormExtractor implements FormExtractorAPI {
    formElementTypes: string[];

    constructor() {
        this.formElementTypes = [
            'input', 'textarea', 'select', 'button'
        ];
    }

    /**
     * Extract form information from a DOM element
     * @param rootElement - The root element to analyze
     * @param options - Extraction options
     * @returns Form structure
     */
    extractFormStructure(rootElement: Element, options: FormExtractionOptions = {}): FormExtractionResult {
        const config: FormExtractionOptions = {
            includeHidden: options.includeHidden || false,
            includeDisabled: options.includeDisabled || false,
            includeReadOnly: options.includeReadOnly !== false,
            includeBoundingBoxes: options.includeBoundingBoxes || false,
            ...options
        };

        const result: FormExtractionResult = {
            metadata: this.extractMetadata(rootElement),
            forms: [],
            elements: [],
            extractedAt: new Date().toISOString()
        };

        // Find form elements
        const formElements = this.findFormElements(rootElement, config);

        // Group by parent form
        const elementsByForm = this.groupElementsByForm(formElements);

        // Process each group
        for (const [formElement, elements] of elementsByForm) {
            if (formElement) {
                result.forms.push(this.processForm(formElement, elements, config));
            } else {
                result.elements = elements.map(element =>
                    this.extractElementInfo(element, rootElement, config)
                );
            }
        }

        return result;
    }

    /**
     * Extract basic metadata
     */
    extractMetadata(element: Element): FormMetadata {
        return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || null,
            className: element.className || null,
            url: window.location.href,
            title: document.title
        };
    }

    /**
     * Find form elements with filtering
     */
    findFormElements(rootElement: Element, config: FormExtractionOptions): FormControlElement[] {
        const elements: FormControlElement[] = [];
        const selector = this.formElementTypes.join(', ');

        if (this.formElementTypes.includes(rootElement.tagName.toLowerCase())) {
            elements.push(rootElement as FormControlElement);
        }

        elements.push(...Array.from(rootElement.querySelectorAll<FormControlElement>(selector)));

        return elements.filter(element => {
            if (!config.includeHidden && this.isHidden(element)) return false;
            if (!config.includeDisabled && element.disabled) return false;
            if (!config.includeReadOnly && element.readOnly) return false;
            return true;
        });
    }

    /**
     * Group elements by their parent form
     */
    groupElementsByForm(elements: FormControlElement[]): Map<HTMLFormElement | null, FormControlElement[]> {
        const groups = new Map<HTMLFormElement | null, FormControlElement[]>();

        for (const element of elements) {
            const form = element.closest('form');
            if (!groups.has(form)) {
                groups.set(form, []);
            }
            groups.get(form)!.push(element);
        }

        return groups;
    }

    /**
     * Process a form with its elements
     */
    processForm(formElement: HTMLFormElement, elements: FormControlElement[], config: FormExtractionOptions): FormGroup {
        return {
            type: 'form',
            element: this.extractElementInfo(formElement, formElement, config),
            elements: elements
                .filter(el => el !== formElement)
                .map(el => this.extractElementInfo(el, formElement, config))
        };
    }

    /**
     * Extract essential element information
     */
    extractElementInfo(element: FormControlElement, rootElement: Element, config: FormExtractionOptions): FormElementInfo {
        const info: FormElementInfo = {
            tagName: element.tagName.toLowerCase(),
            type: this.getElementType(element),
            id: element.id || null,
            name: element.name || null,
            className: element.className || null,

            // Single, reliable selector
            selector: this.getSelector(element),

            // Basic attributes
            attributes: this.getBasicAttributes(element),

            // Values
            value: this.getElementValue(element),
            placeholder: element.placeholder || null,

            // Basic constraints
            required: element.required || false,
            disabled: element.disabled || false,
            readonly: element.readOnly || false,

            // State
            visible: this.isVisible(element),
            interactable: this.isInteractable(element),

            // Labels
            label: this.getLabel(element, rootElement),

            // Options for select/radio/checkbox
            options: this.getOptions(element)
        };

        // Add bounding box if requested
        if (config.includeBoundingBoxes) {
            info.boundingBox = this.getBoundingBox(element);
        }

        return info;
    }

    /**
     * Get element type
     */
    getElementType(element: FormControlElement): string {
        if (element.tagName.toLowerCase() === 'input') {
            return element.type || 'text';
        }
        return element.tagName.toLowerCase();
    }

    /**
     * Get reliable selector for element
     */
    getSelector(element: FormControlElement): string {
        // Prefer ID first
        if (element.id) {
            return `#${element.id}`;
        }

        // Then name attribute for form elements
        if (element.name) {
            return `[name="${element.name}"]`;
        }

        // Generate a simple CSS selector as fallback
        return this.generateCSSSelector(element);
    }

    /**
     * Generate simple CSS selector
     */
    generateCSSSelector(element: FormControlElement): string {
        let selector = element.tagName.toLowerCase();

        if (element.type) {
            selector += `[type="${element.type}"]`;
        }

        if (element.className) {
            const classes = Array.from(element.classList)
                .filter(cls => cls && !cls.startsWith('agentlet-'))
                .slice(0, 2);
            if (classes.length > 0) {
                selector += `.${classes.join('.')}`;
            }
        }

        return selector;
    }

    /**
     * Get basic form attributes
     */
    getBasicAttributes(element: Element): Record<string, string> {
        const attrs: Record<string, string> = {};
        const relevantAttrs = [
            'type', 'name', 'value', 'placeholder', 'required', 'disabled', 'readonly',
            'min', 'max', 'step', 'minlength', 'maxlength', 'pattern',
            'action', 'method'
        ];

        for (const attr of relevantAttrs) {
            if (element.hasAttribute(attr)) {
                // hasAttribute() just returned true, so getAttribute() cannot be null here.
                attrs[attr] = element.getAttribute(attr) as string;
            }
        }

        return attrs;
    }

    /**
     * Get element value
     */
    getElementValue(element: FormControlElement): FormElementValue {
        const type = this.getElementType(element);

        switch (type) {
        case 'checkbox':
        case 'radio':
            return {
                // Only <input> elements reach this branch, where .checked/.value are always real.
                checked: element.checked as boolean,
                value: element.value as string
            };
        case 'select':
            return {
                // Only <select> elements reach this branch, where .value is always a real string.
                selectedValue: element.value as string,
                // Only <select> elements reach this branch, where .selectedOptions is always present.
                selectedOptions: Array.from(element.selectedOptions!).map(opt => ({
                    value: opt.value,
                    text: (opt.textContent as string).trim()
                }))
            };
        case 'file':
            return {
                files: element.files ? Array.from(element.files).map(f => f.name) : [],
                // Only file <input> elements reach this branch, where .accept is always a real string.
                accept: element.accept as string
            };
        default:
            return element.value || null;
        }
    }

    /**
     * Get element label
     */
    getLabel(element: FormControlElement, rootElement: Element | Document): string | null {
        const labels: string[] = [];

        // Explicit labels
        if (element.id) {
            const labelElements = rootElement.querySelectorAll(`label[for="${element.id}"]`);
            labels.push(...Array.from(labelElements).map(label => (label.textContent as string).trim()));
        }

        // Implicit labels
        const parentLabel = element.closest('label');
        if (parentLabel) {
            labels.push((parentLabel.textContent as string).trim());
        }

        // ARIA labels
        if (element.getAttribute('aria-label')) {
            labels.push(element.getAttribute('aria-label') as string);
        }

        return labels.join(' | ') || null;
    }

    /**
     * Get options for select/radio/checkbox
     */
    getOptions(element: FormControlElement): FormElementOptionsInfo {
        const type = this.getElementType(element);

        if (type === 'select') {
            return {
                multiple: element.multiple || false,
                // Only <select> elements reach this branch, where .options is always present.
                options: Array.from(element.options!).map((option, index) => ({
                    index,
                    value: option.value || '',
                    text: (option.textContent as string).trim(),
                    selected: option.selected,
                    disabled: option.disabled
                }))
            };
        }

        if (type === 'radio' || type === 'checkbox') {
            const name = element.name;
            if (name) {
                const related = Array.from(document.querySelectorAll<FormControlElement>(`[name="${name}"]`))
                    .map((el, index) => ({
                        index,
                        // Only <input> elements reach this branch, where .value/.checked are always real.
                        value: el.value as string,
                        checked: el.checked as boolean,
                        label: this.getLabel(el, document)
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
     * Get bounding box
     */
    getBoundingBox(element: HTMLElement): FormElementInfo['boundingBox'] | null {
        if (!element.getBoundingClientRect) return null;

        const rect = element.getBoundingClientRect();
        return {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            visible: this.isInViewport(rect)
        };
    }

    /**
     * Utility methods
     */
    isHidden(element: FormControlElement): boolean {
        return element.type === 'hidden' ||
               element.style.display === 'none' ||
               element.style.visibility === 'hidden' ||
               element.hidden;
    }

    isVisible(element: FormControlElement): boolean {
        return !this.isHidden(element) &&
               element.offsetWidth > 0 &&
               element.offsetHeight > 0;
    }

    isInteractable(element: FormControlElement): boolean {
        return this.isVisible(element) &&
               !element.disabled &&
               !element.readOnly;
    }

    isInViewport(rect: DOMRect): boolean {
        return rect.top >= 0 &&
               rect.left >= 0 &&
               rect.bottom <= window.innerHeight &&
               rect.right <= window.innerWidth;
    }

    /**
     * Export form data in AI-ready format
     * @param rootElement - The root element to analyze
     * @param options - Export options
     * @returns Clean form data
     */
    exportForAI(rootElement: Element, options: FormExtractionOptions = {}): AIFormExport {
        const data = this.extractFormStructure(rootElement, options);

        return {
            metadata: {
                url: data.metadata.url,
                title: data.metadata.title,
                extractedAt: data.extractedAt,
                totalForms: data.forms.length,
                totalElements: data.forms.reduce((sum, form) => sum + form.elements.length, 0) + data.elements.length
            },
            forms: data.forms.map(form => ({
                id: form.element.id,
                name: form.element.name,
                action: form.element.attributes.action,
                method: form.element.attributes.method,
                selector: form.element.selector,
                elements: form.elements.filter(el => el.interactable).map(el => this.cleanElementForAI(el))
            })),
            standaloneElements: data.elements.filter(el => el.interactable).map(el => this.cleanElementForAI(el))
        };
    }

    /**
     * Clean element for AI consumption
     */
    cleanElementForAI(element: FormElementInfo): CleanFormElement {
        const clean: CleanFormElement = {
            type: element.type,
            id: element.id,
            name: element.name,
            selector: element.selector,
            label: element.label,
            placeholder: element.placeholder,
            value: element.value,
            required: element.required,
            disabled: element.disabled,
            visible: element.visible,
            interactable: element.interactable
        };

        if (element.options) {
            if (element.type === 'select' && 'options' in element.options) {
                clean.options = element.options.options.map(opt => ({
                    value: opt.value,
                    text: opt.text,
                    selected: opt.selected,
                    disabled: opt.disabled
                }));
            } else if ((element.type === 'radio' || element.type === 'checkbox') && 'group' in element.options) {
                clean.options = element.options.group?.map(opt => ({
                    value: opt.value,
                    checked: opt.checked,
                    label: opt.label
                })) || [];
            }
        }

        return clean;
    }

    /**
     * Quick export for simple use cases
     * @param element - Element to analyze
     * @returns Simple array of form fields
     */
    quickExport(element: Element): QuickExportField[] {
        const data = this.exportForAI(element, {
            includeHidden: false,
            includeDisabled: false,
            includeBoundingBoxes: false
        });

        const fields: QuickExportField[] = [];

        // Add form elements
        data.forms.forEach(form => {
            form.elements.forEach(element => {
                fields.push({
                    selector: element.selector,
                    type: element.type,
                    name: element.name,
                    label: element.label,
                    value: element.value,
                    required: element.required,
                    options: element.options || null
                });
            });
        });

        // Add standalone elements
        data.standaloneElements.forEach(element => {
            fields.push({
                selector: element.selector,
                type: element.type,
                name: element.name,
                label: element.label,
                value: element.value,
                required: element.required,
                options: element.options || null
            });
        });

        return fields;
    }
}

export default FormExtractor;
