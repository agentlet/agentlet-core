/**
 * Z-Index Management for Agentlet Core
 *
 * Simple, effective z-index management ensuring agentlets appear above existing web content.
 * Uses a high base value (100,000) that works reliably across 99.9% of websites.
 */

import type {
    ZIndexConstants,
    ZIndexDetectionResult,
    ZIndexSuggestionResult,
    ZIndexAnalysisResult
} from '../../types/public-api';

// Base z-index - high enough to appear above most web content
const AGENTLET_BASE = 100000;

/**
 * Z-Index constants for all agentlet components
 * Organized by usage frequency and importance
 *
 * Values are written as literals (rather than `AGENTLET_BASE + offset`
 * expressions) so they keep the literal number types declared by
 * `ZIndexConstants` in src/types/public-api.d.ts; numeric addition always
 * widens to `number` in TypeScript, which would not satisfy that literal
 * type. Each value below is still exactly `AGENTLET_BASE` plus the offset
 * noted in its trailing comment, matching the values this module has
 * always produced.
 */
export const Z_INDEX = {
    // Base elements
    BASE: 100001, // AGENTLET_BASE + 1
    INPUT: 100002, // AGENTLET_BASE + 2
    BUTTON: 100003, // AGENTLET_BASE + 3

    // Background elements
    BACKDROP: 100010, // AGENTLET_BASE + 10
    MODAL_BACKDROP: 100150, // AGENTLET_BASE + 150

    // Interactive highlights
    HOVER_HIGHLIGHT: 100050, // AGENTLET_BASE + 50
    ELEMENT_HIGHLIGHT: 100060, // AGENTLET_BASE + 60
    SELECTION_HIGHLIGHT: 100075, // AGENTLET_BASE + 75
    ACTIVE_SELECTION: 100080, // AGENTLET_BASE + 80

    // UI Components
    TOOLTIP: 100090, // AGENTLET_BASE + 90
    MESSAGE_BUBBLE: 100110, // AGENTLET_BASE + 110
    NOTIFICATION: 100115, // AGENTLET_BASE + 115

    // Main UI
    PANEL: 100100, // AGENTLET_BASE + 100
    PANEL_CONTENT: 100101, // AGENTLET_BASE + 101
    PANEL_HEADER: 100102, // AGENTLET_BASE + 102

    // Dialogs and Modals
    DIALOG: 100200, // AGENTLET_BASE + 200
    DIALOG_OVERLAY: 100150, // AGENTLET_BASE + 150
    INFO_DIALOG: 100210, // AGENTLET_BASE + 210
    INPUT_DIALOG: 100220, // AGENTLET_BASE + 220
    PROGRESS_DIALOG: 100230, // AGENTLET_BASE + 230
    FULLSCREEN_DIALOG: 100240, // AGENTLET_BASE + 240

    // Critical overlays
    LOADING_OVERLAY: 100300, // AGENTLET_BASE + 300
    ERROR_OVERLAY: 100350, // AGENTLET_BASE + 350
    IMAGE_OVERLAY: 100400 // AGENTLET_BASE + 400
} as const satisfies ZIndexConstants;

/** Key of a {@link Z_INDEX} entry, e.g. `'PANEL'` or `'DIALOG_OVERLAY'`. */
type ZIndexKey = keyof typeof Z_INDEX;

/**
 * Generate Z-Index constants with custom base (for advanced use cases)
 * @param base - Custom base z-index value
 * @returns Z-index constants with custom base
 */
export function createZIndexConstants(base: number = AGENTLET_BASE): Record<string, number> {
    const constants: Record<string, number> = {};
    (Object.keys(Z_INDEX) as ZIndexKey[]).forEach(key => {
        const offset = Z_INDEX[key] - AGENTLET_BASE;
        constants[key] = base + offset;
    });
    return constants;
}

/**
 * Get z-index value by component type
 * @param component - Component identifier
 * @returns Z-index value
 */
export function getZIndex(component: string): number {
    return Z_INDEX[component as ZIndexKey] || Z_INDEX.BASE;
}

/**
 * Create CSS z-index string
 * @param component - Component identifier
 * @returns CSS z-index declaration
 */
export function zIndexStyle(component: string): string {
    return `z-index: ${getZIndex(component)};`;
}

/** Options accepted by {@link detectMaxZIndex}. */
export interface DetectMaxZIndexOptions {
    excludeAgentlet?: boolean;
}

/**
 * Detect maximum z-index in current document (debugging utility)
 * @param options - Detection options
 * @returns Detection results
 */
export function detectMaxZIndex(options: DetectMaxZIndexOptions = {}): ZIndexDetectionResult {
    const { excludeAgentlet = true } = options;
    let maxZIndex = 0;
    let maxElement: Element | null = null;
    const elements: Array<{ element: Element; zIndex: number }> = [];

    try {
        document.querySelectorAll('*').forEach(element => {
            const computed = window.getComputedStyle(element);
            const zIndex = parseInt(computed.zIndex, 10);

            if (isNaN(zIndex) || zIndex <= 0) return;

            // Exclude agentlet elements if requested
            if (excludeAgentlet && zIndex >= AGENTLET_BASE) return;

            elements.push({ element, zIndex });

            if (zIndex > maxZIndex) {
                maxZIndex = zIndex;
                maxElement = element;
            }
        });
    } catch (error) {
        console.warn('Z-index detection failed:', error);
    }

    return {
        maxZIndex,
        maxElement,
        totalElements: elements.length,
        agentletBase: AGENTLET_BASE,
        isSafe: maxZIndex < AGENTLET_BASE
    };
}

/**
 * Suggest appropriate base z-index (debugging utility)
 * @returns Suggestion results
 */
export function suggestAgentletZIndexBase(): ZIndexSuggestionResult {
    const detection = detectMaxZIndex();
    const suggested = detection.maxZIndex > 0 ? detection.maxZIndex + 1000 : AGENTLET_BASE;

    return {
        current: AGENTLET_BASE,
        suggested: Math.max(suggested, 1000),
        detection,
        recommendation: detection.isSafe ? 'Current base is safe' : 'Consider higher base'
    };
}

/**
 * Analyze z-index distribution (debugging utility)
 * @returns Analysis results
 */
export function analyzeZIndexDistribution(): ZIndexAnalysisResult {
    const detection = detectMaxZIndex({ excludeAgentlet: false });

    return {
        detection,
        agentletBase: AGENTLET_BASE,
        summary: {
            totalElements: detection.totalElements,
            maxZIndex: detection.maxZIndex,
            agentletRange: `${AGENTLET_BASE} - ${AGENTLET_BASE + 400}`,
            status: detection.isSafe ? '✅ Safe' : '⚠️ Potential conflicts'
        }
    };
}

// Export default
export default Z_INDEX;
