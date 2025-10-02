/**
 * AuthManager - Customizable authentication utility for Agentlet Core
 * Provides popup-based authentication with customizable IDP integration
 */

class AuthManager {
    constructor(config = {}) {
        this.config = {
            // Authentication button configuration
            enabled: config.enabled || false,
            buttonText: config.buttonText || 'Login',
            buttonIcon: config.buttonIcon || '🔐',
            
            // Popup configuration
            loginUrl: config.loginUrl || '',
            popupWidth: config.popupWidth || 400,
            popupHeight: config.popupHeight || 600,
            popupFeatures: config.popupFeatures || 'scrollbars=yes,resizable=yes,status=no,location=no,toolbar=no,menubar=no',
            
            // Token extraction configuration
            tokenExtractor: config.tokenExtractor || null, // Custom function to extract token
            messageHandler: config.messageHandler || null, // Custom message handler
            
            // Events
            onSuccess: config.onSuccess || null,
            onError: config.onError || null,
            onCancel: config.onCancel || null,
            
            // Security
            allowedOrigins: config.allowedOrigins || [],
            
            ...config
        };
        
        this.isAuthenticating = false;
        this.authPopup = null;
        this.messageListener = null;
        this.loginButton = null;
        this.authenticatedUser = null;

        console.log('AuthManager initialized with config:', this.config);
    }

    /**
     * Check if authentication is enabled
     */
    isEnabled() {
        return this.config.enabled && this.config.loginUrl;
    }

    /**
     * Create the login button element
     */
    createLoginButton(onClick) {
        if (!this.isEnabled()) {
            return null;
        }

        const button = document.createElement('button');
        button.className = 'agentlet-action-btn agentlet-auth-btn';
        button.title = this.config.buttonText;
        button.onclick = onClick || (() => this.handleButtonClick());

        // Store reference to button for updates
        this.loginButton = button;

        // Set initial button content
        this.updateButtonContent();
        
        // Apply button styling (will be styled via theme in main application)
        button.style.cssText = `
            background: #28a745;
            border: 1px solid #1e7e34;
            border-radius: 4px;
            padding: 6px 12px;
            margin-right: 8px;
            cursor: pointer;
            font-size: 12px;
            color: white;
            transition: all 0.3s ease;
        `;
        
        // Hover effects
        button.onmouseenter = () => {
            button.style.background = '#218838';
            button.style.borderColor = '#1e7e34';
        };
        
        button.onmouseleave = () => {
            button.style.background = '#28a745';
            button.style.borderColor = '#1e7e34';
        };
        
        return button;
    }

    /**
     * Start the authentication process
     */
    // eslint-disable-next-line require-await
    async startAuthentication() {
        if (this.isAuthenticating) {
            console.warn('Authentication already in progress');
            return;
        }

        if (!this.config.loginUrl) {
            const error = 'Login URL not configured';
            console.error('AuthManager:', error);
            this.handleError(new Error(error));
            return;
        }

        try {
            this.isAuthenticating = true;
            console.log('Starting authentication flow...');
            
            // Open popup window
            this.authPopup = this.openAuthPopup();
            
            // Set up message listener
            this.setupMessageListener();
            
            // Monitor popup closure
            this.monitorPopupClosure();
            
        } catch (error) {
            console.error('Failed to start authentication:', error);
            this.handleError(error);
        }
    }

    /**
     * Open the authentication popup window
     */
    openAuthPopup() {
        const { loginUrl, popupWidth, popupHeight, popupFeatures } = this.config;
        
        // Calculate popup position (center of screen)
        const left = Math.round((screen.width - popupWidth) / 2);
        const top = Math.round((screen.height - popupHeight) / 2);
        
        const features = `${popupFeatures},width=${popupWidth},height=${popupHeight},left=${left},top=${top}`;
        
        console.log(`Opening auth popup: ${loginUrl}`);
        const popup = window.open(loginUrl, 'agentlet_auth', features);
        
        if (!popup) {
            throw new Error('Failed to open authentication popup. Please allow popups for this site.');
        }
        
        return popup;
    }

