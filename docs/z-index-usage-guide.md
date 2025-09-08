# Z-Index Usage Guide - Agentlet Core

## Overview

Agentlets inject UI elements into existing web applications, which means they need to appear above the host application's content. This guide explains how to use the z-index utilities to ensure proper layering.

## Key Concepts

### Backdrop vs Overlay
- **Backdrop**: Semi-transparent background that blocks interactions behind modals/dialogs
- **Overlay**: Any content displayed on top of existing content (may include backdrop + content)

### Architecture
Agentlets use a **relative z-index system** that can adapt to any host application:

```
Host Application (0 - variable)
├── Agentlet Base Layer (base + 1)
├── Backdrops (base + 100-199)
├── Interactions (base + 200-299)
├── UI Components (base + 300-399)
├── Panels (base + 400-499)
├── Dialog Overlays (base + 500-599)
├── Dialogs (base + 600-699)
└── Critical UI (base + 700+)
```

## Quick Start

### 1. Automatic Detection (Recommended)
```javascript
// Let agentlet detect the best z-index base automatically
const suggestion = window.agentlet.utils.zIndex.suggest();
console.log(`Recommended base: ${suggestion.suggestedBase}`);

// Use the suggested constants
const Z = window.agentlet.utils.zIndex.createConstants(suggestion.suggestedBase);
```

### 2. Manual Configuration
```javascript
// For applications you know well, set a specific base
const Z = window.agentlet.utils.zIndex.createConstants(50000);

// Use in your CSS
element.style.zIndex = Z.PANEL; // 50400
element.style.zIndex = Z.DIALOG; // 50600
```

### 3. Analysis Mode
```javascript
// Analyze the current page's z-index usage
const analysis = window.agentlet.utils.zIndex.analyze();
console.log('Z-index distribution:', analysis.ranges);
console.log('Max z-index found:', analysis.summary.maxZIndex);
```

## API Reference

### Detection Functions

#### `window.agentlet.utils.zIndex.detect(options)`
Detects maximum z-index values in the document.

```javascript
const result = window.agentlet.utils.zIndex.detect({
    selector: '*',              // CSS selector scope
    includeComputed: true,      // Include computed styles
    includeInline: true,        // Include inline styles
    excludeRanges: [[100000, 999999]] // Exclude agentlet ranges
});

console.log(`Max z-index: ${result.maxZIndex}`);
console.log(`Found ${result.totalElements} elements with z-index`);
```

#### `window.agentlet.utils.zIndex.suggest(options)`
Suggests appropriate base z-index for agentlets.

```javascript
const suggestion = window.agentlet.utils.zIndex.suggest({
    minBase: 1000,          // Minimum base value
    safetyMargin: 1000,     // Margin above detected max
    defaultBase: 100000     // Default if no z-indexes found
});

console.log(`Strategy: ${suggestion.strategy}`); // 'detected', 'minimum', or 'default'
console.log(`Base: ${suggestion.suggestedBase}`);
console.log('Layer preview:', suggestion.layerPreview);
```

#### `window.agentlet.utils.zIndex.analyze(options)`
Provides detailed analysis of z-index distribution.

```javascript
const analysis = window.agentlet.utils.zIndex.analyze();

// Check distribution by ranges
console.log('Low (1-99):', analysis.ranges.low.count);
console.log('Medium (100-999):', analysis.ranges.medium.count);
console.log('High (1000-9999):', analysis.ranges.high.count);
```

### Constant Functions

#### `window.agentlet.utils.zIndex.createConstants(base)`
Creates z-index constants based on a base value.

```javascript
const Z = window.agentlet.utils.zIndex.createConstants(75000);

// Use the constants
element.style.zIndex = Z.BACKDROP;      // 75100
element.style.zIndex = Z.PANEL;         // 75400
element.style.zIndex = Z.DIALOG;        // 75600
```

#### `window.agentlet.utils.zIndex.constants`
Default constants (base: 100000).

```javascript
const Z = window.agentlet.utils.zIndex.constants;
element.style.zIndex = Z.MESSAGE_BUBBLE; // 100360
```

## Common Patterns

### 1. Safe Agentlet Initialization
```javascript
// Detect and configure appropriate z-indexes
async function initAgentlet() {
    const suggestion = window.agentlet.utils.zIndex.suggest();
    const Z = window.agentlet.utils.zIndex.createConstants(suggestion.suggestedBase);
    
    console.log(`Using z-index base: ${suggestion.suggestedBase} (${suggestion.strategy})`);
    
    // Use Z constants throughout your agentlet
    createPanel(Z);
    createDialogs(Z);
}
```

### 2. Debugging Z-Index Issues
```javascript
// Debug z-index conflicts
function debugZIndexConflicts() {
    const analysis = window.agentlet.utils.zIndex.analyze();
    
    // Show elements in extreme range that might conflict
    console.log('Potential conflicts:', 
        analysis.ranges.extreme.elements
            .filter(el => el.zIndex > 50000)
            .map(el => ({
                element: el.tagName,
                zIndex: el.zIndex,
                className: el.className
            }))
    );
}
```

### 3. Dynamic Z-Index Adjustment
```javascript
// Adjust z-indexes dynamically if conflicts are detected
function ensureAgentletVisibility() {
    const detection = window.agentlet.utils.zIndex.detect({
        excludeRanges: [[100000, 999999]] // Exclude our own ranges
    });
    
    if (detection.maxZIndex > currentAgentletBase) {
        // Recreate constants with higher base
        const newBase = detection.maxZIndex + 10000;
        const Z = window.agentlet.utils.zIndex.createConstants(newBase);
        updateAgentletZIndexes(Z);
    }
}
```

## Best Practices

1. **Always use detection** for production agentlets targeting unknown applications
2. **Use constants** instead of hardcoded values for maintainability
3. **Respect the hierarchy** - don't put tooltips above dialogs
4. **Test on target applications** to ensure no visual conflicts
5. **Leave gaps** between layers for future additions
6. **Document your base choice** when using manual configuration

## Migration from Legacy Values

The framework provides legacy value mappings for migration:

```javascript
// Old hardcoded approach ❌
element.style.zIndex = 1000000;

// New constant-based approach ✅
const Z = window.agentlet.utils.zIndex.constants;
element.style.zIndex = Z.PANEL;
```

Legacy mappings are available in `window.agentlet.utils.zIndex.constants.LEGACY_Z_INDEX` for reference during migration.