/**
 * Style Injector
 * Handles CSS generation and injection for the Agentlet UI
 */

import { Z_INDEX } from '../utils/ui/ZIndex.js';

export class StyleInjector {
    constructor(themeManager) {
        this.themeManager = themeManager;
        // Id of the element/sheet holding the UI rules (panel, component, dialog,
        // animation styles). In non-shadow mode this single element also carries
        // the theme custom properties, matching pre-shadow-DOM behavior exactly.
        this.styleId = 'agentlet-core-styles';
        // Id of the <style> holding only the theme CSS custom properties. Always
        // injected into <head> (shadow mode or not) so `--agentlet-*` variables
        // inherit into the shadow tree, since custom properties pierce `all: initial`.
        this.themeStyleId = 'agentlet-core-theme';
        // UI mount root (ShadowRoot when shadowDom is enabled, document.body when
        // it's disabled). Set via setRoot(), normally by UIManager.ensureRoot().
        this.root = null;
        // Cached CSSStyleSheet instance reused across regenerateStyles() calls
        // when the adoptedStyleSheets API is available, so we replace its content
        // in place instead of creating (and appending) a new sheet every time.
        this._adoptedSheet = null;
    }

    /**
     * Tell the style injector where the UI rules should be applied. Called by
     * UIManager once the mount root (shadow root or document.body) is known.
     * @param {ShadowRoot|HTMLElement|null} root
     */
    setRoot(root) {
        this.root = root;
    }

    /**
     * Whether the current root is a shadow root (as opposed to document.body,
     * used when shadowDom is disabled). document.body is a stable singleton, so
     * this check is reliable for both real ShadowRoot instances and test doubles.
     */
    isShadowMode() {
        return !!this.root && this.root !== document.body;
    }

    /**
     * Generate CSS custom properties from theme
     */
    generateCSSProperties(theme) {
        return `
            /* CSS Custom Properties for Theme */
            :root {
                --agentlet-primary-color: ${theme.primaryColor};
                --agentlet-secondary-color: ${theme.secondaryColor};
                --agentlet-background-color: ${theme.backgroundColor};
                --agentlet-content-background: ${theme.contentBackground};
                --agentlet-text-color: ${theme.textColor};
                --agentlet-border-color: ${theme.borderColor};
                --agentlet-header-background: ${theme.headerBackground};
                --agentlet-header-text-color: ${theme.headerTextColor};
                --agentlet-action-button-background: ${theme.actionButtonBackground};
                --agentlet-action-button-border: ${theme.actionButtonBorder};
                --agentlet-action-button-hover: ${theme.actionButtonHover};
                --agentlet-action-button-text: ${theme.actionButtonText};
                --agentlet-actions-justify-content: ${theme.actionsJustifyContent};
                --agentlet-panel-width: ${theme.panelWidth};
                --agentlet-border-radius: ${theme.borderRadius};
                --agentlet-box-shadow: ${theme.boxShadow};
                --agentlet-font-family: ${theme.fontFamily};
                --agentlet-header-padding: ${theme.headerPadding};
                --agentlet-content-padding: ${theme.contentPadding};
                --agentlet-actions-padding: ${theme.actionsPadding};
                --agentlet-border-width: ${theme.borderWidth};
                --agentlet-transition-duration: ${theme.transitionDuration};
                
                /* Dialog Theme Variables */
                --agentlet-dialog-overlay-background: ${theme.dialogOverlayBackground};
                --agentlet-dialog-background: ${theme.dialogBackground};
                --agentlet-dialog-border-radius: ${theme.dialogBorderRadius};
                --agentlet-dialog-box-shadow: ${theme.dialogBoxShadow};
                --agentlet-dialog-header-background: ${theme.dialogHeaderBackground};
                --agentlet-dialog-header-text-color: ${theme.dialogHeaderTextColor};
                --agentlet-dialog-content-background: ${theme.dialogContentBackground};
                --agentlet-dialog-content-text-color: ${theme.dialogContentTextColor};
                --agentlet-dialog-button-primary-background: ${theme.dialogButtonPrimaryBackground};
                --agentlet-dialog-button-primary-hover: ${theme.dialogButtonPrimaryHover};
                --agentlet-dialog-button-secondary-background: ${theme.dialogButtonSecondaryBackground};
                --agentlet-dialog-button-secondary-hover: ${theme.dialogButtonSecondaryHover};
                --agentlet-dialog-button-danger-background: ${theme.dialogButtonDangerBackground};
                --agentlet-dialog-button-danger-hover: ${theme.dialogButtonDangerHover};
                --agentlet-dialog-progress-bar-background: ${theme.dialogProgressBarBackground};
                --agentlet-dialog-progress-bar-track-background: ${theme.dialogProgressBarTrackBackground};
                
                /* Spinner Theme Variables */
                --agentlet-spinner-track-color: ${theme.spinnerTrackColor};
                --agentlet-spinner-color: ${theme.spinnerColor};
                
                /* Image Overlay Theme Variables */
                --agentlet-image-overlay-width: ${theme.imageOverlayWidth};
                --agentlet-image-overlay-height: ${theme.imageOverlayHeight};
                --agentlet-image-overlay-bottom: ${theme.imageOverlayBottom};
                --agentlet-image-overlay-right: ${theme.imageOverlayRight};
                --agentlet-image-overlay-z-index: ${theme.imageOverlayZIndex};
                --agentlet-image-overlay-transition: ${theme.imageOverlayTransition};
                --agentlet-image-overlay-hover-scale: ${theme.imageOverlayHoverScale};
            }
        `;
    }