    /**
     * Set up message listener for popup communication
     */
    setupMessageListener() {
        this.messageListener = (event) => {
            // Security check: verify origin if configured
            if (this.config.allowedOrigins.length > 0) {
                if (!this.config.allowedOrigins.includes(event.origin)) {
                    console.warn('AuthManager: Ignoring message from unauthorized origin:', event.origin);
                    return;
                }
            }
            
            console.log('AuthManager: Received message from popup:', event.data);
            
            try {
                // Use custom message handler if provided
                if (this.config.messageHandler) {
                    const result = this.config.messageHandler(event.data, this);

                    // If custom handler returns a result, process it
                    if (result) {
                        if (result.success) {
                            this.handleSuccess(result.accessToken || result.token, result);
                        } else if (result.cancelled) {
                            this.handleCancel();
                        } else {
                            this.handleError(new Error(result.error || 'Authentication failed'));
                        }
                    }
                    // If result is null/undefined, fall back to default handling
                    else {
                        this.handleAuthMessage(event.data);
                    }
                } else {
                    // Default message handling
                    this.handleAuthMessage(event.data);
                }
            } catch (error) {
                console.error('Error handling auth message:', error);
                this.handleError(error);
            }
        };
        
        window.addEventListener('message', this.messageListener);
    }

    /**
     * Default message handler for authentication
     */
    handleAuthMessage(data) {
        // Expected message format: { type: 'auth_result', success: true/false, token?: string, error?: string }
        if (data && typeof data === 'object') {
            if (data.type === 'auth_result') {
                if (data.success && data.token) {
                    this.handleSuccess(data.token, data);
                } else {
                    this.handleError(new Error(data.error || 'Authentication failed'));
                }
            } else if (data.type === 'auth_cancel') {
                this.handleCancel();
            }
        } else if (typeof data === 'string') {
            // Try to extract token using custom extractor
            if (this.config.tokenExtractor) {
                try {
                    const token = this.config.tokenExtractor(data);
                    if (token) {
                        this.handleSuccess(token, { rawData: data });
                        return;
                    }
                } catch (error) {
                    console.error('Token extraction failed:', error);
                }
            }
            
            // Default: treat string as potential token
            if (data.trim()) {
                this.handleSuccess(data.trim(), { rawData: data });
            } else {
                this.handleError(new Error('Empty authentication response'));
            }
        }
    }

    /**
     * Monitor popup closure
     */
    monitorPopupClosure() {
        const checkClosed = () => {
            if (this.authPopup && this.authPopup.closed) {
                console.log('Auth popup was closed by user');
                this.handleCancel();
            } else if (this.isAuthenticating) {
                setTimeout(checkClosed, 1000);
            }
        };
        
        setTimeout(checkClosed, 1000);
    }

    /**
     * Handle successful authentication
     */
    handleSuccess(token, additionalData = {}) {
        console.log('Authentication successful');

        this.cleanup();

        // Store user info from authentication result
        this.authenticatedUser = additionalData.user_info || additionalData.userInfo || null;

        // Update button to show user info
        this.updateButtonContent();

        const result = {
            success: true,
            token,
            timestamp: new Date().toISOString(),
            userInfo: this.authenticatedUser,
            ...additionalData
        };

        if (this.config.onSuccess) {
            try {
                this.config.onSuccess(result);
            } catch (error) {
                console.error('Error in onSuccess callback:', error);
            }
        }
        
        // Emit event if eventBus is available
        if (window.agentlet && window.agentlet.eventBus) {
            window.agentlet.eventBus.emit('auth:success', result);
        }
    }

