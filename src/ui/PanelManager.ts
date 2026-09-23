/**
 * Panel Manager
 * Handles panel resizing, width management, and state persistence
 */

import type { AgentletCoreConfig, AgentletTheme, EventBusAPI, EnvAPI, AgentletModule } from '../types/public-api';

/**
 * Minimal shape of the `AgentletCore` instance this class needs. Not the
 * full `AgentletAPI` from `src/types/public-api.d.ts`: this class reaches
 * into `uiManager.ui.container`/`uiManager.isMinimized`, internal
 * `UIManager` details not exposed on the public, agentlet-author-facing
 * `UIManagerInternalAPI` (`window.agentlet.uiManager`) declared there.
 * `envManager` is also narrowed to nullable here (unlike `AgentletAPI`,
 * which declares it non-null) since `initializeEnvManager()` in
 * `src/index.js` can genuinely return `null`, and this class checks for it.
 */
interface PanelManagerCore {
    config: Omit<AgentletCoreConfig, 'minimumPanelWidth'> & {
        /**
         * Always populated by the time `PanelManager` runs: `AgentletCore`'s
         * constructor defaults it (`config.minimumPanelWidth || 320`) even
         * though `AgentletCoreConfig.minimumPanelWidth` itself is optional.
         */
        minimumPanelWidth: number;
    };
    eventBus: EventBusAPI;
    envManager: EnvAPI | null;
    moduleRegistry: { activeModule: AgentletModule | null };
    uiManager: { ui: { container: HTMLElement | null }; isMinimized: boolean };
    ui: { query(selector: string): Element | null };
}

export class PanelManager {
    core: PanelManagerCore;

    constructor(agentletCore: PanelManagerCore) {
        this.core = agentletCore;
    }

    /**
     * Resize panel to a preset size or custom width
     * @param size - 'small', 'medium', 'large', or width in pixels
     */
    resizePanel(size: 'small' | 'medium' | 'large' | number): void {
        if (!this.core.config.resizablePanel) {
            console.warn('Panel resizing is disabled');
            return;
        }

        let targetWidth: number;

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
     * @param width - Width in pixels
     */
    setPanelWidth(width: number): void {
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
        // `ui.query()` returns `Element | null`; cast to `HTMLElement` for `.style`, as the
        // pre-existing runtime code already assumed.
        const toggleButton = this.core.ui.query('#agentlet-toggle') as HTMLElement | null;
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
     * @returns Current panel width in pixels
     */
    getPanelWidth(): number {
        const container = this.core.uiManager.ui.container;
        if (!container) {
            // `config.theme` is `string | Partial<AgentletTheme> | undefined` at the type level
            // (see AgentletCoreConfig); this cast mirrors the pre-existing runtime code, which
            // reads `.panelWidth` straight off whatever was passed in without narrowing first.
            return parseInt((this.core.config.theme as AgentletTheme).panelWidth) || this.core.config.minimumPanelWidth;
        }
        return container.offsetWidth;
    }

    /**
     * Save panel width for the current module in environment variables
     * @param width - Width in pixels to save
     */
    savePanelWidthForModule(width: number): void {
        if (!this.core.envManager || !this.core.moduleRegistry.activeModule) {
            return;
        }

        const moduleName = this.core.moduleRegistry.activeModule.name;
        if (!moduleName) {
            return;
        }

        const envKey = `panel_width_${moduleName}`;
        this.core.envManager.set(envKey, width.toString());
        console.log(`Saved panel width ${width}px for module '${moduleName}'`);
    }

    /**
     * Restore panel width for a specific module from environment variables
     * @param activeModule - The module to restore width for
     */
    restorePanelWidthForModule(activeModule: AgentletModule | null): void {
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
