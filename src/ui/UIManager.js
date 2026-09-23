/**
 * UI Manager
 * Handles UI creation, management, and interactions for the Agentlet panel
 */

// import { Z_INDEX } from '../utils/ui/ZIndex.js';

export class UIManager {
    constructor(agentletCore) {
        this.core = agentletCore;
        
        // Use shared UI references and state from AgentletCore
        this.ui = agentletCore.ui;
        // Use core's isMinimized instead of our own
        // this.isMinimized will be accessed via this.core.isMinimized
    }

    /**
     * Ensure the UI mount root exists: an open shadow root under a dedicated
     * #agentlet-host element (shadowDom: true, the default), or document.body
     * itself (shadowDom: false, preserving the pre-shadow-DOM behavior exactly).
     *
     * Safe to call multiple times: it only (re)creates the root when one isn't
     * already tracked on this.ui, so init() can call it once up front (before
     * styles are injected) and setupBaseUI() can call it again defensively
     * without tearing down and recreating the shadow root on every call.
     */
    ensureRoot() {
        if (this.ui.root) {
            return this.ui.root;
        }

        if (this.core.config.shadowDom) {
            // Remove any host left over from a previous init/cleanup cycle
            const existingHost = document.getElementById('agentlet-host');
            if (existingHost) {
                existingHost.remove();
            }

            const host = document.createElement('div');
            host.id = 'agentlet-host';
            document.body.appendChild(host);

            this.ui.host = host;
            this.ui.root = host.attachShadow({ mode: 'open' });
        } else {
            this.ui.host = null;
            this.ui.root = document.body;
        }

        // Keep AgentletCore's own reference in sync (same object today, kept
        // explicit since this.ui and this.core.ui may diverge in the future)
        this.core.ui.host = this.ui.host;
        this.core.ui.root = this.ui.root;

        // Let the style injector know where UI rules should now be applied
        if (this.core.styleInjector) {
            this.core.styleInjector.setRoot(this.ui.root);
        }

        return this.ui.root;
    }

    /**
     * Enhanced UI setup with responsive design
     */
    setupBaseUI() {
        // Make sure we have a mount root (normally already created by init()
        // via ensureRoot(), but create one lazily if setupBaseUI() is called
        // standalone).
        this.ensureRoot();
        const root = this.ui.root;

        // Remove existing container if present
        const existingContainer = root.querySelector ? root.querySelector('#agentlet-container') : null;
        if (existingContainer) {
            existingContainer.remove();
        }

        // Create main container
        const container = document.createElement('div');
        container.id = 'agentlet-container';
        container.className = 'agentlet-panel';
        
        // Create toggle button only if minimizeWithImage is not configured
        let toggleButton = null;
        if (!this.core.config.minimizeWithImage || typeof this.core.config.minimizeWithImage !== 'string') {
            toggleButton = this.createToggleButton();
        }
        
        // Create header
        const header = this.createHeader();
        
        // Create content area
        const content = this.createContentArea();
        
        // Create actions area
        const actions = this.createActionsArea();
        
        // Create resize handle if resizable is enabled
        let resizeHandle = null;
        if (this.core.config.resizablePanel) {
            resizeHandle = this.createResizeHandle(container);
        }
        
        // Assemble UI
        if (resizeHandle) {
            container.appendChild(resizeHandle);
        }
        container.appendChild(header);
        container.appendChild(content);
        container.appendChild(actions);
        
        // Add to document (the shadow root when shadowDom is enabled, otherwise document.body)
        if (toggleButton) {
            root.appendChild(toggleButton);
            root.appendChild(container);
        } else {
            root.appendChild(container);
        }
        
        // Store UI references in both UIManager and AgentletCore
        this.ui.container = container;
        this.ui.content = content;
        this.ui.header = header;
        this.ui.actions = actions;

        // Also directly update AgentletCore's references to ensure sync
        this.core.ui.container = container;
        this.core.ui.content = content;
        this.core.ui.header = header;
        this.core.ui.actions = actions;
        
        // Ensure image overlay is shown if panel is minimized and image is configured
        this.ensureImageOverlay();
        
        // Handle startMinimized option
        if (this.core.config.startMinimized) {
            this.core.isMinimized = true;
            
            // Apply minimized state to container
            if (container) {
                container.style.transform = 'translateX(100%)';
            }
            
            // Update toggle button if it exists
            if (toggleButton) {
                toggleButton.innerHTML = '◀';
                toggleButton.style.right = '-2px';
            }
            
            // Show image overlay if configured
            if (this.core.config.minimizeWithImage && typeof this.core.config.minimizeWithImage === 'string') {
                this.showImageOverlay();
            }
            
            console.log('🎨 UI setup completed (started minimized)');
        } else {
            console.log('🎨 UI setup completed');
        }
    }

