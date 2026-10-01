/**
 * Theme Manager
 * Handles theme configuration processing and management
 */

import { Z_INDEX } from '../utils/ui/ZIndex.js';
import type { AgentletTheme, AgentletCoreConfig, ThemeManagerAPI } from '../types/public-api';

/**
 * Small contrast heuristic used only as a last-resort safeguard when a
 * caller sets a header background without ever specifying a matching text
 * colour (see `processThemeConfig()`). Understands hex colours (`#rgb`,
 * `#rgba`, `#rrggbb`, `#rrggbbaa`) and functional `rgb()`/`rgba()` notation
 * (comma- or space-separated, percentages, an optional alpha channel -
 * which is ignored, since it doesn't affect the black/white pick against
 * an opaque header). Anything this doesn't recognise - a CSS custom
 * property (`var(...)`), a gradient, `hsl()`/`oklch()`/etc, a named colour
 * like `navy` - falls back to the framework's dark default.
 */
export function contrastingTextColor(backgroundColor: string): string {
    const rgb = parseRgbComponents(backgroundColor.trim());
    if (!rgb) {
        return '#333333';
    }

    const [r, g, b] = rgb;

    // Perceptual (not linear) luminance approximation - good enough for a
    // black-or-white pick, not a WCAG contrast-ratio computation.
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#000000' : '#ffffff';
}

/**
 * Parses a colour into `[r, g, b]` (each 0-255), or returns `null` when the
 * value isn't in a form this understands - see `contrastingTextColor()`
 * for exactly what that covers and what it deliberately doesn't.
 */
function parseRgbComponents(value: string): [number, number, number] | null {
    const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(value);
    if (hexMatch) {
        const hex = hexMatch[1];
        // #rgb/#rgba each digit doubles (e.g. "a" -> "aa"); alpha (the
        // trailing pair for #rgba/#rrggbbaa) is simply not read below.
        const full = hex.length <= 4 ? hex.split('').map(c => c + c).join('') : hex;
        return [
            parseInt(full.slice(0, 2), 16),
            parseInt(full.slice(2, 4), 16),
            parseInt(full.slice(4, 6), 16)
        ];
    }

    const functionalMatch = /^rgba?\(\s*([^)]+)\)$/i.exec(value);
    if (functionalMatch) {
        // Drop an optional trailing alpha (`rgb(r g b / a)`, CSS Color 4),
        // then split the rest on commas or whitespace - covers both
        // `rgb(255, 0, 0)` and `rgb(255 0 0)`; a comma-separated 4th value
        // (`rgba(255, 0, 0, 0.5)`) is dropped by only reading the first 3.
        const body = functionalMatch[1].split('/')[0].trim();
        const parts = body.split(/[\s,]+/).filter(Boolean);
        if (parts.length >= 3) {
            const r = parseColorChannel(parts[0]);
            const g = parseColorChannel(parts[1]);
            const b = parseColorChannel(parts[2]);
            if (r !== null && g !== null && b !== null) {
                return [r, g, b];
            }
        }
    }

    return null;
}

/** One `rgb()`/`rgba()` channel ("128" or "50%") to 0-255, or `null` if it's neither. */
function parseColorChannel(part: string): number | null {
    const isPercentage = part.endsWith('%');
    const n = parseFloat(isPercentage ? part.slice(0, -1) : part);
    if (!Number.isFinite(n)) {
        return null;
    }
    const value = isPercentage ? (n / 100) * 255 : n;
    return Math.max(0, Math.min(255, value));
}

export class ThemeManager implements ThemeManagerAPI {
    /**
     * The full `AgentletCore` config object is passed in by reference
     * (`new ThemeManager(this.config)` in src/index.js), so this class only
     * ever reads `theme` and `minimumPanelWidth` off of it.
     */
    config: AgentletCoreConfig;

    constructor(config: AgentletCoreConfig = {}) {
        this.config = config;
    }

