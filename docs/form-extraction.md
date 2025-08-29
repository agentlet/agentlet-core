# Form Extraction Documentation

The FormExtractor utility provides comprehensive analysis of DOM elements to extract detailed information about form elements, their structure, styling, and context. This is designed to enable AI-powered form filling by providing rich metadata about form fields.

## Overview

The FormExtractor can analyze any DOM element and extract:
- **Form structure** - All form elements with their hierarchy and relationships
- **Element targeting** - Multiple selector strategies with certainty ratings
- **Visual information** - Bounding boxes, layout, and positioning
- **Context** - Labels, help text, surrounding content, and semantic relationships
- **Validation** - Constraints, validation states, and custom validation
- **Accessibility** - ARIA attributes, labels, and semantic information

## Basic Usage

### Initialize and Extract

```javascript
// The FormExtractor is automatically available through AgentletCore
const formData = window.agentlet.forms.extract(element, options);

// Or access the extractor directly
const extractor = window.agentlet.forms.extractor;
const formData = extractor.extractFormStructure(element, options);
```

### Simple Example

```javascript
// Extract form data from a specific form
const formElement = document.getElementById('my-form');
const formData = window.agentlet.forms.extract(formElement);

console.log(formData);
// {
//   metadata: {...},
//   forms: [{...}],
//   elements: [...],
//   textContent: {...},
//   boundingBox: {...}
// }
```

## Configuration Options

```javascript
const options = {
    includeHidden: false,         // Include hidden form fields
    includeDisabled: false,       // Include disabled form fields  
    includeReadOnly: true,        // Include read-only form fields
    extractText: true,            // Extract surrounding text content
    extractBoundingBoxes: true    // Extract element positioning
};

const formData = window.agentlet.forms.extract(element, options);
```

## Output Structure

### Root Object

```javascript
{
    metadata: {              // Information about the analyzed element
        tagName: "div",
        id: "registration-form",
        className: "form-container",
        classes: ["form-container", "main"],
        attributes: {...},
        selector: "#registration-form",
        url: "https://example.com/register",
        title: "Registration Page"
    },
    
    forms: [{                // Array of complete forms found
        type: "form",
        element: {...},      // Form element details
        elements: [...],     // Form field details
        structure: {...},    // Form organization
        validation: {...}    // Validation information
    }],
    
    elements: [...],         // Standalone form elements (not in <form>)
    
    textContent: {           // Surrounding text content
        fullText: "...",
        innerText: "...",
        headings: [...],
        paragraphs: [...],
        lists: [...]
    },
    
    boundingBox: {           // Visual positioning
        x: 100, y: 200,
        width: 400, height: 600,
        // ... more positioning data
    },
    
    extractedAt: "2024-01-15T10:30:00.000Z",
    config: {...}           // Extraction configuration used
}
```

### Form Element Details

Each form element includes comprehensive information:

