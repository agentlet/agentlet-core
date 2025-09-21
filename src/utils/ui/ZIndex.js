/**
 * Z-Index Management for Agentlet Core
 * 
 * Simple, effective z-index management ensuring agentlets appear above existing web content.
 * Uses a high base value (100,000) that works reliably across 99.9% of websites.
 */

// Base z-index - high enough to appear above most web content
const AGENTLET_BASE = 100000;

/**
 * Z-Index constants for all agentlet components
 * Organized by usage frequency and importance
 */
export const Z_INDEX = {
    // Base elements
    BASE: AGENTLET_BASE + 1,
    INPUT: AGENTLET_BASE + 2,
    BUTTON: AGENTLET_BASE + 3,
    
    // Background elements
    BACKDROP: AGENTLET_BASE + 10,
    MODAL_BACKDROP: AGENTLET_BASE + 150,
    
    // Interactive highlights
    HOVER_HIGHLIGHT: AGENTLET_BASE + 50,
    ELEMENT_HIGHLIGHT: AGENTLET_BASE + 60,
    SELECTION_HIGHLIGHT: AGENTLET_BASE + 75,
    ACTIVE_SELECTION: AGENTLET_BASE + 80,
    
    // UI Components
    TOOLTIP: AGENTLET_BASE + 90,
    MESSAGE_BUBBLE: AGENTLET_BASE + 110,
    NOTIFICATION: AGENTLET_BASE + 115,
    
    // Main UI
    PANEL: AGENTLET_BASE + 100,
    PANEL_CONTENT: AGENTLET_BASE + 101,
    PANEL_HEADER: AGENTLET_BASE + 102,
    
    // Dialogs and Modals
    DIALOG: AGENTLET_BASE + 200,
    DIALOG_OVERLAY: AGENTLET_BASE + 150,
    INFO_DIALOG: AGENTLET_BASE + 210,
    INPUT_DIALOG: AGENTLET_BASE + 220,
    PROGRESS_DIALOG: AGENTLET_BASE + 230,
    FULLSCREEN_DIALOG: AGENTLET_BASE + 240,
    
    // Critical overlays
    LOADING_OVERLAY: AGENTLET_BASE + 300,
    ERROR_OVERLAY: AGENTLET_BASE + 350,
    IMAGE_OVERLAY: AGENTLET_BASE + 400
};

/**
 * Generate Z-Index constants with custom base (for advanced use cases)
 * @param {number} base - Custom base z-index value
 * @returns {Object} Z-index constants with custom base
 */
export function createZIndexConstants(base = AGENTLET_BASE) {
    const constants = {};
    Object.keys(Z_INDEX).forEach(key => {
        const offset = Z_INDEX[key] - AGENTLET_BASE;
        constants[key] = base + offset;
    });
    return constants;
}

/**
 * Get z-index value by component type
 * @param {string} component - Component identifier
 * @returns {number} Z-index value
 */
export function getZIndex(component) {
    return Z_INDEX[component] || Z_INDEX.BASE;
}

/**
 * Create CSS z-index string
 * @param {string} component - Component identifier  
 * @returns {string} CSS z-index declaration
 */
export function zIndexStyle(component) {
    return `z-index: ${getZIndex(component)};`;
}

/**
 * Detect maximum z-index in current document (debugging utility)
 * @param {Object} options - Detection options
 * @returns {Object} Detection results
 */
export function detectMaxZIndex(options = {}) {
    const { excludeAgentlet = true } = options;
    let maxZIndex = 0;
    let maxElement = null;
    const elements = [];
    
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
 * @returns {Object} Suggestion results
 */
export function suggestAgentletZIndexBase() {
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
 * @returns {Object} Analysis results
 */
export function analyzeZIndexDistribution() {
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