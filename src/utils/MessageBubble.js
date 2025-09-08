/**
 * Message Bubble Utility for Agentlet Core
 * Provides toast-style notifications and messages
 */
import { Z_INDEX } from './ZIndexConstants.js';
export default class MessageBubble {
    constructor() {
        this.bubbles = new Map();
        this.bubbleCounter = 0;
        this.container = null;
        this.initialized = false;
    }

    /**
     * Initialize the bubble container
     */
    init() {
        if (this.initialized) return;

        const $ = window.agentlet.$;
        this.container = $('<div>')[0];
        this.container.id = 'agentlet-message-bubbles';
        this.container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: ${Z_INDEX.MESSAGE_BUBBLE};
            pointer-events: none;
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-width: 400px;
        `;

        $(document.body).append(this.container);
        this.addStyles();
        this.initialized = true;
    }

    /**
     * Show a message bubble
     * @param {Object} options - Bubble configuration
     * @param {string} options.message - Message text
     * @param {string} options.type - Type: 'info', 'success', 'warning', 'error', 'custom'
     * @param {string} options.title - Optional title
     * @param {string} options.icon - Optional icon (emoji or HTML)
     * @param {number} options.duration - Auto-hide duration in ms (0 = manual close only)
     * @param {boolean} options.closable - Whether to show close button (default: true)
     * @param {boolean} options.allowHtml - Whether to allow HTML in message (default: false)
     * @param {string} options.position - Position: 'top-right', 'top-left', 'bottom-right', 'bottom-left'
     * @param {Object} options.style - Custom style overrides
     * @param {Function} options.onClick - Click handler
     * @param {Function} options.onClose - Close handler
     * @returns {string} Bubble ID for later reference
     */
    show(options = {}) {
        if (!this.initialized) this.init();

        const {
            message = 'No message',
            type = 'info',
            title = null,
            icon = null,
            duration = 5000,
            closable = true,
            allowHtml = false,
            position = 'top-right',
            style = {},
            onClick = null,
            onClose = null
        } = options;

        // Update container position if needed
        this.updateContainerPosition(position);

        const bubbleId = `bubble-${++this.bubbleCounter}`;
        const bubble = this.createBubble(bubbleId, message, type, title, icon, closable, allowHtml, style, onClick, onClose);

        // Store bubble reference
        this.bubbles.set(bubbleId, {
            element: bubble,
            timer: null,
            options: options
        });

        // Add to container
        const $ = window.agentlet.$;
        $(this.container).append(bubble);

        // Animate in
        setTimeout(() => {
            bubble.style.transform = 'translateX(0)';
            bubble.style.opacity = '1';
        }, 10);

        // Set auto-hide timer
        if (duration > 0) {
            this.setAutoHide(bubbleId, duration);
        }

        return bubbleId;
    }

    /**
     * Create bubble element
     */
    createBubble(bubbleId, message, type, title, icon, closable, allowHtml, customStyle, onClick, onClose) {
        const $ = window.agentlet.$;
        const bubble = $('<div>')[0];
        bubble.id = bubbleId;
        bubble.className = `agentlet-bubble agentlet-bubble-${type}`;

        // Get type-specific styling
        const typeStyle = this.getTypeStyle(type);

        // Base bubble styling
        bubble.style.cssText = `
            background: ${typeStyle.background};
            color: ${typeStyle.color};
            border: ${typeStyle.border};
            border-radius: 8px;
            padding: 12px 16px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            line-height: 1.4;
            max-width: 100%;
            word-wrap: break-word;
            position: relative;
            pointer-events: auto;
            cursor: ${onClick ? 'pointer' : 'default'};
            transform: translateX(100%);
            opacity: 0;
            transition: all 0.3s ease-out;
            border-left: 4px solid ${typeStyle.accent};
        `;

        // Apply custom styles
        Object.assign(bubble.style, customStyle);

        // Create content
        const content = $('<div>')[0];
        content.style.cssText = `
            display: flex;
            align-items: flex-start;
            gap: 10px;
        `;

        // Add icon if provided or use type default
        const displayIcon = icon || typeStyle.defaultIcon;
        if (displayIcon) {
            const iconEl = $('<span>')[0];
            iconEl.style.cssText = `
                font-size: 18px;
                line-height: 1;
                flex-shrink: 0;
                margin-top: 1px;
            `;
            iconEl.innerHTML = displayIcon;
            content.appendChild(iconEl);
        }

        // Create text content
        const textContent = $('<div>')[0];
        textContent.style.cssText = `
            flex: 1;
            min-width: 0;
        `;

        // Add title if provided
        if (title) {
            const titleEl = $('<div>')[0];
            titleEl.style.cssText = `
                font-weight: 600;
                margin-bottom: 4px;
                font-size: 15px;
            `;
            titleEl.textContent = title;
            textContent.appendChild(titleEl);
        }

        // Add message
        const messageEl = $('<div>')[0];
        if (allowHtml) {
            messageEl.innerHTML = message;
        } else {
            messageEl.textContent = message;
        }
        textContent.appendChild(messageEl);

        content.appendChild(textContent);

        // Add close button if closable
        if (closable) {
            const closeBtn = $('<button>')[0];
            closeBtn.innerHTML = '×';
            closeBtn.style.cssText = `
                position: absolute;
                top: 8px;
                right: 8px;
                background: none;
                border: none;
                color: inherit;
                font-size: 18px;
                cursor: pointer;
                opacity: 0.7;
                transition: opacity 0.2s ease;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0;
            `;

            closeBtn.addEventListener('mouseenter', () => {
                closeBtn.style.opacity = '1';
            });

            closeBtn.addEventListener('mouseleave', () => {
                closeBtn.style.opacity = '0.7';
            });

            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.hide(bubbleId);
            });

            bubble.appendChild(closeBtn);

            // Add padding for close button
            content.style.paddingRight = '24px';
        }

        bubble.appendChild(content);

        // Add click handler
        if (onClick) {
            bubble.addEventListener('click', onClick);
        }

        // Add close handler
        if (onClose) {
            bubble.addEventListener('agentlet-bubble-close', onClose);
        }

        return bubble;
    }

    /**
     * Get styling for bubble type
     */
    getTypeStyle(type) {
        const styles = {
            info: {
                background: '#e3f2fd',
                color: '#1565c0',
                border: '1px solid #bbdefb',
                accent: '#2196f3',
                defaultIcon: 'ℹ️'
            },
            success: {
                background: '#e8f5e8',
                color: '#2e7d32',
                border: '1px solid #c8e6c9',
                accent: '#4caf50',
                defaultIcon: '✅'
            },
            warning: {
                background: '#fff3e0',
                color: '#ef6c00',
                border: '1px solid #ffcc02',
                accent: '#ff9800',
                defaultIcon: '⚠️'
            },
            error: {
                background: '#ffebee',
                color: '#c62828',
                border: '1px solid #ffcdd2',
                accent: '#f44336',
                defaultIcon: '❌'
            },
            custom: {
                background: '#f5f5f5',
                color: '#333',
                border: '1px solid #ddd',
                accent: '#666',
                defaultIcon: null
            }
        };

        return styles[type] || styles.info;
    }

    /**
     * Update container position
     */
    updateContainerPosition(position) {
        if (!this.container) return;

        const positions = {
            'top-right': { top: '20px', right: '20px', left: 'auto', bottom: 'auto' },
            'top-left': { top: '20px', left: '20px', right: 'auto', bottom: 'auto' },
            'bottom-right': { bottom: '20px', right: '20px', left: 'auto', top: 'auto' },
            'bottom-left': { bottom: '20px', left: '20px', right: 'auto', top: 'auto' }
        };

        const pos = positions[position] || positions['top-right'];
        Object.assign(this.container.style, pos);

        // Reverse flex direction for bottom positions
        if (position.includes('bottom')) {
            this.container.style.flexDirection = 'column-reverse';
        } else {
            this.container.style.flexDirection = 'column';
        }
    }

    /**
     * Set auto-hide timer for bubble
     */
    setAutoHide(bubbleId, duration) {
        const bubbleData = this.bubbles.get(bubbleId);
        if (!bubbleData) return;

        bubbleData.timer = setTimeout(() => {
            this.hide(bubbleId);
        }, duration);
    }

    /**
     * Hide a specific bubble
     */
    hide(bubbleId) {
        const bubbleData = this.bubbles.get(bubbleId);
        if (!bubbleData) return;

        // Clear timer
        if (bubbleData.timer) {
            clearTimeout(bubbleData.timer);
        }

        // Animate out
        const bubble = bubbleData.element;
        bubble.style.transform = 'translateX(100%)';
        bubble.style.opacity = '0';

        // Dispatch close event
        bubble.dispatchEvent(new CustomEvent('agentlet-bubble-close', { detail: { bubbleId } }));

        // Remove after animation
        setTimeout(() => {
            if (bubble.parentNode) {
                bubble.remove();
            }
            this.bubbles.delete(bubbleId);
        }, 300);
    }

    /**
     * Hide all bubbles
     */
    hideAll() {
        const bubbleIds = Array.from(this.bubbles.keys());
        bubbleIds.forEach(id => this.hide(id));
    }

    /**
     * Add CSS styles for bubbles
     */
    addStyles() {
        const $ = window.agentlet.$;
        if (!$('#agentlet-bubble-styles').length) {
            const style = $('<style>')[0];
            style.id = 'agentlet-bubble-styles';
            style.textContent = `
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
            $(document.head).append(style);
        }
    }

    /**
     * Convenience method for info bubble
     */
    info(message, options = {}) {
        return this.show({ ...options, message, type: 'info' });
    }

    /**
     * Convenience method for success bubble
     */
    success(message, options = {}) {
        return this.show({ ...options, message, type: 'success' });
    }

    /**
     * Convenience method for warning bubble
     */
    warning(message, options = {}) {
        return this.show({ ...options, message, type: 'warning' });
    }

    /**
     * Convenience method for error bubble
     */
    error(message, options = {}) {
        return this.show({ ...options, message, type: 'error' });
    }

    /**
     * Convenience method for custom bubble
     */
    custom(message, options = {}) {
        return this.show({ ...options, message, type: 'custom' });
    }

    /**
     * Show temporary message (auto-hide)
     */
    toast(message, type = 'info', duration = 3000) {
        return this.show({
            message,
            type,
            duration,
            closable: false
        });
    }

    /**
     * Show persistent message (manual close only)
     */
    notify(message, type = 'info', title = null) {
        return this.show({
            message,
            type,
            title,
            duration: 0,
            closable: true
        });
    }

    /**
     * Show loading message
     */
    loading(message = 'Loading...', options = {}) {
        return this.show({
            ...options,
            message,
            type: 'custom',
            icon: '⏳',
            duration: 0,
            closable: false,
            style: {
                background: '#f0f9ff',
                color: '#0369a1',
                border: '1px solid #bae6fd'
            }
        });
    }

    /**
     * Get bubble count
     */
    getCount() {
        return this.bubbles.size;
    }

    /**
     * Get bubble by ID
     */
    getBubble(bubbleId) {
        return this.bubbles.get(bubbleId);
    }

    /**
     * Check if bubble exists
     */
    exists(bubbleId) {
        return this.bubbles.has(bubbleId);
    }

    /**
     * Update bubble message
     */
    updateMessage(bubbleId, newMessage, allowHtml = false) {
        const bubbleData = this.bubbles.get(bubbleId);
        if (!bubbleData) return false;

        const messageEl = bubbleData.element.querySelector('div > div:last-child');
        if (messageEl) {
            if (allowHtml) {
                messageEl.innerHTML = newMessage;
            } else {
                messageEl.textContent = newMessage;
            }
            return true;
        }
        return false;
    }

    /**
     * Cleanup - remove all bubbles and container
     */
    cleanup() {
        this.hideAll();
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        this.initialized = false;
    }
}