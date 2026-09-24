/**
 * Scrolling helpers: scroll to an element, a raw coordinate, the top or
 * bottom of the page, optionally with a temporary highlight.
 */
import type { PageHighlighterScrollOptions, PageHighlighterScrollResult, PageHighlighterHighlightControl } from '../../../types/public-api';
import type { PageHighlighterContext } from './types.js';
import { highlight } from './highlight.js';

type ResolvedScrollConfig = Required<PageHighlighterScrollOptions>;

const DEFAULT_SCROLL_CONFIG: ResolvedScrollConfig = {
    behavior: 'smooth',
    block: 'center',
    inline: 'center',
    offset: { x: 0, y: 0 },
    highlight: false,
    highlightDuration: 2000,
    onComplete: null
};

/**
 * Scroll to an element, a CSS selector, or raw `{x, y}` coordinates, with
 * an optional temporary highlight. Resolves once the (approximate) scroll
 * completion timer fires.
 */
export function scrollTo(
    context: PageHighlighterContext,
    target: Element | string | { x: number; y: number },
    options: PageHighlighterScrollOptions = {}
): Promise<PageHighlighterScrollResult> {
    const config: ResolvedScrollConfig = { ...DEFAULT_SCROLL_CONFIG, ...options };

    return new Promise((resolve, reject) => {
        try {
            let targetElement: Element | null = null;
            const scrollOptions: ScrollIntoViewOptions = {
                behavior: config.behavior,
                block: config.block,
                inline: config.inline
            };

            // Handle different target types
            if (typeof target === 'string') {
                // CSS selector
                targetElement = document.querySelector(target);
                if (!targetElement) {
                    console.warn('PageHighlighter.scrollTo: Element not found', target);
                    reject(new Error(`Element not found: ${target}`));
                    return;
                }
            } else if (target && typeof target === 'object') {
                if ('nodeType' in target && target.nodeType === Node.ELEMENT_NODE) {
                    // DOM element
                    targetElement = target as Element;
                } else if ('x' in target && 'y' in target && typeof target.x === 'number' && typeof target.y === 'number') {
                    // Coordinates {x, y}
                    const scrollX = target.x + config.offset.x;
                    const scrollY = target.y + config.offset.y;

                    window.scrollTo({
                        left: scrollX,
                        top: scrollY,
                        behavior: config.behavior
                    });

                    // For coordinate scrolling, we can't detect completion easily
                    setTimeout(() => {
                        if (config.onComplete) config.onComplete();
                        resolve({ x: scrollX, y: scrollY });
                    }, config.behavior === 'smooth' ? 500 : 0);
                    return;
                } else {
                    reject(new Error('Invalid target object. Expected DOM element or {x, y} coordinates'));
                    return;
                }
            } else {
                reject(new Error('Invalid target. Expected string selector, DOM element, or {x, y} coordinates'));
                return;
            }

            // Element scrolling
            if (targetElement) {
                // Apply offset if needed
                if (config.offset.x !== 0 || config.offset.y !== 0) {
                    const rect = targetElement.getBoundingClientRect();
                    const absoluteX = rect.left + window.pageXOffset + config.offset.x;
                    const absoluteY = rect.top + window.pageYOffset + config.offset.y;

                    window.scrollTo({
                        left: absoluteX,
                        top: absoluteY,
                        behavior: config.behavior
                    });
                } else {
                    // Standard element scroll
                    targetElement.scrollIntoView(scrollOptions);
                }

                // Add temporary highlight if requested
                let highlightControl: PageHighlighterHighlightControl | null = null;
                if (config.highlight) {
                    highlightControl = highlight(context, targetElement, {
                        type: 'border',
                        style: 'primary',
                        animation: 'pulse',
                        message: 'Scrolled to this element'
                    });

                    // Auto-remove highlight after duration
                    setTimeout(() => {
                        if (highlightControl) {
                            highlightControl.destroy();
                        }
                    }, config.highlightDuration);
                }

                // Detect scroll completion (approximate)
                const checkScrollComplete = (): void => {
                    setTimeout(() => {
                        if (config.onComplete) config.onComplete();
                        resolve({
                            element: targetElement as Element,
                            highlight: highlightControl,
                            rect: (targetElement as Element).getBoundingClientRect()
                        });
                    }, config.behavior === 'smooth' ? 500 : 0);
                };

                checkScrollComplete();
            }
        } catch (error) {
            console.error('PageHighlighter.scrollTo error:', error);
            reject(error);
        }
    });
}

/** Scroll to the top of the page. */
export function scrollToTop(context: PageHighlighterContext, options: PageHighlighterScrollOptions = {}): Promise<{ x: number; y: number }> {
    return scrollTo(context, { x: 0, y: 0 }, {
        behavior: 'smooth',
        ...options
        // scrollTo always resolves {x, y} for coordinate targets - see the
        // PageHighlighterScrollResult union in public-api.d.ts.
    }) as Promise<{ x: number; y: number }>;
}

/** Scroll to the bottom of the page. */
export function scrollToBottom(context: PageHighlighterContext, options: PageHighlighterScrollOptions = {}): Promise<{ x: number; y: number }> {
    return scrollTo(context, {
        x: 0,
        y: document.documentElement.scrollHeight
    }, {
        behavior: 'smooth',
        ...options
    }) as Promise<{ x: number; y: number }>;
}

/** Scroll to an element (or selector) and highlight it, defaulting `highlight`/`highlightDuration` on. */
export function scrollToAndHighlight(
    context: PageHighlighterContext,
    target: Element | string,
    options: PageHighlighterScrollOptions = {}
): Promise<PageHighlighterScrollResult> {
    const scrollOptions: PageHighlighterScrollOptions = {
        behavior: 'smooth',
        block: 'center',
        highlight: true,
        highlightDuration: 3000,
        ...options
    };

    return scrollTo(context, target, scrollOptions);
}
