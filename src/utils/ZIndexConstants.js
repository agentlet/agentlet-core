/**
 * Z-Index Constants for Agentlet Core
 * 
 * Defines a clear hierarchy for z-index values across the framework.
 * This ensures proper layering and prevents conflicts between components.
 * 
 * Hierarchy (lowest to highest):
 * - Base elements (1-99)
 * - Background/Backdrop elements (100-199) 
 * - Interactive highlights (200-299)
 * - UI Components (300-399)
 * - Main UI panels (400-499)
 * - Modal overlays (500-599)
 * - Dialogs (600-699)
 * - Critical overlays (700+)
 */

// Default base value - can be overridden via configuration
const DEFAULT_AGENTLET_Z_BASE = 100000;

/**
 * Generate Z-Index constants based on a configurable base value
 * @param {number} base - Base z-index value (default: 100000)
 * @returns {Object} Z-index constants
 */
export function createZIndexConstants(base = DEFAULT_AGENTLET_Z_BASE) {
    return {
        // Base agentlet layer (base + 1 to base + 99)
        BASE: base + 1,
        INPUT: base + 2,
        BUTTON: base + 3,
        
        // Background and backdrop elements (base + 100 to base + 199)
        BACKDROP: base + 100,
        SELECTION_BACKDROP: base + 120,
        HIGHLIGHT_BACKDROP: base + 140,
        MODAL_BACKDROP: base + 160,
        
        // Interactive highlights and selections (base + 200 to base + 299)
        HOVER_HIGHLIGHT: base + 200,
        ELEMENT_HIGHLIGHT: base + 220,
        SELECTION_HIGHLIGHT: base + 240,
        ACTIVE_SELECTION: base + 260,
        
        // UI Components and tooltips (base + 300 to base + 399)
        TOOLTIP: base + 300,
        INFO_TOOLTIP: base + 320,
        ELEMENT_INFO: base + 340,
        MESSAGE_BUBBLE: base + 360,
        NOTIFICATION: base + 380,
        
        // Main UI panels and containers (base + 400 to base + 499)
        PANEL: base + 400,
        PANEL_CONTENT: base + 420,
        PANEL_HEADER: base + 440,
        PANEL_TABS: base + 460,
        
        // Dialog overlays (base + 500 to base + 599)
        DIALOG_OVERLAY: base + 500,
        
        // Dialogs and modals (base + 600 to base + 699)
        DIALOG: base + 600,
        INFO_DIALOG: base + 620,
        INPUT_DIALOG: base + 640,
        PROGRESS_DIALOG: base + 660,
        FULLSCREEN_DIALOG: base + 680,
        
        // Critical overlays and system UI (base + 700+)
        CRITICAL_OVERLAY: base + 700,
        SYSTEM_NOTIFICATION: base + 720,
        ERROR_OVERLAY: base + 740,
        LOADING_OVERLAY: base + 760,
        IMAGE_OVERLAY: base + 780
    };
}

// Default constants using the default base
export const Z_INDEX = createZIndexConstants();

// Legacy values for reference during migration
export const LEGACY_Z_INDEX = {
    OLD_PANEL: 1000000,
    OLD_PANEL_MINIMIZED: 999999,
    OLD_PANEL_HEADER: 1000001,
    OLD_PANEL_TABS: 1000002,
    OLD_DIALOG_OVERLAY: 1000002,
    OLD_DIALOG: 1000003,
    OLD_HIGHLIGHT_BACKDROP: 999996,
    OLD_HIGHLIGHT_OVERLAY: 999997,
    OLD_HIGHLIGHT_BORDER: 999998,
    OLD_HOVER_HIGHLIGHT: 999999,
    OLD_MESSAGE_BUBBLE: 1000000
};

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

export default Z_INDEX;