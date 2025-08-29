# Form Filling API

The AgentletCore FormFiller provides safe, context-aware form filling that operates within specific parent elements to prevent collisions and ensure accurate targeting.

## Key Features

✅ **Context-Aware** - All selectors are scoped to a parent element  
✅ **Type-Safe** - Handles all form element types correctly  
✅ **Event Triggering** - Automatically triggers change/input events  
✅ **Validation** - Optional value validation before filling  
✅ **Error Handling** - Comprehensive error reporting  
✅ **Retry Logic** - Built-in retry mechanisms  
✅ **AI Integration** - Direct integration with AI-exported form data  

## API Functions

### 1. `fill(parentElement, selectorValues, options)`

**Basic form filling with selector/value pairs**

```javascript
const result = window.agentlet.forms.fill(parentElement, selectorValues, options);
```

**Parameters:**
- `parentElement` (Element) - Parent element to scope selectors to
- `selectorValues` (Object|Array) - Selectors and their values
- `options` (Object) - Filling options

**Selector Formats:**

```javascript
// Object format: {selector: value}
const selectorValues = {
    '#name': 'John Doe',
    '#email': 'john@example.com',
    '[name="country"]': 'us',
    '.checkbox-newsletter': true
};

// Array format: [{selector, value, type?, options?}]
const selectorValues = [
    { selector: '#name', value: 'John Doe' },
    { selector: '#email', value: 'john@example.com' },
    { selector: '#country', value: 'us', type: 'select' },
    { selector: '#newsletter', value: true, type: 'checkbox' }
];
```

### 2. `fillFromAI(parentElement, aiFormData, userValues, options)`

**Smart filling using AI-exported form data**

```javascript
const aiFormData = window.agentlet.forms.exportForAI(document.body);
const result = window.agentlet.forms.fillFromAI(parentElement, aiFormData, userValues, options);
```

**Parameters:**
- `parentElement` (Element) - Parent element scope
- `aiFormData` (Object) - Data from `exportForAI()`
- `userValues` (Object) - User data to fill `{fieldName: value}`
- `options` (Object) - Filling options

### 3. `fillMultiple(parentElement, formDataArray, options)`

**Fill multiple form sets with retry logic**

```javascript
const result = await window.agentlet.forms.fillMultiple(parentElement, formDataArray, options);
```

## Options

```javascript
const options = {
    triggerEvents: true,        // Trigger change/input events
    validateValues: true,       // Validate values before filling
    skipDisabled: true,         // Skip disabled elements
    skipReadonly: true,         // Skip readonly elements  
    skipHidden: true,           // Skip hidden elements
    waitForElement: 0,          // Wait time (ms) for elements to appear
    retryAttempts: 1,           // Number of retry attempts
    debugMode: false,           // Enable debug logging
    
    // Callbacks
    onSuccess: (result) => {},  // Called on successful fill
    onError: (result) => {},    // Called on fill error
    onSkipped: (result) => {}   // Called when element skipped
};
```

## Element Type Support

### Text Inputs
```javascript
// text, password, email, url, tel, search, number, hidden
window.agentlet.forms.fill(form, {
    '#name': 'John Doe',
    '#email': 'john@example.com',
    '#phone': '+1-555-123-4567',
    '#website': 'https://example.com'
});
```

### Select Elements
```javascript
// Single and multiple selects
window.agentlet.forms.fill(form, {
    '#country': 'us',              // Single select
    '#skills': ['js', 'python']    // Multiple select (if supported)
});
```

### Checkboxes
```javascript
// Boolean values or string matching
window.agentlet.forms.fill(form, {
    '#newsletter': true,           // Check the box
    '#terms': 'yes',              // Also checks (truthy string)
    '#marketing': false           // Uncheck the box
});
```

### Radio Buttons
```javascript
// Match by value or check specific radio
window.agentlet.forms.fill(form, {
    '[name="size"][value="large"]': true,  // Select specific radio
    '[name="color"]': 'blue'               // Select radio with value="blue"
});
```

