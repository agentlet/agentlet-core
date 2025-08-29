# AI-Ready Forms API

The AgentletCore now includes optimized form export functions that provide clean, structured data with only the best selectors - perfect for AI form filling systems.

## Quick Start

```javascript
// Initialize AgentletCore (or use standalone FormExtractor)
const agentlet = new AgentletCore();
await agentlet.init();

// Quick export - simple array of fields
const fields = window.agentlet.forms.quickExport(document.getElementById('my-form'));

// AI export - structured object with options
const formData = window.agentlet.forms.exportForAI(document.body, {
    includeBoundingBoxes: true,
    includeContext: true
});
```

## API Functions

### 1. `quickExport(element)` - Simple Array

**Best for:** Basic AI form filling, simple automation

```javascript
const fields = window.agentlet.forms.quickExport(formElement);

// Returns array of:
[
    {
        selector: "#firstName",        // Best selector only
        type: "text",
        name: "firstName", 
        label: "First Name",
        value: "John",
        required: true,
        options: null                  // For select/radio/checkbox only
    },
    {
        selector: "#country",
        type: "select",
        name: "country",
        label: "Country",
        value: "us",
        required: true,
        options: [                     // All select options
            {value: "us", text: "United States", selected: true},
            {value: "ca", text: "Canada", selected: false}
        ]
    }
]
```

### 2. `exportForAI(element, options)` - Structured Object

**Best for:** Advanced AI processing, complex automation

```javascript
const formData = window.agentlet.forms.exportForAI(element, {
    includeHidden: false,           // Include hidden fields
    includeDisabled: false,         // Include disabled fields
    includeReadOnly: true,          // Include read-only fields
    includeBoundingBoxes: false,    // Include visual positioning
    includeContext: true,           // Include help text/context
    groupByForm: true              // Group elements by form
});

// Returns structured object:
{
    metadata: {
        url: "https://example.com/register",
        title: "Registration Page",
        extractedAt: "2024-01-15T10:30:00.000Z",
        totalForms: 1,
        totalElements: 8
    },
    forms: [
        {
            id: "registration-form",
            name: "register",
            action: "/register",
            method: "post",
            selector: "#registration-form",
            elements: [
                {
                    type: "text",
                    id: "firstName",
                    name: "firstName",
                    selector: "#firstName",      // Best selector only
                    selectorType: "id",
                    certainty: 95,               // Confidence percentage
                    label: "First Name",
                    placeholder: "Enter your first name",
                    value: "John",
                    required: true,
                    disabled: false,
                    visible: true,
                    interactable: true,
                    
                    // Optional extras based on options
                    constraints: {minLength: 2, maxLength: 50},
                    context: {helpText: "Your legal first name"},
                    position: {x: 20, y: 100, width: 300, height: 35}
                }
            ]
        }
    ],
    standaloneElements: []  // Elements not in <form> tags
}
```

### 3. `extract(element, options)` - Complete Data

**Best for:** Debugging, analysis, comprehensive data needs

```javascript
const fullData = window.agentlet.forms.extract(element, options);
// Returns the complete extraction with all selectors, validation states, etc.
```

## Select Options Format

All select elements include complete option data:

```javascript
{
    type: "select",
    selector: "#country",
    options: {
        multiple: false,
        choices: [
            {
                value: "us",
                text: "United States", 
                selected: true,
                disabled: false,
                group: null            // Optgroup label if grouped
            },
            {
                value: "ca",
                text: "Canada",
                selected: false,
                disabled: false,
                group: null
            }
        ]
    }
}
```

## Radio/Checkbox Groups

Related radio buttons and checkboxes are automatically grouped:

```javascript
{
    type: "radio",
    selector: "[name='frequency']",
    options: {
        group: [
            {value: "daily", checked: false, label: "Daily"},
            {value: "weekly", checked: true, label: "Weekly"},
            {value: "monthly", checked: false, label: "Monthly"}
        ]
    }
}
```

## Usage Examples

### Basic AI Form Filling

```javascript
async function fillFormWithAI(formElement, userData) {
    // Get clean field data
    const fields = window.agentlet.forms.quickExport(formElement);
    
    // Fill each field
    for (const field of fields) {
        if (field.interactable && userData[field.name]) {
            const element = document.querySelector(field.selector);
            
            if (element) {
                switch (field.type) {
                    case 'text':
                    case 'email':
                    case 'password':
                        element.value = userData[field.name];
                        element.dispatchEvent(new Event('input', {bubbles: true}));
                        break;
                        
                    case 'select':
                        element.value = userData[field.name];
                        element.dispatchEvent(new Event('change', {bubbles: true}));
                        break;
                        
                    case 'checkbox':
                        element.checked = Boolean(userData[field.name]);
                        element.dispatchEvent(new Event('change', {bubbles: true}));
                        break;
                }
            }
        }
    }
}

// Usage
const userData = {
    firstName: 'John',
    email: 'john@example.com',
    country: 'us'
};

fillFormWithAI(document.getElementById('my-form'), userData);
```

