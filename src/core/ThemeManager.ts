/**
 * Theme Manager
 * Handles theme configuration processing and management
 */

import { Z_INDEX } from '../utils/ui/ZIndex.js';
import type { AgentletTheme, AgentletCoreConfig, ThemeManagerAPI } from '../types/public-api';

/**
 * Small contrast heuristic used only as a last-resort safeguard when a
 * caller sets a header background without ever specifying a matching text
 * colour (see `processThemeConfig()`). Only understands `#rgb`/`#rrggbb`
 * hex colours, which covers every built-in/example theme; anything else
 * (gradients, `rgba()`, named colours) falls back to the framework's
 * pre-existing dark default so behaviour for those callers is unchanged.
 */
export function contrastingTextColor(backgroundColor: string): string {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(backgroundColor.trim());
    if (!match) {
        return '#333333';
    }

    const hex = match[1];
    const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);

    // Perceptual (not linear) luminance approximation - good enough for a
    // black-or-white pick, not a WCAG contrast-ratio computation.
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? '#000000' : '#ffffff';
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
