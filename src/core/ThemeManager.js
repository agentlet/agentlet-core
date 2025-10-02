/**
 * Theme Manager
 * Handles theme configuration processing and management
 */

import { Z_INDEX } from '../utils/ui/ZIndex.js';

export class ThemeManager {
    constructor(config = {}) {
        this.config = config;
    }

    /**
     * Process theme configuration and merge with defaults
     */
    processThemeConfig(themeConfig) {
        const defaultTheme = {
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
        const mergedTheme = {
            ...defaultTheme,
            ...themeConfig
        };
        
        // Update panel width based on configuration
        const minimumWidth = this.config?.minimumPanelWidth || 320;
        const currentWidth = parseInt(mergedTheme.panelWidth) || 320;
        mergedTheme.panelWidth = `${Math.max(currentWidth, minimumWidth)}px`;
        
        return mergedTheme;
    }

    /**
     * Get theme configuration
     */
    getTheme() {
        return this.processThemeConfig(this.config.theme);
    }

    /**
     * Update theme configuration
     */
    updateTheme(newThemeConfig) {
        this.config.theme = newThemeConfig;
        return this.getTheme();
    }
}