```javascript
{
    // Basic identification
    tagName: "input",
    type: "email",
    id: "user-email",
    name: "email",
    className: "form-control required",
    classes: ["form-control", "required"],
    
    // Targeting selectors (sorted by certainty)
    selectors: [
        {
            type: "id",
            selector: "#user-email",
            certainty: 0.95,
            description: "ID selector - highly reliable"
        },
        {
            type: "name", 
            selector: "[name=\"email\"]",
            certainty: 0.85,
            description: "Name attribute - reliable for forms"
        },
        {
            type: "class",
            selector: ".form-control.required",
            certainty: 0.6,
            description: "Class selector - may not be unique"
        }
        // ... more selectors
    ],
    
    // Form attributes
    attributes: {
        type: "email",
        name: "email", 
        required: "true",
        placeholder: "Enter your email",
        autocomplete: "email"
    },
    
    // Current and default values
    value: "user@example.com",
    defaultValue: "",
    placeholder: "Enter your email",
    
    // Validation constraints
    constraints: {
        required: true,
        maxLength: 100
    },
    
    validation: {
        validity: {
            valid: true,
            typeMismatch: false,
            valueMissing: false
            // ... full ValidityState
        },
        validationMessage: "",
        customValidity: true
    },
    
    // Element state
    state: {
        disabled: false,
        readonly: false,
        hidden: false,
        focused: false,
        visible: true,
        interactable: true
    },
    
    // Visual positioning
    boundingBox: {
        x: 150, y: 300,
        width: 300, height: 40,
        centerX: 300, centerY: 320,
        visible: true
    },
    
    // Associated labels and context
    labels: [
        {
            type: "explicit",
            element: labelElement,
            text: "Email Address",
            position: "above"
        }
    ],
    
    context: {
        beforeText: "Please provide your",
        afterText: "We'll never share your email",
        parentText: "Contact Information",
        helpText: [{
            type: "aria-describedby",
            text: "We'll use this to send you notifications"
        }],
        fieldset: {
            legend: "Account Details",
            text: "..."
        }
    },
    
    // Options for select/radio/checkbox
    options: {
        multiple: false,
        options: [
            {
                index: 0,
                value: "option1",
                text: "Option 1",
                selected: false,
                disabled: false
            }
            // ... more options
        ]
    },
    
    // Accessibility information
    accessibility: {
        role: "textbox",
        ariaLabel: "Email address input",
        ariaRequired: "true",
        tabIndex: 0
    }
}
```

## Selector Strategies

The FormExtractor provides multiple targeting strategies, ranked by reliability:

### 1. ID Selector (Certainty: 0.95)
```javascript
{
    type: "id",
    selector: "#email-field",
    certainty: 0.95,
    description: "ID selector - highly reliable"
}
```
**Best for**: Unique identification, highest reliability

### 2. Name Attribute (Certainty: 0.85)
```javascript
{
    type: "name", 
    selector: "[name=\"email\"]",
    certainty: 0.85,
    description: "Name attribute - reliable for forms"
}
```
**Best for**: Form elements, good reliability

### 3. Data Attributes (Certainty: 0.7)
```javascript
{
    type: "data-attribute",
    selector: "[data-field=\"email\"]",
    certainty: 0.7,
    description: "Data attribute selector"
}
```
**Best for**: Custom targeting, moderate reliability

### 4. Class Selectors (Certainty: 0.6)
```javascript
{
    type: "class",
    selector: ".email-input.required",
    certainty: 0.6,
    description: "Class selector - may not be unique"
}
```
**Best for**: Styling-based targeting, lower reliability

### 5. XPath (Certainty: 0.5)
```javascript
{
    type: "xpath",
    selector: "./div[2]/input[1]",
    certainty: 0.5,
    description: "XPath selector"
}
```
**Best for**: Complex targeting, fragile

### 6. Relative Path (Certainty: 0.4)
```javascript
{
    type: "relative-path",
    selector: "div:nth-child(2) > input:nth-child(1)",
    certainty: 0.4,
    description: "Position-based selector - fragile"
}
```
**Best for**: Last resort, very fragile

## Usage Examples

### Extract Specific Form

```javascript
// Target a specific form by ID
const formElement = document.getElementById('registration-form');
const formData = window.agentlet.forms.extract(formElement, {
    includeHidden: true,
    extractBoundingBoxes: true
});

// Access form elements
formData.forms[0].elements.forEach(element => {
    console.log(`${element.type}: ${element.name} - ${element.labels[0]?.text}`);
});
```

### Find All Forms on Page

```javascript
// Extract from entire page
const pageData = window.agentlet.forms.extract(document.body);

// Process all forms
pageData.forms.forEach((form, index) => {
    console.log(`Form ${index + 1}:`);
    console.log(`- Action: ${form.element.attributes.action}`);
    console.log(`- Elements: ${form.elements.length}`);
    
    // Show required fields
    const requiredFields = form.elements.filter(el => el.constraints.required);
    console.log(`- Required fields: ${requiredFields.map(f => f.name).join(', ')}`);
});
```