    /**
     * Handle authentication error
     */
    handleError(error) {
        console.error('Authentication error:', error.message);
        
        this.cleanup();
        
        const result = {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
        
        if (this.config.onError) {
            try {
                this.config.onError(result);
            } catch (callbackError) {
                console.error('Error in onError callback:', callbackError);
            }
        }
        
        // Emit event if eventBus is available
        if (window.agentlet && window.agentlet.eventBus) {
            window.agentlet.eventBus.emit('auth:error', result);
        }
    }

    /**
     * Handle authentication cancellation
     */
    handleCancel() {
        console.log('Authentication cancelled by user');
        
        this.cleanup();
        
        const result = {
            success: false,
            cancelled: true,
            timestamp: new Date().toISOString()
        };
        
        if (this.config.onCancel) {
            try {
                this.config.onCancel(result);
            } catch (error) {
                console.error('Error in onCancel callback:', error);
            }
        }
        
        // Emit event if eventBus is available
        if (window.agentlet && window.agentlet.eventBus) {
            window.agentlet.eventBus.emit('auth:cancel', result);
        }
    }

    /**
     * Clean up authentication state
     */
    cleanup() {
        this.isAuthenticating = false;
        
        // Close popup if still open
        if (this.authPopup && !this.authPopup.closed) {
            this.authPopup.close();
        }
        this.authPopup = null;
        
        // Remove message listener
        if (this.messageListener) {
            window.removeEventListener('message', this.messageListener);
            this.messageListener = null;
        }
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = {
            ...this.config,
            ...newConfig
        };
        
        console.log('AuthManager config updated:', this.config);
    }

    /**
     * Get current authentication state
     */
    getState() {
        return {
            enabled: this.isEnabled(),
            authenticating: this.isAuthenticating,
            popupOpen: this.authPopup && !this.authPopup.closed
        };
    }

    /**
     * Handle button click - either logout if authenticated or start authentication
     */
    async handleButtonClick() {
        if (this.authenticatedUser) {
            await this.logout();
        } else {
            this.startAuthentication();
        }
    }

    /**
     * Update button content based on authentication state
     */
    updateButtonContent() {
        if (!this.loginButton) return;

        if (this.authenticatedUser) {
            // Show user initials or name
            const initials = this.getUserInitials(this.authenticatedUser);
            const displayName = this.authenticatedUser.name || this.authenticatedUser.username || initials;

            this.loginButton.innerHTML = `👤 ${initials}`;
            this.loginButton.title = `Logged in as ${displayName}. Click to logout.`;

            // Update styling for authenticated state
            this.loginButton.style.background = '#007bff';
            this.loginButton.style.borderColor = '#0056b3';
        } else {
            // Show login state
            this.loginButton.innerHTML = `${this.config.buttonIcon} ${this.config.buttonText}`;
            this.loginButton.title = this.config.buttonText;

            // Reset to login styling
            this.loginButton.style.background = '#28a745';
            this.loginButton.style.borderColor = '#1e7e34';
        }
    }

    /**
     * Extract user initials from user info
     */
    getUserInitials(userInfo) {
        if (!userInfo) return 'U';

        // Try to get initials from name first
        if (userInfo.name) {
            const nameParts = userInfo.name.trim().split(/\s+/);
            if (nameParts.length >= 2) {
                return (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase();
            } else if (nameParts.length === 1) {
                return nameParts[0].substring(0, 2).toUpperCase();
            }
        }

        // Fallback to username
        if (userInfo.username) {
            const username = userInfo.username;
            if (username.includes('.')) {
                // For usernames like "john.doe", extract "JD"
                const parts = username.split('.');
                return (parts[0][0] + parts[1][0]).toUpperCase();
            } else if (username.includes('_')) {
                // For usernames like "john_doe", extract "JD"
                const parts = username.split('_');
                return (parts[0][0] + parts[1][0]).toUpperCase();
            } else {
                // Single word username, take first 2 characters
                return username.substring(0, 2).toUpperCase();
            }
        }

        // Final fallback
        return 'U';
    }

    /**
     * Logout user and reset authentication state
     */
    async logout() {
        if (!this.authenticatedUser) {
            console.warn('No user is currently authenticated');
            return;
        }

        // Show confirmation dialog
        const userName = this.authenticatedUser.name || this.authenticatedUser.username || 'Unknown User';
        const confirmed = await this.showLogoutConfirmation(userName);

        if (!confirmed) {
            console.log('Logout cancelled by user');
            return;
        }

        console.log('Logging out user');

        this.authenticatedUser = null;
        this.updateButtonContent();

        // Emit logout event if eventBus is available
        if (window.agentlet && window.agentlet.eventBus) {
            window.agentlet.eventBus.emit('auth:logout', {
                success: true,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Show logout confirmation dialog
     */
    async showLogoutConfirmation(userName) {
        // Check if Dialog utility is available
        if (!window.agentlet || !window.agentlet.utils || !window.agentlet.utils.Dialog) {
            console.warn('Dialog utility not available, proceeding with logout');
            return true;
        }

        try {
            const Dialog = window.agentlet.utils.Dialog;

            // Wrap the callback-based Dialog.confirm in a Promise
            return new Promise((resolve) => {
                Dialog.confirm(
                    `You're currently logged in as ${userName}, do you want to logout?`,
                    'Confirm Logout',
                    (result) => {
                        console.log('Dialog result received:', result);
                        resolve(result === 'confirm');
                    }
                );
            });
        } catch (error) {
            console.error('Error showing logout confirmation dialog:', error);
            // If dialog fails, default to proceeding with logout
            return true;
        }
    }

    /**
     * Create a proxy for safe external access
     */
    createProxy() {
        return {
            isEnabled: () => this.isEnabled(),
            startAuthentication: () => this.startAuthentication(),
            logout: () => this.logout(),
            getState: () => this.getState(),
            getAuthenticatedUser: () => this.authenticatedUser,
            updateConfig: (config) => this.updateConfig(config)
        };
    }
}

export default AuthManager;