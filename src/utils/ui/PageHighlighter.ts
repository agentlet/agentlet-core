/**
 * PageHighlighter - utility for highlighting elements and showing overlays
 * on web pages.
 *
 * Features:
 * - Full-screen overlays with messages and progress bars
 * - Element highlighting with various visual indicators
 * - Dynamic control of highlights (show/hide/update/destroy)
 * - Multiple highlight types (border, arrow, sticker, pulse)
 * - Animation support and accessibility features
 *
 * This class is a thin facade: the implementation lives in typed modules
 * under ./pageHighlighter/ (styles, overlay, highlight, positioning, tour,
 * scroll). Every method below just forwards to its module counterpart,
 * passing `this` as the shared `PageHighlighterContext`.
 */
import type {
    PageHighlighterAPI,
    PageHighlighterOverlayOptions,
    PageHighlighterOverlayControl,
    PageHighlighterHighlightOptions,
    PageHighlighterHighlightControl,
    PageHighlighterTourStep,
    PageHighlighterTourControl,
    PageHighlighterScrollOptions,
    PageHighlighterScrollResult
} from '../../types/public-api';
import type { OverlayEntry, HighlightEntry } from './pageHighlighter/types.js';
import { ensureStyles } from './pageHighlighter/styles.js';
import { showOverlay, hideOverlay, destroyOverlay } from './pageHighlighter/overlay.js';
import { highlight, repositionHighlight, destroyHighlight } from './pageHighlighter/highlight.js';
import { positionArrow, positionSticker, positionTooltip } from './pageHighlighter/positioning.js';
import { createTour } from './pageHighlighter/tour.js';
import { scrollTo, scrollToTop, scrollToBottom, scrollToAndHighlight } from './pageHighlighter/scroll.js';

class PageHighlighter implements PageHighlighterAPI {
    overlays: Map<string, OverlayEntry>;
    highlights: Map<string, HighlightEntry>;
    nextId: number;
    styleInjected: boolean;

    constructor() {
        this.overlays = new Map();
        this.highlights = new Map();
        this.nextId = 1;
        this.styleInjected = false;
        this.ensureStyles();
    }

    /** Inject CSS styles for highlighting functionality (idempotent per instance). */
    ensureStyles(): void {
        ensureStyles(this);
    }

    /** Show a full-screen overlay with a message. */
    showOverlay(options: PageHighlighterOverlayOptions = {}): PageHighlighterOverlayControl {
        return showOverlay(this, options);
    }

    /** Hide an overlay with a fade animation. */
    hideOverlay(id: string): void {
        hideOverlay(this, id);
    }

    /** Destroy an overlay completely. */
    destroyOverlay(id: string): void {
        destroyOverlay(this, id);
    }

    /** Highlight an element on the page. */
    highlight(element: Element | string, options: PageHighlighterHighlightOptions = {}): PageHighlighterHighlightControl | null {
        return highlight(this, element, options);
    }

    /** Position arrow relative to target element. */
    positionArrow(arrow: HTMLElement, rect: DOMRect, scrollLeft: number, scrollTop: number, position: string): void {
        positionArrow(arrow, rect, scrollLeft, scrollTop, position);
    }

    /** Position sticker relative to target element. */
    positionSticker(sticker: HTMLElement, rect: DOMRect, scrollLeft: number, scrollTop: number, position: string): void {
        positionSticker(sticker, rect, scrollLeft, scrollTop, position);
    }

    /** Position tooltip relative to target element. */
    positionTooltip(tooltip: HTMLElement, rect: DOMRect, scrollLeft: number, scrollTop: number, position: string): void {
        positionTooltip(tooltip, rect, scrollLeft, scrollTop, position);
    }

    /** Reposition highlight elements. */
    repositionHighlight(highlightControl: PageHighlighterHighlightControl): void {
        repositionHighlight(highlightControl);
    }

    /** Destroy a highlight completely. */
    destroyHighlight(id: string): void {
        destroyHighlight(this, id);
    }

    /** Create a guided tour with multiple highlights. */
    createTour(steps: PageHighlighterTourStep[] = []): PageHighlighterTourControl {
        return createTour(this, steps);
    }

    /** Clear all overlays and highlights. */
    clearAll(): void {
        this.overlays.forEach((_overlay, id) => destroyOverlay(this, id));
        this.highlights.forEach((_highlight, id) => destroyHighlight(this, id));
    }

    /** Scroll to an element or position with smooth animation. */
    scrollTo(
        target: Element | string | { x: number; y: number },
        options: PageHighlighterScrollOptions = {}
    ): Promise<PageHighlighterScrollResult> {
        return scrollTo(this, target, options);
    }

    /** Scroll to the top of the page. */
    scrollToTop(options: PageHighlighterScrollOptions = {}): Promise<{ x: number; y: number }> {
        return scrollToTop(this, options);
    }

    /** Scroll to the bottom of the page. */
    scrollToBottom(options: PageHighlighterScrollOptions = {}): Promise<{ x: number; y: number }> {
        return scrollToBottom(this, options);
    }

    /** Scroll to an element and highlight it. */
    scrollToAndHighlight(target: Element | string, options: PageHighlighterScrollOptions = {}): Promise<PageHighlighterScrollResult> {
        return scrollToAndHighlight(this, target, options);
    }

    /** Get statistics about active highlights and overlays. */
    getStats(): { overlays: number; highlights: number; total: number } {
        return {
            overlays: this.overlays.size,
            highlights: this.highlights.size,
            total: this.overlays.size + this.highlights.size
        };
    }
}

export default PageHighlighter;