### Target Elements for AI Filling

```javascript
function fillFormWithAI(formData, values) {
    for (const form of formData.forms) {
        for (const element of form.elements) {
            const fieldName = element.name;
            if (values[fieldName] !== undefined) {
                // Get the best selector (highest certainty)
                const bestSelector = element.selectors[0];
                const domElement = document.querySelector(bestSelector.selector);
                
                if (domElement && element.state.interactable) {
                    // Fill the field based on its type
                    fillField(domElement, element.type, values[fieldName]);
                }
            }
        }
    }
}

function fillField(domElement, type, value) {
    switch (type) {
        case 'text':
        case 'email':
        case 'password':
        case 'tel':
        case 'url':
            domElement.value = value;
            domElement.dispatchEvent(new Event('input', { bubbles: true }));
            break;
            
        case 'checkbox':
            domElement.checked = Boolean(value);
            domElement.dispatchEvent(new Event('change', { bubbles: true }));
            break;
            
        case 'radio':
            if (domElement.value === value) {
                domElement.checked = true;
                domElement.dispatchEvent(new Event('change', { bubbles: true }));
            }
            break;
            
        case 'select':
            domElement.value = value;
            domElement.dispatchEvent(new Event('change', { bubbles: true }));
            break;
            
        case 'textarea':
            domElement.value = value;
            domElement.dispatchEvent(new Event('input', { bubbles: true }));
            break;
    }
}

// Usage
const formData = window.agentlet.forms.extract(document.getElementById('my-form'));
const aiValues = {
    'firstName': 'John',
    'lastName': 'Doe', 
    'email': 'john.doe@example.com',
    'accountType': 'personal',
    'notifications': ['email', 'sms']
};

fillFormWithAI(formData, aiValues);
```

### Analyze Form Complexity

```javascript
function analyzeFormComplexity(formData) {
    const analysis = {
        totalElements: 0,
        requiredFields: 0,
        optionalFields: 0,
        fieldTypes: {},
        validationRules: 0,
        hasFileUpload: false,
        hasComplexFields: false
    };
    
    for (const form of formData.forms) {
        analysis.totalElements += form.elements.length;
        
        for (const element of form.elements) {
            // Count by requirement
            if (element.constraints.required) {
                analysis.requiredFields++;
            } else {
                analysis.optionalFields++;
            }
            
            // Count by type
            analysis.fieldTypes[element.type] = (analysis.fieldTypes[element.type] || 0) + 1;
            
            // Count validation rules
            analysis.validationRules += Object.keys(element.constraints).length;
            
            // Check for complex field types
            if (['file', 'date', 'datetime-local', 'range'].includes(element.type)) {
                analysis.hasComplexFields = true;
            }
            
            if (element.type === 'file') {
                analysis.hasFileUpload = true;
            }
        }
    }
    
    return analysis;
}

// Usage
const formData = window.agentlet.forms.extract(document.body);
const complexity = analyzeFormComplexity(formData);
console.log('Form complexity analysis:', complexity);
```

## Advanced Features

### Bounding Box Analysis

```javascript
// Extract with bounding boxes for visual analysis
const formData = window.agentlet.forms.extract(element, {
    extractBoundingBoxes: true
});

// Find elements in viewport
const visibleElements = formData.forms[0].elements.filter(el => 
    el.boundingBox && el.boundingBox.visible
);

// Sort by position (top to bottom, left to right)
visibleElements.sort((a, b) => {
    const aBox = a.boundingBox;
    const bBox = b.boundingBox;
    
    if (Math.abs(aBox.y - bBox.y) < 10) { // Same row
        return aBox.x - bBox.x; // Left to right
    }
    return aBox.y - bBox.y; // Top to bottom
});
```

### Context-Aware Field Identification