    /**
     * Create toggle button
     */
    createToggleButton() {
        const toggleButton = document.createElement('button');
        toggleButton.innerHTML = '▶';
        toggleButton.id = 'agentlet-toggle';
        toggleButton.className = 'agentlet-toggle';
        
        toggleButton.onclick = (e) => {
            e.stopPropagation();
            this.toggleCollapse();
        };
        
        return toggleButton;
    }

    /**
     * Create header section
     */
    createHeader() {
        const header = document.createElement('div');
        header.id = 'agentlet-header';
        header.className = 'agentlet-header';
        
        // Application display
        const appDisplay = document.createElement('div');
        appDisplay.id = 'agentlet-app-display';
        appDisplay.className = 'agentlet-app-display';
        appDisplay.innerHTML = '<strong>Agentlet:</strong> <span id="agentlet-app-name">Ready</span>';
        
        header.appendChild(appDisplay);
        
        return header;
    }

    /**
     * Create content area
     */
    createContentArea() {
        const content = document.createElement('div');
        content.id = 'agentlet-content';
        content.className = 'agentlet-content';

        console.log('🔧 UIManager createContentArea created:', content);
        return content;
    }

    /**
     * UI control methods
     */
    show() {
        if (this.ui && this.ui.container) {
            this.ui.container.style.display = 'flex';
        }
    }

    hide() {
        if (this.ui && this.ui.container) {
            this.ui.container.style.display = 'none';
        }
    }

    minimize() {
        if (!this.core.isMinimized) {
            this.toggleCollapse();
        }
    }

    maximize() {
        if (this.core.isMinimized) {
            this.toggleCollapse();
        }
    }

    createActionsArea() {
        const actions = document.createElement('div');
        actions.id = 'agentlet-actions';
        actions.className = 'agentlet-actions';
        
        // Optional action buttons based on configuration
        let refreshBtn = null;
        if (this.core.config.showRefreshButton) {
            refreshBtn = this.core.createActionButton('🔄', 'Refresh', () => this.core.refreshContent());
        }

        let settingsBtn = null;
        if (this.core.config.showSettingsButton) {
            settingsBtn = this.core.createActionButton('⚙️', 'Settings', () => this.core.showSettings());
        }
        
        let helpBtn = null;
        if (this.core.config.showHelpButton) {
            helpBtn = this.core.createActionButton('❓', 'Help', () => this.core.showHelp());
        }
        
        // Add environment variables button if enabled and envManager is available
        let envVarsBtn = null;
        if (this.core.config.showEnvVarsButton && this.core.envManager) {
            envVarsBtn = this.core.createActionButton('🔧', 'Environment Variables', () => this.core.showEnvVarsDialog());
        }
        
        // Add authentication button if enabled
        const authBtn = this.core.authManager.createLoginButton();
        
        // Create discrete close button
        const closeBtn = this.core.createDiscreteCloseButton();

        // Create left container for main buttons
        const leftActions = document.createElement('div');
        leftActions.className = 'agentlet-actions-left';

        // Create right container for auth and close buttons
        const rightActions = document.createElement('div');
        rightActions.className = 'agentlet-actions-right';

        // Add main buttons to left side
        if (refreshBtn) {
            leftActions.appendChild(refreshBtn);
        }
        if (settingsBtn) {
            leftActions.appendChild(settingsBtn);
        }
        if (helpBtn) {
            leftActions.appendChild(helpBtn);
        }
        if (envVarsBtn) {
            leftActions.appendChild(envVarsBtn);
        }
        leftActions.appendChild(closeBtn);

        // Add auth button to right side
        if (authBtn) {
            rightActions.appendChild(authBtn);
        }

        // Add containers to main actions area
        actions.appendChild(leftActions);
        actions.appendChild(rightActions);

        return actions;
    }

