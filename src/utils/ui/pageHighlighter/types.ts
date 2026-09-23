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
 * function; the facade passes itself as this context, which is what makes
 * `visible` below work the way the original code did.
 *
 * `visible` is intentionally optional and never initialized here: it
 * preserves a bug in the original `highlight()`'s `show`/`hide` closures.
 * They were written as arrow functions reading/writing `this.visible`,
 * where `this` is the enclosing `highlight()` method's receiver - the
 * PageHighlighter instance itself, not the individual highlight control
 * object. So every highlight created by one PageHighlighter instance
 * shares a single instance-level visibility flag instead of having its
 * own. See highlight.ts for the preserved implementation and
 * tests/utils/ui/PageHighlighter.markup.test.ts for tests pinning it.
 */
export interface PageHighlighterContext {
    overlays: Map<string, OverlayEntry>;
    highlights: Map<string, HighlightEntry>;
    nextId: number;
    styleInjected: boolean;
    visible?: boolean;
}
