/**
 * Message Bubble Utility for Agentlet Core
 * Provides toast-style notifications and messages
 */
import { Z_INDEX } from './ZIndex.js';
import type { MessageBubbleAPI, MessageBubbleOptions, MessageBubbleRecord, MessageBubbleType } from '../../types/public-api';

/** Per-type visual styling used by `createBubble()`/`getTypeStyle()`. */
interface MessageBubbleTypeStyle {
    background: string;
    color: string;
    border: string;
    accent: string;
    defaultIcon: string | null;
}

/** The subset of container CSS properties `updateContainerPosition()` toggles per position. */
interface MessageBubbleContainerPosition {
    top: string;
    right: string;
    bottom: string;
    left: string;
}

class MessageBubble implements MessageBubbleAPI {
    bubbles: Map<string, MessageBubbleRecord>;
    bubbleCounter: number;
    container: HTMLDivElement | null;
    initialized: boolean;
    // UI mount root (ShadowRoot, or an HTMLElement/document.body). Resolved
    // lazily via getRoot() - see setRoot()/getRoot() - since init() only
    // runs on first show(), by which time AgentletCore's root normally
    // already exists.
    root: ShadowRoot | HTMLElement | null;

    constructor() {
        this.bubbles = new Map();
        this.bubbleCounter = 0;
        this.container = null;
        this.initialized = false;
        this.root = null;
    }

    /**
     * Explicitly set the root this message bubble container mounts into.
     * Called by GlobalAPI / AgentletCore once the shadow root (or
     * document.body, in legacy mode) is available.
     */
    setRoot(root: ShadowRoot | HTMLElement | null): void {
        this.root = root || null;
    }

    /**
     * Resolve the element/root the bubble container should mount into.
     * Resolution order mirrors Dialog.getRoot(): an explicitly set root, then
     * window.agentlet.ui.root, then document.body for standalone use.
     */
    getRoot(): ShadowRoot | HTMLElement {
        if (this.root) {
            return this.root;
        }
        if (typeof window !== 'undefined' && window.agentlet?.ui?.root) {
            return window.agentlet.ui.root;
        }
        return document.body;
    }

    /**
     * Initialize the bubble container
     */
    init(): void {
        if (this.initialized) return;

        this.container = document.createElement('div');
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

        this.getRoot().appendChild(this.container);
        this.addStyles();
        this.initialized = true;
    }

