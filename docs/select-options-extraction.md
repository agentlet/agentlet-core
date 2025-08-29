# Select Options Extraction Reference

The FormExtractor provides comprehensive extraction of `<select>` elements and their options. Here's exactly what it captures:

## What Gets Extracted

### 1. Select Element Properties
```javascript
{
    type: "select",
    id: "country-select",
    name: "country",
    
    // Select-specific properties
    options: {
        multiple: false,           // Whether multi-select is enabled
        size: 1,                  // Visual size of select box
        options: [...]            // Array of all option data
    },
    
    // Current state
    value: {
        selectedIndex: 2,         // Index of selected option
        selectedValue: "fr",      // Current value
        selectedOptions: [{       // Currently selected options
            value: "fr",
            text: "France"
        }]
    }
}
```

### 2. Individual Option Data
Each option in the `options.options` array contains:

```javascript
{
    index: 3,                    // Position in the list (0-based)
    value: "fr",                 // Option value attribute
    text: "France",              // Displayed text content
    selected: true,              // Current selection state
    defaultSelected: false,      // Initial selection state
    disabled: false,             // Whether option is disabled
    group: "Europe"              // Optgroup label (if grouped, null otherwise)
}
```

### 3. Option Groups (Optgroups)
For selects with `<optgroup>` elements:

```javascript
// Options automatically include group information
{
    value: "pst",
    text: "Pacific Time (PST)",
    group: "North America"       // The optgroup label
}
```

## Complete Example Output

For this HTML:
```html
<select id="timezone" name="timezone">
    <option value="">Select timezone</option>
    <optgroup label="North America">
        <option value="est">Eastern Time (EST)</option>
        <option value="pst" selected>Pacific Time (PST)</option>
    </optgroup>
    <optgroup label="Europe">
        <option value="gmt">Greenwich Mean Time (GMT)</option>
        <option value="cet">Central European Time (CET)</option>
    </optgroup>
</select>
```

The FormExtractor returns:
```javascript
{
    tagName: "select",
    type: "select",
    id: "timezone",
    name: "timezone",
    
    // All targeting selectors
    selectors: [
        {
            type: "id",
            selector: "#timezone",
            certainty: 0.95,
            description: "ID selector - highly reliable"
        },
        {
            type: "name",
            selector: "[name=\"timezone\"]", 
            certainty: 0.85,
            description: "Name attribute - reliable for forms"
        }
    ],
    
    // Current value information
    value: {
        selectedIndex: 2,
        selectedValue: "pst",
        selectedOptions: [{
            value: "pst",
            text: "Pacific Time (PST)"
        }]
    },
    
    // Default value (what was initially selected)
    defaultValue: null,
    
    // All options with full metadata
    options: {
        multiple: false,
        size: 1,
        options: [
            {
                index: 0,
                value: "",
                text: "Select timezone",
                selected: false,
                defaultSelected: false,
                disabled: false,
                group: null
            },
            {
                index: 1,
                value: "est",
                text: "Eastern Time (EST)",
                selected: false,
                defaultSelected: false,
                disabled: false,
                group: "North America"
            },
            {
                index: 2,
                value: "pst",
                text: "Pacific Time (PST)",
                selected: true,
                defaultSelected: false,
                disabled: false,
                group: "North America"
            },
            {
                index: 3,
                value: "gmt",
                text: "Greenwich Mean Time (GMT)",
                selected: false,
                defaultSelected: false,
                disabled: false,
                group: "Europe"
            },
            {
                index: 4,
                value: "cet",
                text: "Central European Time (CET)",
                selected: false,
                defaultSelected: false,
                disabled: false,
                group: "Europe"
            }
        ]
    },
    
    // Labels and context
    labels: [{
        type: "explicit",
        text: "Timezone",
        position: "above"
    }],
    
    // Element state
    state: {
        disabled: false,
        readonly: false,
        visible: true,
        interactable: true
    },
    
    // Visual positioning
    boundingBox: {
        x: 20, y: 150,
        width: 300, height: 35,
        visible: true
    }
}
```