    createResizeHandle(container) {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'agentlet-resize-handle';
        
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        const startResize = (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = container.offsetWidth;
            
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
            
            // Prevent text selection during resize
            document.body.style.userSelect = 'none';
            
            // Disable transitions during resize for smooth dragging
            container.style.transition = 'none';
            
            // Also disable toggle button transitions during resize
            const toggleButton = this.ui.query('#agentlet-toggle');
            if (toggleButton) {
                toggleButton.style.transition = 'none';
            }
            
            e.preventDefault();
        };
        
        const handleResize = (e) => {
            if (!isResizing) return;
            
            const diff = startX - e.clientX; // Negative diff means expanding left
            const newWidth = Math.max(this.core.config.minimumPanelWidth, startWidth + diff);
            
            container.style.width = `${newWidth}px`;
            
            // Update CSS custom property for consistent theming
            document.documentElement.style.setProperty('--agentlet-panel-width', `${newWidth}px`);
            
            // Update toggle button position if it exists
            const toggleButton = this.ui.query('#agentlet-toggle');
            if (toggleButton && !this.core.isMinimized) {
                toggleButton.style.right = `${newWidth}px`;
            }
        };
        
        const stopResize = () => {
            if (!isResizing) return;
            
            isResizing = false;
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
            
            // Restore text selection
            document.body.style.userSelect = '';
            
            // Restore transitions
            container.style.transition = '';
            
            // Restore toggle button transitions
            const toggleButton = this.ui.query('#agentlet-toggle');
            if (toggleButton) {
                toggleButton.style.transition = '';
            }
            
            // Emit resize complete event
            this.core.eventBus.emit('panel:resizeComplete', { width: container.offsetWidth });
            
            // Save panel width for the current module if env vars are available
            this.core.panelManager.savePanelWidthForModule(container.offsetWidth);
        };
        
        resizeHandle.addEventListener('mousedown', startResize);
        
        return resizeHandle;
    }

    toggleCollapse() {
        const container = this.ui && this.ui.container;
        const toggleButton = this.ui.query('#agentlet-toggle');
        
        // Safety check for container
        if (!container) return;
        
        if (!this.core.isMinimized) {
            // Collapse
            container.style.transform = 'translateX(100%)';
            
            // Update toggle button if it exists
            if (toggleButton) {
                toggleButton.innerHTML = '◀';
                toggleButton.style.right = '-2px';
            }
            
            this.core.isMinimized = true;
            
            // Show image overlay if minimizeWithImage is configured
            if (this.core.config.minimizeWithImage && typeof this.core.config.minimizeWithImage === 'string') {
                this.showImageOverlay();
            }
            
            this.core.eventBus.emit('ui:minimized');
        } else {
            // Expand
            container.style.transform = 'translateX(0)';
            
            // Update toggle button if it exists
            if (toggleButton) {
                toggleButton.innerHTML = '▶';
                toggleButton.style.right = '';
            }
            
            this.core.isMinimized = false;
            
            // Restore panel width for current module when maximizing
            if (this.core.moduleRegistry.activeModule) {
                this.core.panelManager.restorePanelWidthForModule(this.core.moduleRegistry.activeModule);
            }
            
            // Don't hide image overlay - it should always be visible when minimizeWithImage is configured
            // The image overlay will handle the toggle functionality
            
            this.core.eventBus.emit('ui:maximized');
        }
    }

    showImageOverlay() {
        // Only show if minimizeWithImage is configured
        if (!this.core.config.minimizeWithImage || typeof this.core.config.minimizeWithImage !== 'string') {
            return;
        }
        
        // Remove existing overlay if present
        this.hideImageOverlay();
        
        // Create image overlay
        const imageOverlay = document.createElement('div');
        imageOverlay.className = 'agentlet-image-overlay';
        imageOverlay.innerHTML = `<img src="${this.core.config.minimizeWithImage}" alt="Agentlet" />`;
        
        // Add click handler to toggle collapse
        imageOverlay.addEventListener('click', () => {
            this.toggleCollapse();
        });
        
        // Add to document (the shadow root when shadowDom is enabled, otherwise document.body)
        this.ensureRoot();
        this.ui.root.appendChild(imageOverlay);

        // Store reference
        this.ui.imageOverlay = imageOverlay;
    }

    hideImageOverlay() {
        if (this.ui.imageOverlay) {
            this.ui.imageOverlay.remove();
            this.ui.imageOverlay = null;
        }
    }

    ensureImageOverlay() {
        if (this.core.config.minimizeWithImage && typeof this.core.config.minimizeWithImage === 'string') {
            this.showImageOverlay();
        }
    }

    // Additional methods will be added in chunks
}