### Advanced AI Processing

```javascript
function analyzeFormForAI(element) {
    const formData = window.agentlet.forms.exportForAI(element, {
        includeContext: true,
        includeBoundingBoxes: true
    });
    
    // Analyze form complexity
    const analysis = {
        difficulty: 'easy',
        requiredFields: [],
        optionalFields: [],
        selectFields: [],
        needsValidation: false
    };
    
    formData.forms.forEach(form => {
        form.elements.forEach(field => {
            if (field.required) {
                analysis.requiredFields.push(field.name);
            } else {
                analysis.optionalFields.push(field.name);
            }
            
            if (field.type === 'select') {
                analysis.selectFields.push({
                    name: field.name,
                    options: field.options.choices.map(opt => opt.value)
                });
            }
            
            if (field.constraints && Object.keys(field.constraints).length > 0) {
                analysis.needsValidation = true;
            }
        });
    });
    
    // Determine difficulty
    const totalFields = analysis.requiredFields.length + analysis.optionalFields.length;
    if (totalFields > 10 || analysis.needsValidation) {
        analysis.difficulty = 'hard';
    } else if (totalFields > 5 || analysis.selectFields.length > 2) {
        analysis.difficulty = 'medium';
    }
    
    return analysis;
}
```

### Intelligent Field Mapping

```javascript
function mapFieldsToUserData(fields) {
    const mapping = {};
    
    fields.forEach(field => {
        const name = field.name.toLowerCase();
        const label = (field.label || '').toLowerCase();
        const context = `${name} ${label}`;
        
        // Smart field type detection
        if (/email|e-mail/.test(context)) {
            mapping.email = field.selector;
        } else if (/first.*name|given.*name/.test(context)) {
            mapping.firstName = field.selector;
        } else if (/last.*name|family.*name|surname/.test(context)) {
            mapping.lastName = field.selector;
        } else if (/phone|tel|mobile/.test(context)) {
            mapping.phone = field.selector;
        } else if (/address.*line.*1|street/.test(context)) {
            mapping.address1 = field.selector;
        } else if (/city|town/.test(context)) {
            mapping.city = field.selector;
        } else if (/state|province/.test(context)) {
            mapping.state = field.selector;
        } else if (/zip|postal.*code/.test(context)) {
            mapping.zipCode = field.selector;
        } else if (/country/.test(context)) {
            mapping.country = field.selector;
        }
    });
    
    return mapping;
}

// Usage
const fields = window.agentlet.forms.quickExport(document.body);
const fieldMap = mapFieldsToUserData(fields);

// Auto-fill based on mapping
const userData = {
    firstName: 'John',
    lastName: 'Doe', 
    email: 'john@example.com',
    country: 'us'
};

Object.entries(fieldMap).forEach(([dataKey, selector]) => {
    if (userData[dataKey]) {
        document.querySelector(selector).value = userData[dataKey];
    }
});
```

## Error Handling

```javascript
try {
    const fields = window.agentlet.forms.quickExport(formElement);
    
    if (fields.length === 0) {
        console.warn('No interactable form fields found');
        return;
    }
    
    // Process fields...
    
} catch (error) {
    console.error('Form export failed:', error);
    
    // Fallback to basic form detection
    const inputs = formElement.querySelectorAll('input, select, textarea');
    console.log(`Fallback: found ${inputs.length} form elements`);
}
```

## Integration with AI Services

```javascript
async function sendToAIService(formElement) {
    // Export clean form data
    const formData = window.agentlet.forms.exportForAI(formElement, {
        includeContext: true
    });
    
    // Send to AI service
    const response = await fetch('/ai/fill-form', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            formStructure: formData,
            userProfile: getCurrentUserProfile(),
            fillPreferences: {
                skipOptional: false,
                validateInputs: true
            }
        })
    });
    
    const filledData = await response.json();
    
    // Apply AI-generated values
    applyFormValues(formData, filledData.values);
}

function applyFormValues(formData, values) {
    formData.forms.forEach(form => {
        form.elements.forEach(element => {
            if (values[element.name] && element.interactable) {
                const domElement = document.querySelector(element.selector);
                if (domElement) {
                    fillElementValue(domElement, element.type, values[element.name]);
                }
            }
        });
    });
}
```

The AI-Ready Forms API provides everything needed for sophisticated form automation while maintaining simplicity for basic use cases. The clean data structure with reliable selectors makes it perfect for AI-powered form filling systems! 🤖