    /**
     * Generate main panel styles
     */
    generatePanelStyles() {
        return `
            /* Main Panel */
            .agentlet-panel {
                position: fixed;
                top: 0;
                height: 100vh;
                z-index: ${Z_INDEX.PANEL};
                background: var(--agentlet-background-color);
                font-family: var(--agentlet-font-family);
                transition: all var(--agentlet-transition-duration) ease;
                user-select: auto;
                display: flex;
                flex-direction: column;
                width: var(--agentlet-panel-width);
                max-width: 90vw;
                border-radius: var(--agentlet-border-radius);
                right: 0;
                border-left: var(--agentlet-border-width) solid var(--agentlet-border-color);
                box-shadow: var(--agentlet-box-shadow);
            }

            /* Toggle Button */
            .agentlet-toggle {
                position: fixed;
                top: 50%;
                right: var(--agentlet-panel-width);
                background: var(--agentlet-secondary-color);
                border: var(--agentlet-border-width) solid var(--agentlet-border-color);
                border-radius: 5px 0px 0px 5px;
                box-shadow: -2px 0 5px rgba(0,0,0,0.1);
                font-size: 12px;
                cursor: pointer;
                color: #FFF;
                padding: 8px 4px;
                margin: 0px;
                width: 20px;
                height: 40px;
                line-height: 1;
                transition: all var(--agentlet-transition-duration) ease;
                z-index: ${Z_INDEX.CRITICAL_OVERLAY};
            }

            /* Resize Handle */
            .agentlet-resize-handle {
                position: absolute;
                left: 0;
                top: 0;
                width: 4px;
                height: 100%;
                cursor: ew-resize;
                background: transparent;
                z-index: 1000001;
            }

            .agentlet-resize-handle:hover {
                background: var(--agentlet-primary-color);
                opacity: 0.3;
            }

            .agentlet-resize-handle:active {
                background: var(--agentlet-primary-color);
                opacity: 0.5;
            }
        `;
    }

    /**
     * Reset block prepended to the UI stylesheet when it lives inside a shadow
     * root, so elements inside the shadow tree don't inherit the host page's
     * fonts/colors. `all: initial` doesn't reset custom properties, so the
     * `--agentlet-*` theme variables (injected separately into <head>, see
     * injectThemeStyles()) still cascade in through `:host`.
     */
    generateHostResetStyles() {
        return `
            :host {
                all: initial;
                display: contents;
                font-family: var(--agentlet-font-family);
                color: var(--agentlet-text-color);
                line-height: 1.4;
                font-size: 14px;
            }
        `;
    }

    /**
     * Inject all styles.
     *
     * - shadowDom disabled (this.root === document.body, or no root set yet):
     *   exactly the pre-shadow-DOM behavior - one <style id="agentlet-core-styles">
     *   in <head> containing the theme variables plus every UI rule.
     * - shadowDom enabled: the theme variables go into <head> as their own
     *   <style id="agentlet-core-theme"> (so they inherit into the shadow tree),
     *   and the UI rules (prefixed with a :host reset) go into the shadow root,
     *   via an adopted stylesheet when supported or a fallback <style> element.
     */
    injectStyles() {
        const theme = this.themeManager.getTheme();

        if (!this.isShadowMode()) {
            this.injectLegacyStyles(theme);
            return;
        }

        this.injectThemeStyles(theme);
        this.injectUIStyles(theme);
    }

