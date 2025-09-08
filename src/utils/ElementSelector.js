/**
 * Element Selector Utility for Agentlet Core
 * Provides an interactive element selection tool for modules
 */
import { Z_INDEX } from './ZIndexConstants.js';
export default class ElementSelector {
    constructor() {
        this.isActive = false;
        this.callback = null;
        this.overlay = null;
        this.highlightBox = null;
        this.currentElement = null;
        this.originalCursor = null;
        this.allowedSelector = null; // CSS selector to limit selectable elements
        
        // Bind methods
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this.handleKeydown = this.handleKeydown.bind(this);
    }

    /**
     * Start element selection mode
     * @param {Function} callback - Function to call with selected element
     * @param {Object} options - Configuration options
     * @param {string} options.selector - CSS selector to limit selectable elements (e.g., 'form', 'input', 'button')
     * @param {string} options.message - Custom message to show in overlay
     */
    start(callback, options = {}) {
        if (this.isActive) {
            console.warn('Element selector is already active');
            return;
        }

        this.callback = callback;
        this.allowedSelector = options.selector || null;
        this.isActive = true;

        // Create overlay and highlight elements
        this.createOverlay(options.message);
        this.createHighlightBox();

        // Store original cursor and set new one
        this.originalCursor = document.body.style.cursor;
        document.body.style.cursor = 'crosshair';

        // Add event listeners
        document.addEventListener('mousemove', this.handleMouseMove, true);
        document.addEventListener('click', this.handleClick, true);
        document.addEventListener('keydown', this.handleKeydown, true);

        // Prevent selection
        document.body.style.userSelect = 'none';

        console.log('🎯 Element selector activated. Click an element to select it, ESC to cancel.');
    }

    /**
     * Stop element selection mode
     */
    stop() {
        if (!this.isActive) return;

        this.isActive = false;
        this.callback = null;
        this.currentElement = null;
        this.allowedSelector = null;

        // Remove overlay and highlight
        this.removeOverlay();
        this.removeHighlightBox();

        // Restore cursor
        if (this.originalCursor !== null) {
            document.body.style.cursor = this.originalCursor;
            this.originalCursor = null;
        }

        // Remove event listeners
        document.removeEventListener('mousemove', this.handleMouseMove, true);
        document.removeEventListener('click', this.handleClick, true);
        document.removeEventListener('keydown', this.handleKeydown, true);

        // Restore selection
        document.body.style.userSelect = '';

        console.log('🎯 Element selector deactivated');
    }

