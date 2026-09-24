/**
 * Pure DOM/geometry helpers that position a highlight decoration (arrow,
 * sticker or tooltip) relative to its target element's bounding rect.
 * None of these read or write PageHighlighter instance state.
 */

/**
 * Position an arrow so it points at `rect` from `position`. Only the part
 * of `position` before a `-` is used (e.g. `'top-left'` behaves like
 * `'top'`); an unrecognised value falls back to `'top'`.
 */
export function positionArrow(arrow: HTMLElement, rect: DOMRect, scrollLeft: number, scrollTop: number, position: string): void {
    const positions: Record<string, { left: number; top: number }> = {
        top: {
            left: rect.left + scrollLeft + rect.width / 2,
            top: rect.top + scrollTop - 30
        },
        bottom: {
            left: rect.left + scrollLeft + rect.width / 2,
            top: rect.top + scrollTop + rect.height + 14
        },
        left: {
            left: rect.left + scrollLeft - 30,
            top: rect.top + scrollTop + rect.height / 2
        },
        right: {
            left: rect.left + scrollLeft + rect.width + 14,
            top: rect.top + scrollTop + rect.height / 2
        }
    };

    const pos = positions[position.split('-')[0]] || positions.top;
    arrow.style.left = `${pos.left}px`;
    arrow.style.top = `${pos.top}px`;
}

/**
 * Position a sticker badge at one of five fixed corners/center of `rect`.
 * Unlike {@link positionArrow}, the full `position` string is used as the
 * lookup key (e.g. `'top-left'`, `'center'`); an unrecognised value falls
 * back to `'top-right'`.
 */
export function positionSticker(sticker: HTMLElement, rect: DOMRect, scrollLeft: number, scrollTop: number, position: string): void {
    const positions: Record<string, { left: number; top: number }> = {
        'top-left': {
            left: rect.left + scrollLeft - 16,
            top: rect.top + scrollTop - 16
        },
        'top-right': {
            left: rect.left + scrollLeft + rect.width - 16,
            top: rect.top + scrollTop - 16
        },
        'bottom-left': {
            left: rect.left + scrollLeft - 16,
            top: rect.top + scrollTop + rect.height - 16
        },
        'bottom-right': {
            left: rect.left + scrollLeft + rect.width - 16,
            top: rect.top + scrollTop + rect.height - 16
        },
        center: {
            left: rect.left + scrollLeft + rect.width / 2 - 16,
            top: rect.top + scrollTop + rect.height / 2 - 16
        }
    };

    const pos = positions[position] || positions['top-right'];
    sticker.style.left = `${pos.left}px`;
    sticker.style.top = `${pos.top}px`;
}

/**
 * Position a tooltip relative to `rect`. The tooltip is appended to
 * `document.body` first so its own rendered size can be measured (the
 * caller's later append is then a harmless no-op move).
 */
export function positionTooltip(tooltip: HTMLElement, rect: DOMRect, scrollLeft: number, scrollTop: number, position: string): void {
    document.body.appendChild(tooltip);
    const tooltipRect = tooltip.getBoundingClientRect();

    const positions: Record<string, { left: number; top: number }> = {
        top: {
            left: rect.left + scrollLeft + rect.width / 2 - tooltipRect.width / 2,
            top: rect.top + scrollTop - tooltipRect.height - 10
        },
        bottom: {
            left: rect.left + scrollLeft + rect.width / 2 - tooltipRect.width / 2,
            top: rect.top + scrollTop + rect.height + 10
        },
        left: {
            left: rect.left + scrollLeft - tooltipRect.width - 10,
            top: rect.top + scrollTop + rect.height / 2 - tooltipRect.height / 2
        },
        right: {
            left: rect.left + scrollLeft + rect.width + 10,
            top: rect.top + scrollTop + rect.height / 2 - tooltipRect.height / 2
        }
    };

    const pos = positions[position.split('-')[0]] || positions.top;
    tooltip.style.left = `${pos.left}px`;
    tooltip.style.top = `${pos.top}px`;
}
