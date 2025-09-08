/**
 * Z-Index Detection Utility for Agentlet Core
 * 
 * Provides functions to detect existing z-index values in the host application
 * and determine appropriate base values for agentlet layering.
 */

/**
 * Detect the maximum z-index value currently used in the document
 * @param {Object} options - Detection options
 * @param {string} options.selector - CSS selector to limit search scope (default: '*')
 * @param {boolean} options.includeComputed - Include computed styles (default: true)
 * @param {boolean} options.includeInline - Include inline styles (default: true)
 * @param {number[]} options.excludeRanges - Z-index ranges to exclude from detection
 * @returns {Object} Detection results
 */
export function detectMaxZIndex(options = {}) {
    const {
        selector = '*',
        includeComputed = true,
        includeInline = true,
        excludeRanges = []
    } = options;

    let maxZIndex = 0;
    let maxElement = null;
    const zIndexMap = [];
    
    try {
        const elements = document.querySelectorAll(selector);
        
        elements.forEach(element => {
            let zIndex = 0;
            let source = 'none';
            
            // Check inline styles first
            if (includeInline && element.style.zIndex) {
                zIndex = parseInt(element.style.zIndex, 10);
                source = 'inline';
            }
            
            // Check computed styles if no inline style or if requested
            if (includeComputed && (!zIndex || zIndex === 0)) {
                const computed = window.getComputedStyle(element);
                const computedZIndex = parseInt(computed.zIndex, 10);
                if (!isNaN(computedZIndex) && computedZIndex > 0) {
                    zIndex = computedZIndex;
                    source = 'computed';
                }
            }
            
            // Skip invalid values and excluded ranges
            if (isNaN(zIndex) || zIndex <= 0) return;
            
            const isExcluded = excludeRanges.some(([min, max]) => 
                zIndex >= min && zIndex <= max
            );
            if (isExcluded) return;
            
            // Track this z-index
            zIndexMap.push({
                element,
                zIndex,
                source,
                tagName: element.tagName,
                className: element.className,
                id: element.id
            });
            
            // Update maximum
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
        totalElements: zIndexMap.length,
        zIndexMap: zIndexMap.sort((a, b) => b.zIndex - a.zIndex)
    };
}

/**
 * Suggest an appropriate base z-index for agentlets
 * @param {Object} options - Suggestion options
 * @param {number} options.minBase - Minimum base value (default: 1000)
 * @param {number} options.safetyMargin - Safety margin above detected max (default: 1000)
 * @param {number} options.defaultBase - Default base if no z-indexes found (default: 100000)
 * @returns {Object} Suggestion results
 */
export function suggestAgentletZIndexBase(options = {}) {
    const {
        minBase = 1000,
        safetyMargin = 1000,
        defaultBase = 100000
    } = options;
    
    // Exclude our own agentlet ranges from detection
    const excludeRanges = [
        [100000, 999999], // Common agentlet ranges
        [1000000, 1999999] // High agentlet ranges
    ];
    
    const detection = detectMaxZIndex({ excludeRanges });
    
    let suggestedBase;
    let strategy;
    
    if (detection.maxZIndex === 0) {
        // No z-indexes found, use default
        suggestedBase = defaultBase;
        strategy = 'default';
    } else if (detection.maxZIndex < minBase) {
        // Max is below our minimum, use minimum
        suggestedBase = minBase;
        strategy = 'minimum';
    } else {
        // Use detected max + safety margin
        suggestedBase = detection.maxZIndex + safetyMargin;
        strategy = 'detected';
    }
    
    return {
        suggestedBase,
        strategy,
        detection,
        layerPreview: generateLayerPreview(suggestedBase)
    };
}

/**
 * Generate a preview of agentlet layers based on a base z-index
 * @param {number} base - Base z-index value
 * @returns {Object} Layer preview
 */
function generateLayerPreview(base) {
    return {
        BASE: base + 1,
        BACKDROP: base + 10,
        HOVER: base + 100,
        SELECTION: base + 120,
        HIGHLIGHT: base + 140,
        TOOLTIP: base + 200,
        MESSAGE: base + 220,
        PANEL: base + 300,
        PANEL_HEADER: base + 320,
        PANEL_TABS: base + 340,
        MODAL_BACKDROP: base + 400,
        DIALOG: base + 500,
        FULLSCREEN: base + 520,
        CRITICAL: base + 600,
        ERROR: base + 700
    };
}

/**
 * Analyze z-index distribution in the current document
 * @param {Object} options - Analysis options
 * @returns {Object} Analysis results
 */
export function analyzeZIndexDistribution(options = {}) {
    const detection = detectMaxZIndex(options);
    
    const ranges = {
        low: { min: 1, max: 99, count: 0, elements: [] },
        medium: { min: 100, max: 999, count: 0, elements: [] },
        high: { min: 1000, max: 9999, count: 0, elements: [] },
        veryHigh: { min: 10000, max: 99999, count: 0, elements: [] },
        extreme: { min: 100000, max: Infinity, count: 0, elements: [] }
    };
    
    detection.zIndexMap.forEach(item => {
        const { zIndex } = item;
        
        if (zIndex >= ranges.low.min && zIndex <= ranges.low.max) {
            ranges.low.count++;
            ranges.low.elements.push(item);
        } else if (zIndex >= ranges.medium.min && zIndex <= ranges.medium.max) {
            ranges.medium.count++;
            ranges.medium.elements.push(item);
        } else if (zIndex >= ranges.high.min && zIndex <= ranges.high.max) {
            ranges.high.count++;
            ranges.high.elements.push(item);
        } else if (zIndex >= ranges.veryHigh.min && zIndex <= ranges.veryHigh.max) {
            ranges.veryHigh.count++;
            ranges.veryHigh.elements.push(item);
        } else {
            ranges.extreme.count++;
            ranges.extreme.elements.push(item);
        }
    });
    
    return {
        detection,
        ranges,
        summary: {
            totalElements: detection.totalElements,
            maxZIndex: detection.maxZIndex,
            recommendedBase: suggestAgentletZIndexBase().suggestedBase
        }
    };
}

export default {
    detectMaxZIndex,
    suggestAgentletZIndexBase,
    analyzeZIndexDistribution
};