    /**
     * Create semi-transparent overlay
     */
    createOverlay(customMessage) {
        const $ = window.agentlet.$;
        this.overlay = $('<div>')[0];
        this.overlay.id = 'agentlet-element-selector-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0, 0, 0, 0.2);
            z-index: ${Z_INDEX.SELECTION_BACKDROP};
            pointer-events: none;
        `;
        
        // Add instruction message
        let message = customMessage || 'Click an element to select it, or press Enter to confirm selection, ESC to cancel';
        if (this.allowedSelector) {
            message = customMessage || `Click a ${this.allowedSelector} element to select it, or press Enter to confirm selection, ESC to cancel`;
        }
        
        const messageEl = $('<div>')[0];
        messageEl.style.cssText = `
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            pointer-events: none;
            z-index: ${Z_INDEX.SELECTION_HIGHLIGHT};
        `;
        messageEl.textContent = message;
        this.overlay.appendChild(messageEl);
        
        $('body').append(this.overlay);
    }

    /**
     * Remove overlay
     */
    removeOverlay() {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    /**
     * Create highlight box for hovering elements
     */
    createHighlightBox() {
        const $ = window.agentlet.$;
        this.highlightBox = $('<div>')[0];
        this.highlightBox.id = 'agentlet-element-selector-highlight';
        this.highlightBox.style.cssText = `
            position: absolute;
            border: 2px solid #007bff;
            background: rgba(0, 123, 255, 0.1);
            pointer-events: none;
            z-index: ${Z_INDEX.BACKDROP};
            display: none;
            transition: all 0.1s ease;
        `;
        $('body').append(this.highlightBox);
    }

    /**
     * Remove highlight box
     */
    removeHighlightBox() {
        if (this.highlightBox) {
            this.highlightBox.remove();
            this.highlightBox = null;
        }
    }

    /**
     * Handle mouse movement to highlight elements
     */
    handleMouseMove(event) {
        if (!this.isActive) return;

        const element = this.getElementFromPoint(event.clientX, event.clientY);
        
        // If we're not over a valid element or it's an internal element, hide highlight
        if (!element || this.isInternalElement(element)) {
            this.hideHighlight();
            this.currentElement = null;
            return;
        }

        // Find the best matching element (either the element itself or a parent that matches the selector)
        const targetElement = this.findSelectableElement(element);
        
        // If no selectable element found, hide highlight
        if (!targetElement) {
            this.hideHighlight();
            this.currentElement = null;
            return;
        }

        // Only update if we're hovering a different element
        if (this.currentElement !== targetElement) {
            this.currentElement = targetElement;
            this.highlightElement(targetElement);
        }
    }

    /**
     * Handle click to select element
     */
    handleClick(event) {
        if (!this.isActive) return;

        event.preventDefault();
        event.stopPropagation();

        const element = this.getElementFromPoint(event.clientX, event.clientY);
        if (!element || this.isInternalElement(element)) return;

        // Find the best matching element (either the element itself or a parent that matches the selector)
        const targetElement = this.findSelectableElement(element);
        if (!targetElement) return;

        this.selectElement(targetElement);
    }

    /**
     * Handle keyboard events (ESC to cancel, Enter to select)
     */
    handleKeydown(event) {
        if (!this.isActive) return;

        if (event.key === 'Escape') {
            event.preventDefault();
            this.stop();
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (this.currentElement) {
                this.selectElement(this.currentElement);
            }
        }
    }

    /**
     * Get element at specific coordinates
     */
    getElementFromPoint(x, y) {
        const $ = window.agentlet.$;
        // Temporarily hide our overlay elements
        const $overlay = $(this.overlay);
        const $highlight = $(this.highlightBox);
        const overlayDisplay = $overlay.css('display');
        const highlightDisplay = $highlight.css('display');

        $overlay.hide();
        $highlight.hide();

        const element = document.elementFromPoint(x, y);

        // Restore overlay elements
        $overlay.css('display', overlayDisplay);
        $highlight.css('display', highlightDisplay);

        return element;
    }

    /**
     * Check if element is internal to the selector system
     */
    isInternalElement(element) {
        if (!element) return true;
        
        // Skip our own elements
        if (element.id === 'agentlet-element-selector-overlay' ||
            element.id === 'agentlet-element-selector-highlight' ||
            element.closest('#agentlet-container') ||
            element.id === 'agentlet-toggle') {
            return true;
        }

        return false;
    }

    /**
     * Check if element matches the allowed selector
     */
    isElementSelectable(element) {
        if (!element) return false;
        
        // If no selector filter is set, all elements are selectable
        if (!this.allowedSelector) return true;
        
        // Check if element matches the allowed selector
        try {
            return element.matches(this.allowedSelector);
        } catch (error) {
            console.warn('Invalid selector:', this.allowedSelector, error);
            return true;
        }
    }

    /**
     * Find the best selectable element starting from the given element
     * If the element doesn't match the selector, traverse up the DOM tree to find a parent that does
     */
    findSelectableElement(element) {
        if (!element) return null;

        // If no selector filter is set, return the element
        if (!this.allowedSelector) return element;

        // Start from the given element and traverse up the DOM tree
        let currentElement = element;
        
        while (currentElement && currentElement !== document.body) {
            if (this.isElementSelectable(currentElement)) {
                return currentElement;
            }
            currentElement = currentElement.parentElement;
        }

        return null;
    }

    /**
     * Select an element and trigger the callback
     */
    selectElement(element) {
        if (!element) return;

        const elementInfo = this.getElementInfo(element);
        
        // Save callback before stop() clears it
        const callback = this.callback;
        
        this.stop();

        if (callback) {
            callback(element, elementInfo);
        }
    }

    /**
     * Highlight an element
     */
    highlightElement(element) {
        if (!this.highlightBox || !element) return;

        const rect = element.getBoundingClientRect();
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;

        this.highlightBox.style.cssText = `
            position: absolute;
            left: ${rect.left + scrollX - 2}px;
            top: ${rect.top + scrollY - 2}px;
            width: ${rect.width + 4}px;
            height: ${rect.height + 4}px;
            border: 2px solid #007bff;
            background: rgba(0, 123, 255, 0.1);
            pointer-events: none;
            z-index: ${Z_INDEX.SELECTION_HIGHLIGHT};
            display: block;
            transition: all 0.1s ease;
        `;
    }

    /**
     * Hide the highlight box
     */
    hideHighlight() {
        if (this.highlightBox) {
            this.highlightBox.style.display = 'none';
        }
    }

    /**
     * Get comprehensive information about an element
     */
    getElementInfo(element) {
        if (!element) return null;

        const rect = element.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(element);

        return {
            tagName: element.tagName.toLowerCase(),
            id: element.id || null,
            className: element.className || null,
            classes: Array.from(element.classList),
            text: element.textContent?.trim().substring(0, 100) || null,
            attributes: this.getElementAttributes(element),
            position: {
                x: rect.left,
                y: rect.top,
                width: rect.width,
                height: rect.height
            },
            styles: {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                backgroundColor: computedStyle.backgroundColor,
                color: computedStyle.color,
                fontSize: computedStyle.fontSize,
                fontFamily: computedStyle.fontFamily
            },
            xpath: this.getXPath(element),
            cssSelector: this.generateCSSSelector(element),
            isVisible: this.isElementVisible(element),
            hasChildren: element.children.length > 0,
            parent: element.parentElement?.tagName.toLowerCase() || null
        };
    }

    /**
     * Get all attributes of an element
     */
    getElementAttributes(element) {
        const attributes = {};
        for (const attr of element.attributes) {
            attributes[attr.name] = attr.value;
        }
        return attributes;
    }

    /**
     * Generate XPath for an element
     */
    getXPath(element) {
        if (element.id) {
            return `//*[@id="${element.id}"]`;
        }

        const parts = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
            let index = 0;
            let hasFollowingSiblings = false;
            let hasPrecedingSiblings = false;
            
            for (let sibling = element.previousSibling; sibling; sibling = sibling.previousSibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
                    hasPrecedingSiblings = true;
                    index++;
                }
            }
            
            for (let sibling = element.nextSibling; sibling && !hasFollowingSiblings; sibling = sibling.nextSibling) {
                if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === element.nodeName) {
                    hasFollowingSiblings = true;
                }
            }
            
            const tagName = element.nodeName.toLowerCase();
            const pathIndex = (hasPrecedingSiblings || hasFollowingSiblings) ? `[${index + 1}]` : '';
            parts.splice(0, 0, tagName + pathIndex);
            
            element = element.parentNode;
        }
        
        return parts.length ? `/${  parts.join('/')}` : '';
    }

    /**
     * Generate CSS selector for an element
     */
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

    /**
     * Check if element is visible
     */
    isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        
        return !!(
            rect.width && 
            rect.height && 
            style.visibility !== 'hidden' && 
            style.display !== 'none' &&
            style.opacity !== '0'
        );
    }
}