    /**
     * Show a message bubble
     * @param options - Bubble configuration
     * @returns Bubble ID for later reference
     */
    show(options: MessageBubbleOptions = {}): string {
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
        (this.container as HTMLDivElement).appendChild(bubble);

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
    createBubble(
        bubbleId: string,
        message: string,
        type: MessageBubbleType,
        title: string | null,
        icon: string | null,
        closable: boolean,
        allowHtml: boolean,
        customStyle: Partial<CSSStyleDeclaration>,
        onClick: ((event: MouseEvent) => void) | null,
        onClose: ((event: CustomEvent) => void) | null
    ): HTMLDivElement {
        const bubble = document.createElement('div');
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
        const content = document.createElement('div');
        content.style.cssText = `
            display: flex;
            align-items: flex-start;
            gap: 10px;
        `;

        // Add icon if provided or use type default
        const displayIcon = icon || typeStyle.defaultIcon;
        if (displayIcon) {
            const iconEl = document.createElement('span');
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
        const textContent = document.createElement('div');
        textContent.style.cssText = `
            flex: 1;
            min-width: 0;
        `;

        // Add title if provided
        if (title) {
            const titleEl = document.createElement('div');
            titleEl.style.cssText = `
                font-weight: 600;
                margin-bottom: 4px;
                font-size: 15px;
            `;
            titleEl.textContent = title;
            textContent.appendChild(titleEl);
        }

        // Add message
        const messageEl = document.createElement('div');
        if (allowHtml) {
            messageEl.innerHTML = message;
        } else {
            messageEl.textContent = message;
        }
        textContent.appendChild(messageEl);

        content.appendChild(textContent);

        // Add close button if closable
        if (closable) {
            const closeBtn = document.createElement('button');
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
            bubble.addEventListener('agentlet-bubble-close', onClose as EventListener);
        }

        return bubble;
    }

    /**
     * Get styling for bubble type
     */
    getTypeStyle(type: MessageBubbleType): MessageBubbleTypeStyle {
        const styles: Record<MessageBubbleType, MessageBubbleTypeStyle> = {
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
    updateContainerPosition(position: string): void {
        if (!this.container) return;

        const positions: Record<string, MessageBubbleContainerPosition> = {
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
    setAutoHide(bubbleId: string, duration: number): void {
        const bubbleData = this.bubbles.get(bubbleId);
        if (!bubbleData) return;

        bubbleData.timer = setTimeout(() => {
            this.hide(bubbleId);
        }, duration);
    }

    /**
     * Hide a specific bubble
     */
    hide(bubbleId: string): void {
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
    hideAll(): void {
        const bubbleIds = Array.from(this.bubbles.keys());
        bubbleIds.forEach(id => this.hide(id));
    }

    /**
     * Add CSS styles for bubbles.
     *
     * These rules normally live in AgentletCore's own stylesheet (see
     * StyleInjector.generateBubbleStyles()), injected once for the whole UI.
     * This method is only a fallback for standalone use of MessageBubble (no
     * AgentletCore instance around it) and is a no-op whenever a core
     * stylesheet is already present, in the root or in <head>.
     *
     * Idempotent per root: safe to call every time init() runs.
     */
    addStyles(): void {
        const root = this.getRoot();

        // A core stylesheet already covers these rules: nothing to do.
        // (document.body has no adoptedStyleSheets of its own, so this only
        // ever matches a shadow root - no need to reference ShadowRoot
        // directly, which also isn't declared as an ESLint browser global.)
        const hasAdoptedCoreStyles = Array.isArray((root as ShadowRoot).adoptedStyleSheets) &&
            (root as ShadowRoot).adoptedStyleSheets.length > 0;
        const hasCoreStyleInRoot = typeof root.querySelector === 'function' &&
            !!root.querySelector('#agentlet-core-styles');
        const hasCoreStyleInHead = typeof document !== 'undefined' &&
            !!document.getElementById('agentlet-core-styles');
        if (hasAdoptedCoreStyles || hasCoreStyleInRoot || hasCoreStyleInHead) {
            return;
        }

        // Fallback target: <head> when mounting on document.body (legacy
        // mode / no root yet), otherwise the root itself (shadow root).
        const target = root === document.body ? document.head : root;
        if (!target || typeof target.querySelector !== 'function' || target.querySelector('#agentlet-bubble-styles')) {
            return;
        }

        const style = document.createElement('style');
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
        target.appendChild(style);
    }

    /**
     * Convenience method for info bubble
     */
    info(message: string, options: MessageBubbleOptions = {}): string {
        return this.show({ ...options, message, type: 'info' });
    }

    /**
     * Convenience method for success bubble
     */
    success(message: string, options: MessageBubbleOptions = {}): string {
        return this.show({ ...options, message, type: 'success' });
    }

    /**
     * Convenience method for warning bubble
     */
    warning(message: string, options: MessageBubbleOptions = {}): string {
        return this.show({ ...options, message, type: 'warning' });
    }

    /**
     * Convenience method for error bubble
     */
    error(message: string, options: MessageBubbleOptions = {}): string {
        return this.show({ ...options, message, type: 'error' });
    }

    /**
     * Convenience method for custom bubble
     */
    custom(message: string, options: MessageBubbleOptions = {}): string {
        return this.show({ ...options, message, type: 'custom' });
    }

    /**
     * Show temporary message (auto-hide)
     */
    toast(message: string, type: MessageBubbleType = 'info', duration: number = 3000): string {
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
    notify(message: string, type: MessageBubbleType = 'info', title: string | null = null): string {
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
    loading(message: string = 'Loading...', options: MessageBubbleOptions = {}): string {
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
    getCount(): number {
        return this.bubbles.size;
    }

    /**
     * Get bubble by ID
     */
    getBubble(bubbleId: string): MessageBubbleRecord | undefined {
        return this.bubbles.get(bubbleId);
    }

    /**
     * Check if bubble exists
     */
    exists(bubbleId: string): boolean {
        return this.bubbles.has(bubbleId);
    }

    /**
     * Update bubble message
     */
    updateMessage(bubbleId: string, newMessage: string, allowHtml: boolean = false): boolean {
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
    cleanup(): void {
        this.hideAll();
        if (this.container) {
            this.container.remove();
            this.container = null;
        }
        this.initialized = false;
    }
}

export default MessageBubble;