## Usage Examples

### 1. Extract All Select Options
```javascript
const formData = window.agentlet.forms.extract(document.body);

formData.forms.forEach(form => {
    form.elements.forEach(element => {
        if (element.type === 'select') {
            console.log(`Select: ${element.name}`);
            console.log(`Options: ${element.options.options.length}`);
            
            element.options.options.forEach(option => {
                console.log(`- "${option.text}" (${option.value}) ${option.selected ? '✓' : ''}`);
            });
        }
    });
});
```

### 2. Get All Available Options for AI
```javascript
function getSelectOptions(formData) {
    const selectData = {};
    
    formData.forms.forEach(form => {
        form.elements.forEach(element => {
            if (element.type === 'select') {
                selectData[element.name] = {
                    multiple: element.options.multiple,
                    options: element.options.options.map(opt => ({
                        value: opt.value,
                        text: opt.text,
                        group: opt.group
                    })),
                    currentSelection: element.options.options
                        .filter(opt => opt.selected)
                        .map(opt => opt.value)
                };
            }
        });
    });
    
    return selectData;
}

// Usage
const formData = window.agentlet.forms.extract(formElement);
const selectOptions = getSelectOptions(formData);
console.log(selectOptions);
// {
//   "country": {
//     "multiple": false,
//     "options": [
//       {"value": "us", "text": "United States", "group": null},
//       {"value": "ca", "text": "Canada", "group": null}
//     ],
//     "currentSelection": ["us"]
//   }
// }
```

### 3. Fill Select with AI Values
```javascript
function fillSelect(selectElement, desiredValue, formData) {
    // Find the select element data
    const selectData = formData.forms
        .flatMap(form => form.elements)
        .find(el => el.type === 'select' && el.name === selectElement.name);
    
    if (!selectData) return false;
    
    // Check if the desired value exists in options
    const validOption = selectData.options.options.find(opt => 
        opt.value === desiredValue && !opt.disabled
    );
    
    if (validOption) {
        selectElement.value = desiredValue;
        selectElement.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }
    
    return false;
}
```

### 4. Group Options by Optgroup
```javascript
function groupSelectOptions(selectElement) {
    const groups = {};
    
    selectElement.options.options.forEach(option => {
        const groupName = option.group || 'Ungrouped';
        if (!groups[groupName]) {
            groups[groupName] = [];
        }
        groups[groupName].push(option);
    });
    
    return groups;
}

// Usage
const formData = window.agentlet.forms.extract(formElement);
const selectEl = formData.forms[0].elements.find(el => el.type === 'select');
const grouped = groupSelectOptions(selectEl);

console.log(grouped);
// {
//   "North America": [
//     {"value": "est", "text": "Eastern Time (EST)", ...},
//     {"value": "pst", "text": "Pacific Time (PST)", ...}
//   ],
//   "Europe": [
//     {"value": "gmt", "text": "Greenwich Mean Time (GMT)", ...}
//   ]
// }
```

## Special Cases Handled

### 1. Multiple Select
```javascript
// For <select multiple>
{
    options: {
        multiple: true,
        options: [...],
        selectedOptions: [
            {value: "js", text: "JavaScript"},
            {value: "py", text: "Python"}
        ]
    }
}
```

### 2. Disabled Options
```javascript
{
    value: "admin",
    text: "Admin Level (Disabled)",
    disabled: true,     // Option is disabled
    selected: false
}
```

### 3. Large Select Boxes
```javascript
// For <select size="5">
{
    options: {
        size: 5,           // Visual size
        multiple: false,
        options: [...]
    }
}
```

## Demo
Open `examples/select-options-demo.html` to see comprehensive select option extraction in action with:
- Simple selects
- Multiple selects
- Grouped options (optgroups)
- Disabled options
- Large select boxes

The FormExtractor captures **everything** about select elements - their options, groupings, states, and targeting information - making it perfect for AI-powered form automation! 🔽