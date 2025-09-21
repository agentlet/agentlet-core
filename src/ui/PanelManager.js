/**
 * Panel Manager
 * Handles panel resizing, width management, and state persistence
 */

export class PanelManager {
    constructor(agentletCore) {
        this.core = agentletCore;
    }

    /**
     * Resize panel to a preset size or custom width
     * @param {string|number} size - 'small', 'medium', 'large', or width in pixels
     */
    resizePanel(size) {
        if (!this.core.config.resizablePanel) {
            console.warn('Panel resizing is disabled');
            return;
        }

        let targetWidth;
        
        if (typeof size === 'string') {
            switch (size.toLowerCase()) {
            case 'small':
                targetWidth = this.core.config.minimumPanelWidth;
                break;
            case 'medium':
                targetWidth = Math.max(480, this.core.config.minimumPanelWidth);
                break;
            case 'large':
                targetWidth = Math.max(640, this.core.config.minimumPanelWidth);
                break;
            default:
                console.warn(`Unknown panel size: ${size}. Use 'small', 'medium', 'large', or a numeric width.`);
                return;
            }
        } else if (typeof size === 'number') {
            targetWidth = Math.max(size, this.core.config.minimumPanelWidth);
        } else {
            console.warn('Invalid size parameter. Use "small", "medium", "large", or a numeric width.');
            return;
        }

        this.setPanelWidth(targetWidth);
    }

    /**
     * Set panel width to a specific value
     * @param {number} width - Width in pixels
     */
    setPanelWidth(width) {
        if (!this.core.config.resizablePanel) {
            console.warn('Panel resizing is disabled');
            return;
        }

        if (typeof width !== 'number' || width < this.core.config.minimumPanelWidth) {
            console.warn(`Invalid width. Must be a number >= ${this.core.config.minimumPanelWidth}`);
            return;
        }

        const container = this.core.uiManager.ui.container;
        if (!container) {
            console.warn('Panel container not found');
            return;
        }

        container.style.width = `${width}px`;
        
        // Update CSS custom property for consistent theming
        document.documentElement.style.setProperty('--agentlet-panel-width', `${width}px`);
        
        // Update toggle button position if it exists
        const toggleButton = document.getElementById('agentlet-toggle');
        if (toggleButton && !this.core.uiManager.isMinimized) {
            toggleButton.style.right = `${width}px`;
        }
        
        // Emit single resize complete event
        this.core.eventBus.emit('panel:resizeComplete', { width });
        
        // Save panel width for the current module if env vars are available
        this.savePanelWidthForModule(width);
        
        console.log(`Panel resized to ${width}px`);
    }

    /**
     * Get current panel width
     * @returns {number} Current panel width in pixels
     */
    getPanelWidth() {
        const container = this.core.uiManager.ui.container;
        if (!container) {
            return parseInt(this.core.config.theme.panelWidth) || this.core.config.minimumPanelWidth;
        }
        return container.offsetWidth;
    }

    /**
     * Save panel width for the current module in environment variables
     * @param {number} width - Width in pixels to save
     */
    savePanelWidthForModule(width) {
        if (!this.core.envManager || !this.core.moduleLoader.activeModule) {
            return;
        }

        const moduleName = this.core.moduleLoader.activeModule.name;
        if (!moduleName) {
            return;
        }

        const envKey = `panel_width_${moduleName}`;
        this.core.envManager.set(envKey, width.toString());
        console.log(`Saved panel width ${width}px for module '${moduleName}'`);
    }

    /**
     * Restore panel width for a specific module from environment variables
     * @param {Object} activeModule - The module to restore width for
     */
    restorePanelWidthForModule(activeModule) {
        if (!this.core.envManager || !activeModule || !activeModule.name) {
            return;
        }

        // Skip restoration only if currently minimized (not just if it started minimized)
        if (this.core.uiManager.isMinimized) {
            return;
        }

        const moduleName = activeModule.name;
        const envKey = `panel_width_${moduleName}`;
        const savedWidth = this.core.envManager.get(envKey);

        if (savedWidth) {
            const width = parseInt(savedWidth);
            if (!isNaN(width) && width >= this.core.config.minimumPanelWidth) {
                // Use setTimeout to ensure UI is ready
                setTimeout(() => {
                    this.setPanelWidth(width);
                    console.log(`Restored panel width ${width}px for module '${moduleName}'`);
                }, 50);
            }
        }
    }
}