    /**
     * Pre-shadow-DOM behavior: a single <style> in <head> with everything.
     */
    injectLegacyStyles(theme) {
        const existingStyle = document.getElementById(this.styleId);
        if (existingStyle) {
            existingStyle.remove();
        }

        const style = document.createElement('style');
        style.id = this.styleId;

        // Build the complete stylesheet
        style.textContent =
            this.generateCSSProperties(theme) +
            this.generatePanelStyles() +
            this.generateComponentStyles() +
            this.generateDialogStyles() +
            this.generateBubbleStyles() +
            this.generateAnimationStyles();

        document.head.appendChild(style);
    }

    /**
     * Theme CSS custom properties (`--agentlet-*`), always injected into
     * <head> on `:root` regardless of shadowDom, so ThemeManager keeps working
     * unchanged and the variables inherit into any shadow tree.
     */
    injectThemeStyles(theme) {
        const existingStyle = document.getElementById(this.themeStyleId);
        if (existingStyle) {
            existingStyle.remove();
        }

        const style = document.createElement('style');
        style.id = this.themeStyleId;
        style.textContent = this.generateCSSProperties(theme);
        document.head.appendChild(style);
    }

    /**
     * UI rules (panel, component, dialog, animation styles plus the :host
     * reset), applied to the shadow root via adoptedStyleSheets when available,
     * falling back to a plain <style> element appended to the root otherwise.
     */
    injectUIStyles() {
        const root = this.root;
        const css =
            this.generateHostResetStyles() +
            this.generatePanelStyles() +
            this.generateComponentStyles() +
            this.generateDialogStyles() +
            this.generateBubbleStyles() +
            this.generateAnimationStyles();

        const supportsAdoptedStyleSheets =
            typeof root.adoptedStyleSheets !== 'undefined' &&
            typeof CSSStyleSheet !== 'undefined' &&
            typeof CSSStyleSheet.prototype.replaceSync === 'function';

        if (supportsAdoptedStyleSheets) {
            this.injectAdoptedStyles(root, css);
        } else {
            this.injectFallbackStyles(root, css);
        }
    }

    /**
     * Apply UI rules via a single, reused CSSStyleSheet on root.adoptedStyleSheets.
     * The sheet is created once and updated in place with replaceSync() on later
     * calls (theme regeneration), so regenerating styles never duplicates it.
     */
    injectAdoptedStyles(root, css) {
        // Clean up a leftover fallback <style> from an earlier injection that
        // didn't have adoptedStyleSheets support available.
        const existingFallback = typeof root.querySelector === 'function'
            ? root.querySelector(`#${this.styleId}`)
            : null;
        if (existingFallback) {
            existingFallback.remove();
        }

        if (!this._adoptedSheet) {
            this._adoptedSheet = new CSSStyleSheet();
        }
        this._adoptedSheet.replaceSync(css);

        const existingSheets = Array.isArray(root.adoptedStyleSheets) ? root.adoptedStyleSheets : [];
        if (!existingSheets.includes(this._adoptedSheet)) {
            root.adoptedStyleSheets = [...existingSheets, this._adoptedSheet];
        }
    }

    /**
     * Apply UI rules as a plain <style id="agentlet-core-styles"> element
     * appended to the root (used when adoptedStyleSheets isn't available, e.g.
     * jsdom in tests, or older browsers).
     */
    injectFallbackStyles(root, css) {
        const existingStyle = typeof root.querySelector === 'function'
            ? root.querySelector(`#${this.styleId}`)
            : null;
        if (existingStyle) {
            existingStyle.remove();
        }

        const style = document.createElement('style');
        style.id = this.styleId;
        style.textContent = css;
        root.appendChild(style);
    }

    /**
     * Regenerate styles with updated theme
     */
    regenerateStyles() {
        this.injectStyles();
        console.log('🎨 Styles regenerated with updated theme');
    }