    /**
     * Process theme configuration and merge with defaults
     */
    processThemeConfig(themeConfig: string | Partial<AgentletTheme> | undefined): AgentletTheme {
        const defaultTheme: AgentletTheme = {
            // Colors
            primaryColor: '#1E3A8A',
            secondaryColor: '#F97316',
            backgroundColor: '#ffffff',
            contentBackground: '#f8f9fa',
            textColor: '#333333',
            borderColor: '#e0e0e0',

            // Header
            headerBackground: '#ffffff',
            headerTextColor: '#333333',

            // Actions
            actionButtonBackground: '#f8f9fa',
            actionButtonBorder: '#dee2e6',
            actionButtonHover: '#e9ecef',
            actionButtonText: '#333333',
            actionsJustifyContent: 'space-between', // Default layout

            // Layout
            panelWidth: '320px',
            borderRadius: '0px',
            boxShadow: '-2px 0 10px rgba(0,0,0,0.1)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',

            // Spacing
            headerPadding: '15px',
            contentPadding: '15px',
            actionsPadding: '10px 15px',

            // Borders
            borderWidth: '2px',

            // Animation
            transitionDuration: '0.3s',

            // Dialog theming (unified across all dialogs)
            dialogOverlayBackground: 'rgba(0, 0, 0, 0.5)',
            dialogBackground: '#ffffff',
            dialogBorderRadius: '8px',
            dialogBoxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            dialogHeaderBackground: '#ffffff',
            dialogHeaderTextColor: '#333333',
            dialogHeaderTextMargin: '0',
            dialogContentBackground: '#ffffff',
            dialogContentTextColor: '#333333',
            dialogButtonPrimaryBackground: '#1E3A8A',
            dialogButtonPrimaryHover: '#1E40AF',
            dialogButtonSecondaryBackground: '#6B7280',
            dialogButtonSecondaryHover: '#4B5563',
            dialogButtonDangerBackground: '#DC2626',
            dialogButtonDangerHover: '#B91C1C',
            dialogProgressBarBackground: 'linear-gradient(90deg, #1E3A8A, #F97316)',
            dialogProgressBarTrackBackground: '#f0f0f0',

            // Spinner
            spinnerTrackColor: '#f3f3f3',
            spinnerColor: '#667eea',

            // Image Overlay Theme Variables
            imageOverlayWidth: '100px',
            imageOverlayHeight: '100px',
            imageOverlayBottom: '20px',
            imageOverlayRight: '20px',
            imageOverlayZIndex: Z_INDEX.IMAGE_OVERLAY,
            imageOverlayTransition: 'all 0.3s ease',
            imageOverlayHoverScale: '1.05'
        };

        // If theme is just a string (legacy), return defaults
        if (typeof themeConfig === 'string' || !themeConfig) {
            return defaultTheme;
        }

        // Merge user theme with defaults and apply minimum panel width
        const mergedTheme: AgentletTheme = {
            ...defaultTheme,
            ...themeConfig
        };

        // A dialog header's background and text colour must always come
        // from the same pair: either both dialog-specific
        // (dialogHeaderBackground/dialogHeaderTextColor) or both panel
        // header values (headerBackground/headerTextColor) - see the
        // Dialog builders under src/utils/ui/dialog/. Without this, a
        // caller that customizes only the panel header (e.g.
        // `{ headerBackground: '#0f3350', headerTextColor: '#ffffff' }`)
        // would get dialog headers colored from the panel background but
        // texted from the unrelated dialog-specific default (`#333333`),
        // which can be unreadable.
        const setsHeaderBackground = themeConfig.headerBackground !== undefined;
        const setsHeaderTextColor = themeConfig.headerTextColor !== undefined;
        const setsDialogHeaderBackground = themeConfig.dialogHeaderBackground !== undefined;
        const setsDialogHeaderTextColor = themeConfig.dialogHeaderTextColor !== undefined;

        if (!setsDialogHeaderBackground && setsHeaderBackground) {
            mergedTheme.dialogHeaderBackground = mergedTheme.headerBackground;
        }
        if (!setsDialogHeaderTextColor && setsHeaderTextColor) {
            mergedTheme.dialogHeaderTextColor = mergedTheme.headerTextColor;
        } else if (
            (setsDialogHeaderBackground || setsHeaderBackground) &&
            !setsDialogHeaderTextColor &&
            !setsHeaderTextColor
        ) {
            // A header background was customized (directly, or inherited
            // from the panel above) but no matching text colour was ever
            // given: derive a readable one instead of falling through to
            // the fixed dark default.
            mergedTheme.dialogHeaderTextColor = contrastingTextColor(mergedTheme.dialogHeaderBackground);
        }

        // Update panel width based on configuration
        const minimumWidth = this.config?.minimumPanelWidth || 320;
        const currentWidth = parseInt(mergedTheme.panelWidth) || 320;
        mergedTheme.panelWidth = `${Math.max(currentWidth, minimumWidth)}px`;

        return mergedTheme;
    }

    /**
     * Get theme configuration
     */
    getTheme(): AgentletTheme {
        return this.processThemeConfig(this.config.theme);
    }

    /**
     * Update theme configuration
     */
    updateTheme(newThemeConfig: string | Partial<AgentletTheme>): AgentletTheme {
        this.config.theme = newThemeConfig;
        return this.getTheme();
    }
}
