/**
 * Overlay construction/teardown and background-scroll preservation,
 * shared by every dialog type.
 */
import { Z_INDEX } from '../ZIndex.js';

/**
 * Builds the semi-transparent backdrop used by every dialog type except
 * `'fullscreen'`, and mounts it into `root` (a `ShadowRoot`, or an
 * `HTMLElement` such as `document.body` for legacy/standalone use - see
 * `Dialog.getRoot()`). `type` is the active `Dialog.type` (e.g. `'info'`),
 * used only to compose the overlay's class name.
 */
export function buildOverlay(type: string, root: ShadowRoot | HTMLElement): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = `agentlet-dialog-overlay agentlet-${type}-overlay`;
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: ${Z_INDEX.DIALOG_OVERLAY};
        display: flex;
        align-items: center;
        justify-content: center;
    `;
    root.appendChild(overlay);
    return overlay;
}

/** Same as {@link buildOverlay}, but padded so a fullscreen dialog never touches the viewport edge. */
export function buildFullscreenOverlay(type: string, root: ShadowRoot | HTMLElement): HTMLDivElement {
    const overlay = document.createElement('div');
    overlay.className = `agentlet-dialog-overlay agentlet-${type}-overlay`;
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: ${Z_INDEX.DIALOG_OVERLAY};
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 5vh 5vw;
        box-sizing: border-box;
    `;
    root.appendChild(overlay);
    return overlay;
}

/**
 * Marks the page as having an active dialog overlay (adds body classes).
 * Intentionally always the real page `document.body`, even in shadow mode,
 * since these classes block background scroll on the actual page.
 */
export function activateOverlayBodyState(): void {
    document.body.classList.add('agentlet-overlay-active');
    document.body.classList.add('agentlet-dialog-open');
}

/** Reverses {@link activateOverlayBodyState}. */
export function deactivateOverlayBodyState(): void {
    document.body.classList.remove('agentlet-overlay-active');
    document.body.classList.remove('agentlet-dialog-open');
}

/**
 * Records the current scroll position and pins the body via `top` so the
 * background doesn't visibly scroll while a dialog is open. Returns the
 * scroll offset the caller must pass back to {@link restoreScrollPosition}.
 */
export function preserveScrollPosition(): number {
    const scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;
    return scrollY;
}

/** Reverses {@link preserveScrollPosition}, scrolling back to `scrollY`. */
export function restoreScrollPosition(scrollY: number): void {
    document.body.style.top = '';
    window.scrollTo(0, scrollY);
}