    /**
     * Generate component styles (header, content, actions, buttons, modules)
     */
    generateComponentStyles() {
        return `
            /* Header */
            .agentlet-header {
                padding: var(--agentlet-header-padding);
                border-bottom: 1px solid var(--agentlet-border-color);
                background: var(--agentlet-header-background);
                color: var(--agentlet-header-text-color);
                flex-shrink: 0;
                cursor: default;
            }

            .agentlet-app-display {
                font-size: 14px;
                text-align: center;
                font-weight: 500;
            }

            #agentlet-app-name {
                
            }

            /* Content Area */
            .agentlet-content {
                flex: 1;
                overflow-y: auto;
                padding: var(--agentlet-content-padding);
                background: var(--agentlet-content-background);
            }

            /* Actions Area */
            .agentlet-actions {
                padding: var(--agentlet-actions-padding);
                border-top: 1px solid var(--agentlet-border-color);
                background: var(--agentlet-background-color);
                flex-shrink: 0;
                display: flex;
                justify-content: var(--agentlet-actions-justify-content);
                align-items: center;
            }

            .agentlet-actions-left {
                display: flex;
                align-items: center;
            }

            .agentlet-actions-right {
                display: flex;
                align-items: center;
            }

            /* Action Buttons */
            .agentlet-action-btn {
                background: var(--agentlet-action-button-background);
                border: 1px solid var(--agentlet-action-button-border);
                border-radius: 4px;
                padding: 6px 8px;
                cursor: pointer;
                font-size: 12px;
                color: var(--agentlet-action-button-text);
                transition: all var(--agentlet-transition-duration) ease;
            }

            .agentlet-action-btn:hover {
                background: var(--agentlet-action-button-hover);
                border-color: var(--agentlet-action-button-border);
            }


            /* Module Content Styles */
            .agentlet-module-content {
                margin-bottom: 15px;
                padding: 12px;
                border: 1px solid #dee2e6;
                border-radius: 6px;
                background: white;
            }
            
            .agentlet-module-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid #e9ecef;
            }
            
            .agentlet-module-header h3 {
                margin: 0;
                font-size: 14px;
                color: #495057;
            }
            
            .agentlet-module-version {
                font-size: 11px;
                color: #6c757d;
                background: #f8f9fa;
                padding: 2px 6px;
                border-radius: 10px;
            }
            
            .agentlet-btn {
                background: #007bff;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                margin: 2px;
                transition: background-color 0.2s ease;
            }
            
            .agentlet-btn:hover {
                background: #0056b3;
            }
            
            .agentlet-btn-secondary {
                background: #6c757d;
            }
            
            .agentlet-btn-secondary:hover {
                background: #545b62;
            }
            
            .agentlet-btn-sm {
                padding: 4px 8px;
                font-size: 11px;
            }
            
            .agentlet-submodule-content {
                margin-top: 10px;
                padding: 8px;
                background: #f8f9fa;
                border-radius: 4px;
                border-left: 3px solid #007bff;
            }
            
            .agentlet-submodule-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 6px;
            }
            
            .agentlet-submodule-header h4 {
                margin: 0;
                font-size: 12px;
                color: #495057;
            }
            
            .agentlet-submodule-status.active {
                color: #28a745;
                font-weight: bold;
            }
            
            .agentlet-submodule-status.inactive {
                color: #6c757d;
            }
            
            .agentlet-welcome {
                text-align: center;
                padding: 20px;
                color: #6c757d;
            }
            
            .agentlet-error {
                background: #f8d7da;
                color: #721c24;
                padding: 10px;
                border-radius: 4px;
                border: 1px solid #f5c6cb;
            }
        `;
    }
    /**
     * Generate unified dialog styles
     */
    generateDialogStyles() {
        return `
            /* Unified Dialog Styles - Applied to all utility dialogs */
            .agentlet-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: var(--agentlet-dialog-overlay-background);
                z-index: ${Z_INDEX.DIALOG_OVERLAY};
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: var(--agentlet-font-family);
            }
            
            .agentlet-dialog-container {
                background: var(--agentlet-dialog-background);
                border-radius: var(--agentlet-dialog-border-radius);
                box-shadow: var(--agentlet-dialog-box-shadow);
                max-width: 90vw;
                max-height: 90vh;
                overflow: hidden;
                animation: agentlet-dialog-fadein 0.3s ease;
            }
            
            .agentlet-dialog-header {
                background: var(--agentlet-dialog-header-background);
                color: var(--agentlet-dialog-header-text-color);
                padding: 16px 20px;
                display: flex;
                align-items: center;
                gap: 10px;
                font-weight: 600;
                font-size: 16px;
            }
            
            .agentlet-dialog-content {
                background: var(--agentlet-dialog-content-background);
                color: var(--agentlet-dialog-content-text-color);
                padding: 20px;
                font-size: 14px;
                line-height: 1.5;
            }
            
            .agentlet-dialog-actions {
                background: var(--agentlet-dialog-content-background);
                padding: 16px 20px;
                border-top: 1px solid var(--agentlet-border-color);
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
            
            .agentlet-dialog-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
                transition: all var(--agentlet-transition-duration) ease;
                min-width: 80px;
            }
            
            .agentlet-dialog-btn-primary {
                background: var(--agentlet-dialog-button-primary-background);
                color: white;
            }
            
            .agentlet-dialog-btn-primary:hover {
                background: var(--agentlet-dialog-button-primary-hover);
            }
            
            .agentlet-dialog-btn-secondary {
                background: var(--agentlet-dialog-button-secondary-background);
                color: white;
            }
            
            .agentlet-dialog-btn-secondary:hover {
                background: var(--agentlet-dialog-button-secondary-hover);
            }
            
            .agentlet-dialog-btn-danger {
                background: var(--agentlet-dialog-button-danger-background);
                color: white;
            }
            
            .agentlet-dialog-btn-danger:hover {
                background: var(--agentlet-dialog-button-danger-hover);
            }
            
            .agentlet-progress-bar-themed {
                background: var(--agentlet-dialog-progress-bar-background);
            }
            
            .agentlet-progress-track-themed {
                background: var(--agentlet-dialog-progress-bar-track-background);
            }
        `;
    }
    /**
     * Generate message bubble styles (hover state and small-viewport layout).
     * Moved here from MessageBubble.addStyles() so bubbles are covered by the
     * core stylesheet in both legacy and shadow mode; MessageBubble keeps a
     * fallback injector for standalone use (see MessageBubble.addStyles()).
     */
    generateBubbleStyles() {
        return `
            /* Message Bubble Styles */
            .agentlet-bubble:hover {
                transform: translateX(-2px) !important;
                box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2) !important;
            }

            @media (max-width: 480px) {
                #agentlet-message-bubbles {
                    left: 10px !important;
                    right: 10px !important;
                    max-width: none !important;
                }

                .agentlet-bubble {
                    transform: translateY(-100%) !important;
                }

                .agentlet-bubble:hover {
                    transform: translateY(-102px) !important;
                }
            }
        `;
    }
    /**
     * Generate animations and image overlay styles
     */
    generateAnimationStyles() {
        return `
            /* Image Overlay Styles */
            .agentlet-image-overlay {
                position: fixed;
                bottom: var(--agentlet-image-overlay-bottom);
                right: var(--agentlet-image-overlay-right);
                width: var(--agentlet-image-overlay-width);
                height: var(--agentlet-image-overlay-height);
                z-index: var(--agentlet-image-overlay-z-index);
                cursor: pointer;
                transition: var(--agentlet-image-overlay-transition);
                overflow: hidden;
            }
            
            .agentlet-image-overlay:hover {
                transform: scale(var(--agentlet-image-overlay-hover-scale));
            }
            
            .agentlet-image-overlay img {
                width: 100%;
                height: 100%;
                object-fit: contain;
                display: block;
            }
            
            /* Background scroll blocking when dialogs are open */
            body.agentlet-dialog-open {
                overflow: hidden !important;
                position: fixed !important;
                width: 100% !important;
                height: 100% !important;
            }
            
            /* Ensure dialog overlays and content remain scrollable */
            .agentlet-dialog-overlay,
            .agentlet-info-dialog {
                overflow-y: auto !important;
            }
            
            .agentlet-dialog-content {
                overflow-y: auto !important;
                max-height: calc(100vh - 120px) !important;
            }

            /* Animations */
            @keyframes agentlet-dialog-fadein {
                from { opacity: 0; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1); }
            }

            /* Dialog animations (moved here from Dialog.addDialogStyles()) */
            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.1); opacity: 0.7; }
            }

            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            @keyframes agentlet-progress-animate {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
        `;
    }
}