```javascript
function identifyFieldPurpose(element) {
    const name = element.name?.toLowerCase() || '';
    const labels = element.labels.map(l => l.text.toLowerCase()).join(' ');
    const placeholder = element.placeholder?.toLowerCase() || '';
    const context = `${name} ${labels} ${placeholder}`;
    
    // Common field patterns
    if (/email|e-mail/.test(context)) return 'email';
    if (/first.*name|given.*name/.test(context)) return 'firstName';
    if (/last.*name|family.*name|surname/.test(context)) return 'lastName';
    if (/phone|tel|mobile/.test(context)) return 'phone';
    if (/address.*line.*1|street/.test(context)) return 'addressLine1';
    if (/address.*line.*2|apt|suite|unit/.test(context)) return 'addressLine2';
    if (/city|town/.test(context)) return 'city';
    if (/state|province|region/.test(context)) return 'state';
    if (/zip|postal.*code/.test(context)) return 'zipCode';
    if (/country/.test(context)) return 'country';
    if (/birth.*date|dob/.test(context)) return 'birthDate';
    if (/password|pwd/.test(context)) return 'password';
    if (/username|user.*name/.test(context)) return 'username';
    
    return 'unknown';
}

// Usage
const formData = window.agentlet.forms.extract(formElement);
const fieldMapping = {};

formData.forms[0].elements.forEach(element => {
    const purpose = identifyFieldPurpose(element);
    fieldMapping[purpose] = element.selectors[0].selector;
});

console.log('Field mapping:', fieldMapping);
// { email: "#email", firstName: "#first-name", ... }
```

## Error Handling

```javascript
try {
    const formData = window.agentlet.forms.extract(element, options);
    
    // Check if extraction was successful
    if (!formData || (!formData.forms.length && !formData.elements.length)) {
        console.warn('No form elements found in the specified element');
        return;
    }
    
    // Process form data...
    
} catch (error) {
    console.error('Form extraction failed:', error);
    
    // Fallback to basic form detection
    const forms = element.querySelectorAll('form');
    const inputs = element.querySelectorAll('input, select, textarea');
    
    console.log(`Fallback found: ${forms.length} forms, ${inputs.length} inputs`);
}
```

## Performance Considerations

```javascript
// For large pages, consider limiting scope
const container = document.getElementById('main-content');
const formData = window.agentlet.forms.extract(container, {
    extractBoundingBoxes: false, // Disable if not needed
    extractText: false           // Disable if not needed
});

// Or extract specific forms only
const targetForm = document.querySelector('form[data-form="registration"]');
if (targetForm) {
    const formData = window.agentlet.forms.extract(targetForm);
}
```

## Integration with AI Systems

The extracted form data is designed to be easily consumed by AI systems for form filling:

```javascript
// Convert to AI-friendly format
function prepareForAI(formData) {
    const fields = [];
    
    for (const form of formData.forms) {
        for (const element of form.elements) {
            if (element.state.interactable && element.type !== 'submit') {
                fields.push({
                    selector: element.selectors[0].selector,
                    type: element.type,
                    name: element.name,
                    label: element.labels.map(l => l.text).join(' '),
                    placeholder: element.placeholder,
                    required: element.constraints.required || false,
                    options: element.options?.options?.map(opt => ({
                        value: opt.value,
                        text: opt.text
                    })) || null,
                    context: element.context.helpText?.map(h => h.text).join(' ') || '',
                    currentValue: element.value
                });
            }
        }
    }
    
    return fields;
}

// Usage with AI
const formData = window.agentlet.forms.extract(document.body);
const aiReadyData = prepareForAI(formData);

// Send to AI service
const filledValues = await aiFormFiller.fillForm(aiReadyData, userProfile);

// Apply filled values
fillFormWithAI(formData, filledValues);
```

This comprehensive form extraction system provides everything needed for AI-powered form automation while maintaining reliability and providing fallback strategies for robust operation.