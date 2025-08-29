# Agentlet Core 📎 Resources

This folder contains icons, favicons, and other static assets for Agentlet Core 📎.

## Folder Structure

- **`icons/`** - Application icons in various formats and sizes
- **`favicons/`** - Favicon files for web pages and browser integration

## Icon Files

### `icons/agentlet-logo.svg`
- Main Agentlet Core 📎 logo
- 64x64 SVG format
- Features a friendly robot design with Agentlet brand colors
- Can be used for documentation, presentations, and branding

### `favicons/favicon.svg`
- Simplified favicon version of the logo
- 32x32 SVG format
- Optimized for small sizes and browser display
- Modern SVG favicon format (supported by all modern browsers)

## Usage

### In HTML Files
```html
<!-- SVG Favicon (modern browsers) -->
<link rel="icon" type="image/svg+xml" href="../resources/favicons/favicon.svg">

<!-- Fallback for older browsers -->
<link rel="icon" type="image/png" href="../resources/favicons/favicon-32x32.png">
```

### In Documentation
```markdown
![Agentlet Core 📎](../resources/icons/agentlet-logo.svg)
```

## Converting to Other Formats

To create additional favicon formats from the SVG source:

### PNG Favicons
```bash
# Convert SVG to PNG (requires ImageMagick or similar)
convert favicon.svg -resize 16x16 favicon-16x16.png
convert favicon.svg -resize 32x32 favicon-32x32.png
convert favicon.svg -resize 48x48 favicon-48x48.png
```

### ICO Format
```bash
# Convert PNG to ICO (requires ImageMagick)
convert favicon-32x32.png favicon.ico
```

### Apple Touch Icons
```bash
# For iOS devices
convert agentlet-logo.svg -resize 180x180 apple-touch-icon.png
```

## Design Guidelines

### Colors
- **Primary Blue**: `#1E3A8A` - Used for backgrounds and primary elements
- **Orange Accent**: `#F97316` - Used for highlights and interactive elements
- **White**: `#FFFFFF` - Used for contrast and details
- **Success Green**: `#22C55E` - Used for positive indicators
- **Error Red**: `#EF4444` - Used for error indicators
- **Info Blue**: `#3B82F6` - Used for informational elements

### Design Principles
- Simple, clean robot iconography
- Friendly and approachable appearance
- Clear visual hierarchy
- Scalable design that works at all sizes
- Consistent color palette
- Modern, professional aesthetic

## File Formats

- **SVG**: Primary format for scalability and modern web compatibility
- **PNG**: For broader compatibility and specific size requirements
- **ICO**: For traditional favicon support in older browsers

## Licensing

These icons are part of the Agentlet Core 📎 project and follow the same MIT license as the rest of the codebase.