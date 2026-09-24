/**
 * Internal types shared by the PageHighlighter module split (styles,
 * overlay, highlight, positioning, tour, scroll) and the PageHighlighter.ts
 * facade that wires them together.
 */
import type {
    PageHighlighterOverlayOptions,
    PageHighlighterOverlayControl,
    PageHighlighterHighlightOptions,
    PageHighlighterHighlightControl
} from '../../../types/public-api';

/** `showOverlay()`'s options with every default from its original spread applied. */
export type ResolvedOverlayConfig = Required<PageHighlighterOverlayOptions>;

/** `highlight()`'s options with every default from its original spread applied. */
export type ResolvedHighlightConfig = Required<PageHighlighterHighlightOptions>;

/**
 * What `showOverlay()` stores in `PageHighlighter.overlays` and also
 * returns to the caller: the public control plus the internal bookkeeping
 * fields (`config`, `timeoutId`) the original implementation attached to
 * that same object.
 */
export interface OverlayEntry extends PageHighlighterOverlayControl {
    config: ResolvedOverlayConfig;
    timeoutId: ReturnType<typeof setTimeout> | null;
}

/**
 * What `highlight()` stores in `PageHighlighter.highlights` and also
 * returns to the caller: the public control plus the resolved `config` the
 * original implementation attached to that same object.
 */
export interface HighlightEntry extends PageHighlighterHighlightControl {
    config: ResolvedHighlightConfig;
}

/**
 * The slice of the PageHighlighter facade's instance state the split
 * modules operate on. It is passed explicitly (instead of the modules
 * relying on `this`) so each module is a plain, independently testable
 * function; the facade passes itself as this context.
 */
export interface PageHighlighterContext {
    overlays: Map<string, OverlayEntry>;
    highlights: Map<string, HighlightEntry>;
    nextId: number;
    styleInjected: boolean;
}