### Textareas
```javascript
window.agentlet.forms.fill(form, {
    '#message': 'This is a long message\nwith multiple lines.'
});
```

### Date/Time Inputs
```javascript
window.agentlet.forms.fill(form, {
    '#birthday': '1990-05-15',           // date
    '#appointment': '2024-01-15T14:30',  // datetime-local
    '#meeting': '14:30'                  // time
});
```

## Return Format

All fill functions return a results object:

```javascript
{
    total: 5,           // Total elements attempted
    successful: 4,      // Successfully filled
    failed: 1,          // Failed to fill
    skipped: 0,         // Skipped elements
    details: [          // Per-element results
        {
            selector: '#name',
            status: 'success',
            value: 'John Doe',
            element: {tagName: 'input', type: 'text', id: 'name'},
            events: ['input', 'change']
        },
        {
            selector: '#invalid',
            status: 'error',
            error: 'Element not found with selector: #invalid',
            element: null
        }
    ],
    errors: ['Element not found with selector: #invalid']
}
```

## Usage Examples

### Basic Form Filling

```javascript
async function fillContactForm() {
    const form = document.getElementById('contact-form');
    
    const userData = {
        '#name': 'John Doe',
        '#email': 'john.doe@example.com',
        '#phone': '+1-555-123-4567',
        '#subject': 'support',
        '#message': 'Hello, I need help with...',
        '#newsletter': true
    };
    
    const result = window.agentlet.forms.fill(form, userData, {
        triggerEvents: true,
        validateValues: true,
        debugMode: true
    });
    
    console.log(`Filled ${result.successful}/${result.total} fields`);
    
    if (result.failed > 0) {
        console.error('Failed fills:', result.errors);
    }
}
```

### AI-Powered Form Filling

```javascript
async function intelligentFormFill() {
    // 1. Extract form structure
    const formData = window.agentlet.forms.exportForAI(document.body);
    
    // 2. Get user data (from database, AI, etc.)
    const userProfile = {
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane.smith@example.com',
        phone: '+1-555-987-6543',
        country: 'ca',
        accountType: 'business',
        notifications: ['email', 'sms']
    };
    
    // 3. Smart fill using AI data
    const result = window.agentlet.forms.fillFromAI(
        document.body, 
        formData, 
        userProfile,
        {
            triggerEvents: true,
            validateValues: true,
            onSuccess: (fieldResult) => {
                console.log(`✅ Filled: ${fieldResult.selector}`);
            },
            onError: (fieldResult) => {
                console.error(`❌ Failed: ${fieldResult.selector} - ${fieldResult.error}`);
            }
        }
    );
    
    return result;
}
```

### Multi-Step Form Filling

```javascript
async function fillMultiStepForm() {
    const container = document.getElementById('wizard-container');
    
    const steps = [
        {
            selectors: {
                '#step1-name': 'John Doe',
                '#step1-email': 'john@example.com'
            },
            retryAttempts: 3
        },
        {
            selectors: {
                '#step2-address': '123 Main St',
                '#step2-city': 'Anytown',
                '#step2-zip': '12345'
            },
            retryAttempts: 2
        }
    ];
    
    const results = await window.agentlet.forms.fillMultiple(container, steps, {
        triggerEvents: true,
        waitForElement: 2000  // Wait up to 2 seconds for elements
    });
    
    results.forEach((result, index) => {
        console.log(`Step ${index + 1}: ${result.successful}/${result.total} successful`);
    });
}
```

### Advanced Error Handling

