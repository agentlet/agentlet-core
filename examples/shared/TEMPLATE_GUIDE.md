# 📋 Example Template Guide

This guide explains how to use the **Level 1 - Minimal Template** system for creating consistent Agentlet examples while preserving flexibility.

## 🎯 Goals

- **Standardize** common elements: console, status, breadcrumbs, layout
- **Preserve** existing functionality and unique features
- **Simplify** development by reducing boilerplate code
- **Improve** consistency across all examples

## 📁 Template Files

- `examples/shared/example-template.html` - Base HTML template with slots
- `examples/shared/example-builder.js` - JavaScript builder for dynamic generation
- `examples/shared/console-utils.js` - Enhanced with standard initialization helper

## 🚀 Quick Start - Using the Template

### Method 1: Enhanced Console Utils (Recommended for Simple Examples)

For simple examples that just need standard initialization:

```html
<!-- Existing example structure preserved -->
<button onclick="initializeExample()" id="initBtn">🚀 Initialize Agentlet</button>

<script>
// Use the new standardized initialization helper
async function initializeExample() {
    await initializeAgentletExample({
        onAfterInit: async (agentlet) => {
            // Your custom logic after Agentlet loads
            log('Custom example logic here!');
        }
    });
}
</script>
```

### Method 2: Template Builder (For New Examples)

For new examples or major refactors:

```javascript
const builder = new ExampleBuilder({
    title: 'My New Example - Agentlet Core',
    category: '01-basics',
    name: 'my-example',
    defaultStatus: 'Click initialize to start demo.'
});

const mainContent = [
    {
        type: 'description',
        content: 'This example demonstrates...'
    },
    {
        type: 'features',
        items: [
            'Feature 1 explanation',
            'Feature 2 explanation'
        ]
    },
    {
        type: 'controls',
        title: 'Demo Controls',
        buttons: [
            { id: 'initBtn', text: '🚀 Initialize', onclick: 'initDemo()' },
            { id: 'testBtn', text: '🧪 Test Feature', onclick: 'testFeature()' }
        ]
    }
];

const html = builder.build(mainContent, [], customScript);
```

## 🔄 Migration Strategies

### Strategy 1: Minimal Migration (Preserve All Existing Code)

**Best for**: Working examples that just need consistency improvements

1. Keep existing HTML structure
2. Replace initialization code with `initializeAgentletExample()`
3. Ensure console elements have standard IDs (`#console`, `#status`, etc.)

**Example Migration**:
```javascript
// Before
async function initAgentlet() {
    // 50+ lines of custom initialization code
}

// After
async function initAgentlet() {
    await initializeAgentletExample({
        onAfterInit: async (agentlet) => {
            // Only your example-specific logic here
        }
    });
}
```

### Strategy 2: Template Conversion (For Major Updates)

**Best for**: Examples that need significant updates or new examples

1. Use `ExampleBuilder` to generate new HTML
2. Port existing functionality to template structure
3. Test to ensure no functionality lost

## 📖 Template Structure Reference

### Standard Elements (Automatically Included)

All examples get these elements standardized:

```html
<!-- Breadcrumb navigation -->
<div class="nav-breadcrumb">
    <a href="../../">Examples</a> → <a href="../">01-basics</a> → example-name
</div>

<!-- Console output -->
<div class="console-section" id="console"></div>

<!-- Status display -->
<div class="status-section" id="status">
    Ready for initialization
</div>

<!-- Statistics -->
<div class="stats-section" id="stats">
    <div>Messages logged: <span id="messageCount">0</span></div>
    <div>Errors: <span id="errorCount">0</span></div>
    <div>Warnings: <span id="warningCount">0</span></div>
    <div>Last action: <span id="lastAction">None</span></div>
</div>
```

### Content Types

The template supports these content section types:

- `description` - Simple text description
- `features` - Bulleted "What this example shows" list
- `controls` - Button groups with consistent styling
- `api-reference` - Code blocks with syntax highlighting
- `info-section` - Custom content sections
- `html` - Raw HTML for complex custom content

## 🧪 Testing Your Template Usage

1. **Preserve existing functionality** - All buttons and features should work the same
2. **Check console consistency** - Output should appear in standard console area
3. **Verify styling** - Should match other examples in the same category
4. **Test initialization** - Should use standard loading states and error handling

## 🔧 Advanced Customization

### Custom Initialization Logic

```javascript
await initializeAgentletExample({
    config: { debugMode: false, customOption: true },
    onBeforeInit: async () => {
        log('Custom pre-initialization setup');
    },
    onAfterInit: async (agentlet) => {
        log('Custom post-initialization logic');
        // Register custom modules, set up event listeners, etc.
    },
    onError: (error) => {
        // Custom error handling
        updateStatus('Custom error message', 'error');
    }
});
```

### Additional Head Elements

```javascript
const builder = new ExampleBuilder({
    additionalHead: `
        <!-- Prism.js for syntax highlighting -->
        <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
    `
});
```

## 📋 Migration Checklist

- [ ] Console output appears in `#console` element
- [ ] Status updates appear in `#status` element
- [ ] Statistics update automatically (`#messageCount`, `#errorCount`, etc.)
- [ ] Breadcrumb navigation works correctly
- [ ] Initialize button uses standard loading states
- [ ] Error handling shows consistent messages
- [ ] All existing functionality preserved
- [ ] Styling consistent with other examples

## 🔄 Backwards Compatibility

**100% backwards compatible** - Existing examples continue to work without changes. The template system is purely additive and optional.

- Old initialization patterns still work
- Existing HTML structure preserved
- Custom CSS and JavaScript maintained
- No breaking changes to any APIs

## 📝 Example Conversions

See these examples for reference:

- `examples/01-basics/hello-world-templated.html` - Conversion using enhanced console utils
- `examples/01-basics/template-demo.html` - New example using template builder

Both preserve all functionality while gaining consistency benefits.