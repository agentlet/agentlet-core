/**
 * Element highlighting: creation (border/arrow/sticker/pulse, with an
 * optional tooltip message), repositioning and destruction.
 */
import type { PageHighlighterHighlightOptions, PageHighlighterHighlightControl } from '../../../types/public-api';
import type { PageHighlighterContext, HighlightEntry, ResolvedHighlightConfig } from './types.js';
import { positionArrow, positionSticker, positionTooltip } from './positioning.js';

const DEFAULT_HIGHLIGHT_CONFIG: ResolvedHighlightConfig = {
    type: 'border',
    style: 'primary',
    overlay: false,
    animation: 'pulse',
    message: null,
    position: 'top-right',
    clickable: false,
    onClick: null,
    offset: 5
};

/**
 * Highlight an element on the page. Returns `null` (after a console
 * warning) if `element` cannot be resolved to a real DOM element.
 */
export function highlight(
    context: PageHighlighterContext,
    element: Element | string,
    options: PageHighlighterHighlightOptions = {}
): PageHighlighterHighlightControl | null {
    // Resolve element
    const targetElement = typeof element === 'string' ?
        document.querySelector(element) : element;

    if (!targetElement) {
        console.warn('PageHighlighter: Element not found', element);
        return null;
    }

    const config: ResolvedHighlightConfig = { ...DEFAULT_HIGHLIGHT_CONFIG, ...options };

    const id = `highlight_${context.nextId++}`;
    const rect = targetElement.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    const highlightElements: HTMLElement[] = [];

    // Create highlight based on type
    switch (config.type) {
    case 'border': {
        const border = document.createElement('div');
        border.className = `agentlet-highlight-border ${config.style}`;
        if (config.animation !== 'none') {
            border.style.animation = `agentlet${config.animation.charAt(0).toUpperCase()}${config.animation.slice(1)} 2s infinite`;
        }
        border.style.left = `${rect.left + scrollLeft - config.offset}px`;
        border.style.top = `${rect.top + scrollTop - config.offset}px`;
        border.style.width = `${rect.width + config.offset * 2}px`;
        border.style.height = `${rect.height + config.offset * 2}px`;
        document.body.appendChild(border);
        highlightElements.push(border);
        break;
    }

    case 'arrow': {
        const arrow = document.createElement('div');
        arrow.className = `agentlet-arrow ${config.position.split('-')[0]}`;
        positionArrow(arrow, rect, scrollLeft, scrollTop, config.position);
        document.body.appendChild(arrow);
        highlightElements.push(arrow);
        break;
    }

    case 'sticker': {
        const sticker = document.createElement('div');
        sticker.className = `agentlet-sticker ${config.style}`;
        sticker.textContent = config.message || '!';
        positionSticker(sticker, rect, scrollLeft, scrollTop, config.position);
        document.body.appendChild(sticker);
        highlightElements.push(sticker);
        break;
    }

    case 'pulse':
        (targetElement as HTMLElement).style.animation = 'agentletPulse 1s infinite';
        break;
    }

    // Add tooltip message if provided
    let tooltip: HTMLElement | null = null;
    if (config.message && config.type !== 'sticker') {
        tooltip = document.createElement('div');
        tooltip.className = `agentlet-tooltip ${config.position.split('-')[0] || 'top'}`;
        tooltip.textContent = config.message;
        positionTooltip(tooltip, rect, scrollLeft, scrollTop, config.position);
        document.body.appendChild(tooltip);
        highlightElements.push(tooltip);
    }

    // Make clickable if needed
    const onClick = config.onClick;
    if (config.clickable && onClick) {
        highlightElements.forEach(el => {
            el.classList.add('agentlet-highlight-clickable');
            el.addEventListener('click', onClick);
        });
    }

    // Create highlight control object
    const highlightControl: HighlightEntry = {
        id,
        element: targetElement,
        highlightElements,
        config,
        visible: true,

        update: (updates) => {
            Object.assign(config, updates);

            if (updates.message && tooltip) {
                tooltip.textContent = updates.message;
            }

            // Reposition if element moved
            const newRect = targetElement.getBoundingClientRect();
            if (newRect.left !== rect.left || newRect.top !== rect.top) {
                repositionHighlight(highlightControl);
            }
        },

        show: () => {
            if (!highlightControl.visible) {
                highlightElements.forEach(el => { el.style.display = 'block'; });
                highlightControl.visible = true;
            }
        },

        hide: () => {
            if (highlightControl.visible) {
                highlightElements.forEach(el => { el.style.display = 'none'; });
                highlightControl.visible = false;
            }
        },

        destroy: () => destroyHighlight(context, id)
    };

    context.highlights.set(id, highlightControl);
    return highlightControl;
}

/**
 * Recomputes and applies the position of a highlight's border element from
 * the target element's live bounding rect. Arrow, sticker and tooltip
 * decorations are not repositioned (this mirrors the original
 * implementation, which only ever handled the border case).
 */
export function repositionHighlight(highlightControl: PageHighlighterHighlightControl): void {
    const rect = highlightControl.element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    // `config` isn't part of the public PageHighlighterHighlightControl
    // shape - only our own HighlightEntry objects carry it, which is all
    // this is ever actually called with (directly, or via update()'s
    // auto-reposition).
    const offset = (highlightControl as HighlightEntry).config.offset;

    // Update positions of all highlight elements
    highlightControl.highlightElements.forEach(el => {
        if (el.classList.contains('agentlet-highlight-border')) {
            el.style.left = `${rect.left + scrollLeft - offset}px`;
            el.style.top = `${rect.top + scrollTop - offset}px`;
            el.style.width = `${rect.width + offset * 2}px`;
            el.style.height = `${rect.height + offset * 2}px`;
        }
        // Add repositioning for other element types as needed
    });
}

/** Destroys a highlight completely: removes its elements and clears a pulse animation, if any. */
export function destroyHighlight(context: PageHighlighterContext, id: string): void {
    const entry = context.highlights.get(id);
    if (!entry) return;

    // Remove pulse animation from original element
    if (entry.config.type === 'pulse') {
        (entry.element as HTMLElement).style.animation = '';
    }

    // Remove all highlight elements
    entry.highlightElements.forEach(el => {
        if (el && el.parentNode) {
            el.parentNode.removeChild(el);
        }
    });

    context.highlights.delete(id);
}