```javascript
function robustFormFill(formElement, userData) {
    const options = {
        triggerEvents: true,
        validateValues: true,
        retryAttempts: 3,
        waitForElement: 1000,
        
        onSuccess: (result) => {
            console.log(`✅ Successfully filled: ${result.selector} = ${result.value}`);
        },
        
        onError: (result) => {
            console.error(`❌ Failed to fill: ${result.selector}`);
            console.error(`   Error: ${result.error}`);
            
            // Try alternative selectors
            if (result.selector.includes('#')) {
                const nameSelector = `[name="${result.selector.replace('#', '')}"]`;
                console.log(`   Trying alternative: ${nameSelector}`);
                // Could retry with different selector
            }
        },
        
        onSkipped: (result) => {
            console.warn(`⏭️  Skipped: ${result.selector} (${result.reason})`);
        }
    };
    
    try {
        const result = window.agentlet.forms.fill(formElement, userData, options);
        
        if (result.successful === result.total) {
            console.log('🎉 All fields filled successfully!');
            return true;
        } else {
            console.warn(`⚠️  Partial success: ${result.successful}/${result.total} fields filled`);
            return false;
        }
        
    } catch (error) {
        console.error('💥 Fill operation failed:', error.message);
        return false;
    }
}
```

### Context-Aware Filling

```javascript
function fillSpecificForm() {
    // Fill only within a specific form to avoid conflicts
    const registrationForm = document.getElementById('registration-form');
    const loginForm = document.getElementById('login-form');
    
    // These selectors only apply within their respective forms
    window.agentlet.forms.fill(registrationForm, {
        '#email': 'register@example.com',  // Only affects registration form
        '#password': 'newPassword123'
    });
    
    window.agentlet.forms.fill(loginForm, {
        '#email': 'login@example.com',     // Only affects login form  
        '#password': 'existingPassword'
    });
    
    // No conflicts between forms with same field names!
}
```

### Validation and Type Safety

```javascript
function validatedFill() {
    const form = document.getElementById('my-form');
    
    const result = window.agentlet.forms.fill(form, {
        '#email': 'john@example.com',      // ✅ Valid email
        '#phone': '+1-555-123-4567',       // ✅ Valid phone format
        '#website': 'https://example.com', // ✅ Valid URL
        '#age': '25',                      // ✅ Valid number
        '#birthday': '1990-05-15'          // ✅ Valid date
    }, {
        validateValues: true,  // Enable validation
        debugMode: true       // See validation details
    });
    
    // Check validation results
    result.details.forEach(detail => {
        if (detail.status === 'error' && detail.error.includes('Invalid value')) {
            console.error(`Validation failed for ${detail.selector}`);
        }
    });
}
```

## Security Features

### Scoped Selection
All selectors are scoped to the parent element using `parentElement.querySelector()`, preventing:
- Accidental modification of elements outside the target area
- Cross-form interference
- Global selector conflicts

### Value Validation
Optional validation prevents:
- Invalid email formats in email fields
- Invalid URLs in URL fields
- Out-of-range numbers in number fields
- Invalid dates in date fields

### Element State Checking
Automatic checking for:
- Disabled elements (skipped by default)
- Hidden elements (skipped by default)
- Readonly elements (skipped by default)

## Error Handling

The FormFiller provides comprehensive error handling:

```javascript
// Common error types
const result = window.agentlet.forms.fill(form, data);

result.details.forEach(detail => {
    switch (detail.status) {
        case 'success':
            console.log(`✅ ${detail.selector}: ${detail.value}`);
            break;
        case 'error':
            if (detail.error.includes('not found')) {
                console.error(`🔍 Element not found: ${detail.selector}`);
            } else if (detail.error.includes('Invalid value')) {
                console.error(`📝 Invalid value for: ${detail.selector}`);
            } else if (detail.error.includes('security')) {
                console.error(`🔒 Security restriction: ${detail.selector}`);
            }
            break;
        case 'skipped':
            console.warn(`⏭️  Skipped: ${detail.selector} (${detail.reason})`);
            break;
    }
});
```

The FormFiller is designed for production use with robust error handling, comprehensive validation, and safe operation within any web application! 🚀