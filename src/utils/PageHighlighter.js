/**
 * PageHighlighter - Utility for highlighting elements and showing overlays on web pages
 * 
 * Features:
 * - Full-screen overlays with messages and progress bars
 * - Element highlighting with various visual indicators
 * - Dynamic control of highlights (show/hide/update/destroy)
 * - Multiple highlight types (border, arrow, sticker, pulse)
 * - Animation support and accessibility features
 */

class PageHighlighter {
    constructor() {
        this.overlays = new Map();
        this.highlights = new Map();
        this.nextId = 1;
        this.styleInjected = false;
        this.ensureStyles();
    }

    /**
     * Inject CSS styles for highlighting functionality
     */
    ensureStyles() {
        if (this.styleInjected) return;

        const styles = `
            /* Base overlay styles */
            .agentlet-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 999998;
                pointer-events: auto;
                transition: opacity 0.3s ease;
            }

            .agentlet-overlay.fade-in {
                opacity: 0;
                animation: agentletFadeIn 0.3s ease forwards;
            }

            .agentlet-overlay.fade-out {
                animation: agentletFadeOut 0.3s ease forwards;
            }

            /* Message overlay container - full width banners that stick to viewport */
            .agentlet-message-overlay {
                position: fixed;
                left: 0;
                right: 0;
                width: 100%;
                z-index: 999999;
                pointer-events: auto;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }

            .agentlet-message-overlay.top {
                top: 0;
            }

            .agentlet-message-overlay.bottom {
                bottom: 0;
            }

            .agentlet-message-overlay.center {
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: auto;
                max-width: 90%;
                min-width: 400px;
            }

            /* Message content - full width banner style */
            .agentlet-message-content {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px 24px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                text-align: center;
                font-size: 16px;
                font-weight: 500;
                line-height: 1.4;
                position: relative;
                animation: agentletSlideIn 0.4s ease forwards;
            }

            /* Center style gets different styling */
            .agentlet-message-overlay.center .agentlet-message-content {
                border-radius: 12px;
                padding: 24px 32px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
                background: white;
                color: #333;
            }

            /* Type-specific styling for banner messages */
            .agentlet-message-content.info {
                background: linear-gradient(135deg, #007cba 0%, #0056b3 100%);
                color: white;
            }

            .agentlet-message-content.success {
                background: linear-gradient(135deg, #28a745 0%, #1e7e34 100%);
                color: white;
            }

            .agentlet-message-content.warning {
                background: linear-gradient(135deg, #ffc107 0%, #e0a800 100%);
                color: #333;
            }

            .agentlet-message-content.error {
                background: linear-gradient(135deg, #dc3545 0%, #c82333 100%);
                color: white;
            }

            /* Center overlays keep their original styling */
            .agentlet-message-overlay.center .agentlet-message-content.info {
                background: white;
                color: #333;
                border-left: 4px solid #007cba;
            }

            .agentlet-message-overlay.center .agentlet-message-content.success {
                background: white;
                color: #333;
                border-left: 4px solid #28a745;
            }

            .agentlet-message-overlay.center .agentlet-message-content.warning {
                background: white;
                color: #333;
                border-left: 4px solid #ffc107;
            }

            .agentlet-message-overlay.center .agentlet-message-content.error {
                background: white;
                color: #333;
                border-left: 4px solid #dc3545;
            }

            /* Close button */
            .agentlet-message-close {
                position: absolute;
                top: 50%;
                right: 16px;
                transform: translateY(-50%);
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 14px;
                font-weight: bold;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s ease;
            }

            .agentlet-message-close:hover {
                background: rgba(255, 255, 255, 0.3);
            }

            /* Close button for center overlays */
            .agentlet-message-overlay.center .agentlet-message-close {
                background: rgba(0, 0, 0, 0.1);
                color: #666;
            }

            .agentlet-message-overlay.center .agentlet-message-close:hover {
                background: rgba(0, 0, 0, 0.2);
            }

            /* Close button for warning banners */
            .agentlet-message-content.warning .agentlet-message-close {
                background: rgba(0, 0, 0, 0.1);
                color: #333;
            }

            .agentlet-message-content.warning .agentlet-message-close:hover {
                background: rgba(0, 0, 0, 0.2);
            }

            .agentlet-message-text {
                font-size: 18px;
                font-weight: 500;
                color: #333;
                margin: 0;
                line-height: 1.4;
            }

            /* Progress bar styles */
            .agentlet-progress-container {
                margin-top: 16px;
                width: 100%;
            }

            .agentlet-progress-bar {
                width: 100%;
                height: 16px;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                overflow: hidden;
                border: 2px solid rgba(255, 255, 255, 0.6);
                margin: 8px 0;
            }

            .agentlet-progress-fill {
                height: 100%;
                background: #ffffff;
                border-radius: 6px;
                transition: width 0.3s ease;
                min-width: 4px;
                box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
            }

            .agentlet-progress-text {
                font-size: 14px;
                color: rgba(255, 255, 255, 0.9);
                margin-top: 8px;
                font-weight: 500;
            }

            /* Progress bar styling for center overlays (original style) */
            .agentlet-message-overlay.center .agentlet-progress-bar {
                background: #e9ecef;
            }

            .agentlet-message-overlay.center .agentlet-progress-fill {
                background: #007cba;
            }

            .agentlet-message-overlay.center .agentlet-progress-text {
                color: #666;
            }

            /* Specific progress styling for warning banners */
            .agentlet-message-content.warning .agentlet-progress-bar {
                background: rgba(0, 0, 0, 0.1);
            }

            .agentlet-message-content.warning .agentlet-progress-fill {
                background: rgba(0, 0, 0, 0.6);
            }

            .agentlet-message-content.warning .agentlet-progress-text {
                color: #333;
            }

            /* Element highlight styles */
            .agentlet-highlight-container {
                position: absolute;
                pointer-events: none;
                z-index: 999997;
                transition: all 0.3s ease;
            }

            .agentlet-highlight-border {
                position: absolute;
                border: 3px solid #007cba;
                border-radius: 8px;
                pointer-events: none;
                animation: agentletPulse 2s infinite;
            }

            .agentlet-highlight-border.primary {
                border-color: #007cba;
            }

            .agentlet-highlight-border.success {
                border-color: #28a745;
            }

            .agentlet-highlight-border.warning {
                border-color: #ffc107;
            }

            .agentlet-highlight-border.danger {
                border-color: #dc3545;
            }

            /* Arrow pointer */
            .agentlet-arrow {
                position: absolute;
                z-index: 999999;
                pointer-events: none;
            }

            .agentlet-arrow::before {
                content: '';
                position: absolute;
                width: 0;
                height: 0;
                border-style: solid;
            }

            .agentlet-arrow.top::before {
                border-left: 12px solid transparent;
                border-right: 12px solid transparent;
                border-bottom: 16px solid #007cba;
                top: -16px;
                left: 50%;
                transform: translateX(-50%);
            }

            .agentlet-arrow.bottom::before {
                border-left: 12px solid transparent;
                border-right: 12px solid transparent;
                border-top: 16px solid #007cba;
                bottom: -16px;
                left: 50%;
                transform: translateX(-50%);
            }

            .agentlet-arrow.left::before {
                border-top: 12px solid transparent;
                border-bottom: 12px solid transparent;
                border-right: 16px solid #007cba;
                right: -16px;
                top: 50%;
                transform: translateY(-50%);
            }

            .agentlet-arrow.right::before {
                border-top: 12px solid transparent;
                border-bottom: 12px solid transparent;
                border-left: 16px solid #007cba;
                left: -16px;
                top: 50%;
                transform: translateY(-50%);
            }

            /* Message tooltip */
            .agentlet-tooltip {
                position: absolute;
                background: #333;
                color: white;
                padding: 8px 12px;
                border-radius: 6px;
                font-size: 14px;
                white-space: nowrap;
                z-index: 1000000;
                pointer-events: none;
                animation: agentletFadeIn 0.3s ease;
            }

            .agentlet-tooltip::after {
                content: '';
                position: absolute;
                width: 0;
                height: 0;
                border-style: solid;
            }

            .agentlet-tooltip.top::after {
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-top: 6px solid #333;
                bottom: -6px;
                left: 50%;
                transform: translateX(-50%);
            }

            .agentlet-tooltip.bottom::after {
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-bottom: 6px solid #333;
                top: -6px;
                left: 50%;
                transform: translateX(-50%);
            }

            /* Sticker/badge styles */
            .agentlet-sticker {
                position: absolute;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: #007cba;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 16px;
                z-index: 999999;
                animation: agentletBounce 1s infinite;
                cursor: pointer;
            }

            .agentlet-sticker.success {
                background: #28a745;
            }

            .agentlet-sticker.warning {
                background: #ffc107;
            }

            .agentlet-sticker.danger {
                background: #dc3545;
            }

            /* Animations */
            @keyframes agentletFadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }

            @keyframes agentletFadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }

            @keyframes agentletSlideIn {
                from {
                    opacity: 0;
                    transform: translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            @keyframes agentletPulse {
                0%, 100% {
                    transform: scale(1);
                    opacity: 1;
                }
                50% {
                    transform: scale(1.05);
                    opacity: 0.8;
                }
            }

            @keyframes agentletBounce {
                0%, 20%, 50%, 80%, 100% {
                    transform: translateY(0);
                }
                40% {
                    transform: translateY(-10px);
                }
                60% {
                    transform: translateY(-5px);
                }
            }

            @keyframes agentletProgressShimmer {
                0% {
                    background-position: -200px 0;
                }
                100% {
                    background-position: calc(200px + 100%) 0;
                }
            }

            /* Clickable highlights */
            .agentlet-highlight-clickable {
                pointer-events: auto;
                cursor: pointer;
            }

            .agentlet-highlight-clickable:hover {
                transform: scale(1.02);
            }

            /* Responsive adjustments */
            @media (max-width: 768px) {
                .agentlet-message-content {
                    padding: 20px 24px;
                    margin: 0 16px;
                }

                .agentlet-message-text {
                    font-size: 16px;
                }

                .agentlet-tooltip {
                    font-size: 12px;
                    padding: 6px 10px;
                }
            }
        `;

        const styleElement = document.createElement('style');
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
        this.styleInjected = true;
    }

    /**
     * Show a full-screen overlay with message
     * @param {Object} options - Overlay configuration
     * @returns {Object} - Overlay control object
     */
    showOverlay(options = {}) {
        const config = {
            message: 'Loading...',
            position: 'center', // 'top', 'bottom', 'center'
            type: 'info', // 'info', 'success', 'warning', 'error', 'progress'
            progress: 0, // for progress type
            persistent: false,
            duration: 3000,
            onClick: null,
            overlay: false, // show semi-transparent background overlay
            closeable: false, // show close button
            ...options
        };

        const id = `overlay_${this.nextId++}`;
        let overlay = null;

        // Create optional background overlay
        if (config.overlay) {
            overlay = document.createElement('div');
            overlay.className = 'agentlet-overlay fade-in';
            overlay.id = id + '_bg';
        }

        // Create message container (this is the main element)
        const messageContainer = document.createElement('div');
        messageContainer.className = `agentlet-message-overlay ${config.position}`;
        messageContainer.id = id;

        // Create message content
        const messageContent = document.createElement('div');
        messageContent.className = `agentlet-message-content ${config.type}`;

        // Add message text
        const messageText = document.createElement('p');
        messageText.className = 'agentlet-message-text';
        messageText.textContent = config.message;
        messageContent.appendChild(messageText);

        // Add close button if requested
        if (config.closeable) {
            const closeButton = document.createElement('button');
            closeButton.className = 'agentlet-message-close';
            closeButton.innerHTML = '×';
            closeButton.title = 'Close';
            closeButton.onclick = (e) => {
                e.stopPropagation();
                this.hideOverlay(id);
            };
            messageContent.appendChild(closeButton);
        }

        // Add progress bar if needed
        if (config.type === 'progress') {
            console.log('🔧 Creating progress bar with progress:', config.progress);
            
            const progressContainer = document.createElement('div');
            progressContainer.className = 'agentlet-progress-container';

            const progressBar = document.createElement('div');
            progressBar.className = 'agentlet-progress-bar';

            const progressFill = document.createElement('div');
            progressFill.className = 'agentlet-progress-fill';
            progressFill.style.width = `${config.progress}%`;
            
            // Add some debugging styles to make sure it's visible
            progressFill.style.minWidth = config.progress === 0 ? '4px' : 'auto';

            const progressText = document.createElement('div');
            progressText.className = 'agentlet-progress-text';
            progressText.textContent = `${config.progress}%`;

            progressBar.appendChild(progressFill);
            progressContainer.appendChild(progressBar);
            progressContainer.appendChild(progressText);
            messageContent.appendChild(progressContainer);
            
            console.log('✅ Progress bar created and appended to message content');
        }

        messageContainer.appendChild(messageContent);

        // Add click handler
        if (config.onClick) {
            messageContent.addEventListener('click', config.onClick);
            messageContent.style.cursor = 'pointer';
        }

        // Add to page
        if (overlay) {
            document.body.appendChild(overlay);
        }
        document.body.appendChild(messageContainer);

        // Auto-hide if not persistent
        let timeoutId = null;
        if (!config.persistent && config.duration > 0) {
            timeoutId = setTimeout(() => {
                this.hideOverlay(id);
            }, config.duration);
        }

        // Store overlay reference
        const overlayControl = {
            id,
            element: messageContainer,
            backgroundOverlay: overlay,
            messageContent,
            config,
            timeoutId,

            update: (updates) => {
                Object.assign(config, updates);
                
                if (updates.message) {
                    messageText.textContent = updates.message;
                }
                
                if (updates.type && updates.type !== config.type) {
                    messageContent.className = `agentlet-message-content ${updates.type}`;
                }
                
                if (updates.progress !== undefined && config.type === 'progress') {
                    console.log('🔄 Updating progress to:', updates.progress + '%');
                    const progressContainer = messageContent.querySelector('.agentlet-progress-container');
                    const progressFill = progressContainer?.querySelector('.agentlet-progress-fill');
                    const progressText = progressContainer?.querySelector('.agentlet-progress-text');
                    console.log('🔍 Progress elements found:', { progressContainer: !!progressContainer, progressFill: !!progressFill, progressText: !!progressText });
                    if (progressFill && progressText) {
                        progressFill.style.width = `${updates.progress}%`;
                        progressText.textContent = `${updates.progress}%`;
                        console.log('✅ Progress updated to:', updates.progress + '%', 'Width set to:', progressFill.style.width);
                    } else {
                        console.error('❌ Progress elements not found!');
                    }
                }
            },

            hide: () => this.hideOverlay(id),
            destroy: () => this.destroyOverlay(id)
        };

        this.overlays.set(id, overlayControl);
        return overlayControl;
    }

    /**
     * Hide an overlay with fade animation
     * @param {string} id - Overlay ID
     */
    hideOverlay(id) {
        const overlay = this.overlays.get(id);
        if (!overlay) return;

        // Add fade out animation to both elements
        overlay.element.classList.add('fade-out');
        if (overlay.backgroundOverlay) {
            overlay.backgroundOverlay.classList.add('fade-out');
        }
        
        setTimeout(() => {
            this.destroyOverlay(id);
        }, 300);
    }

    /**
     * Destroy an overlay completely
     * @param {string} id - Overlay ID
     */
    destroyOverlay(id) {
        const overlay = this.overlays.get(id);
        if (!overlay) return;

        if (overlay.timeoutId) {
            clearTimeout(overlay.timeoutId);
        }

        // Remove main message container
        if (overlay.element && overlay.element.parentNode) {
            overlay.element.parentNode.removeChild(overlay.element);
        }

        // Remove background overlay if it exists
        if (overlay.backgroundOverlay && overlay.backgroundOverlay.parentNode) {
            overlay.backgroundOverlay.parentNode.removeChild(overlay.backgroundOverlay);
        }

        this.overlays.delete(id);
    }

    /**
     * Highlight an element on the page
     * @param {Element|string} element - Element or selector to highlight
     * @param {Object} options - Highlight configuration
     * @returns {Object} - Highlight control object
     */
    highlight(element, options = {}) {
        // Resolve element
        const targetElement = typeof element === 'string' ? 
            document.querySelector(element) : element;

        if (!targetElement) {
            console.warn('PageHighlighter: Element not found', element);
            return null;
        }

        const config = {
            type: 'border', // 'border', 'arrow', 'sticker', 'pulse'
            style: 'primary', // 'primary', 'success', 'warning', 'danger'
            overlay: false, // grey out rest of page
            animation: 'pulse', // 'pulse', 'glow', 'bounce', 'none'
            message: null,
            position: 'top-right', // for arrows/stickers
            clickable: false,
            onClick: null,
            offset: 5, // pixels offset from element
            ...options
        };

        const id = `highlight_${this.nextId++}`;
        const rect = targetElement.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        let highlightElements = [];

        // Create highlight based on type
        switch (config.type) {
            case 'border':
                const border = document.createElement('div');
                border.className = `agentlet-highlight-border ${config.style}`;
                if (config.animation !== 'none') {
                    border.style.animation = `agentlet${config.animation.charAt(0).toUpperCase() + config.animation.slice(1)} 2s infinite`;
                }
                border.style.left = `${rect.left + scrollLeft - config.offset}px`;
                border.style.top = `${rect.top + scrollTop - config.offset}px`;
                border.style.width = `${rect.width + config.offset * 2}px`;
                border.style.height = `${rect.height + config.offset * 2}px`;
                document.body.appendChild(border);
                highlightElements.push(border);
                break;

            case 'arrow':
                const arrow = document.createElement('div');
                arrow.className = `agentlet-arrow ${config.position.split('-')[0]}`;
                const arrowRect = this.positionArrow(arrow, rect, scrollLeft, scrollTop, config.position);
                document.body.appendChild(arrow);
                highlightElements.push(arrow);
                break;

            case 'sticker':
                const sticker = document.createElement('div');
                sticker.className = `agentlet-sticker ${config.style}`;
                sticker.textContent = config.message || '!';
                const stickerPos = this.positionSticker(sticker, rect, scrollLeft, scrollTop, config.position);
                document.body.appendChild(sticker);
                highlightElements.push(sticker);
                break;

            case 'pulse':
                targetElement.style.animation = 'agentletPulse 1s infinite';
                break;
        }

        // Add tooltip message if provided
        let tooltip = null;
        if (config.message && config.type !== 'sticker') {
            tooltip = document.createElement('div');
            tooltip.className = `agentlet-tooltip ${config.position.split('-')[0] || 'top'}`;
            tooltip.textContent = config.message;
            this.positionTooltip(tooltip, rect, scrollLeft, scrollTop, config.position);
            document.body.appendChild(tooltip);
            highlightElements.push(tooltip);
        }

        // Make clickable if needed
        if (config.clickable && config.onClick) {
            highlightElements.forEach(el => {
                el.classList.add('agentlet-highlight-clickable');
                el.addEventListener('click', config.onClick);
            });
        }

        // Create highlight control object
        const highlightControl = {
            id,
            element: targetElement,
            highlightElements,
            config,
            visible: true,

            update: (updates) => {
                Object.assign(config, updates);
                
                if (updates.message && tooltip) {
                    tooltip.textContent = updates.message;
                }
                
                // Reposition if element moved
                const newRect = targetElement.getBoundingClientRect();
                if (newRect.left !== rect.left || newRect.top !== rect.top) {
                    this.repositionHighlight(highlightControl);
                }
            },

            show: () => {
                if (!this.visible) {
                    highlightElements.forEach(el => el.style.display = 'block');
                    this.visible = true;
                }
            },

            hide: () => {
                if (this.visible) {
                    highlightElements.forEach(el => el.style.display = 'none');
                    this.visible = false;
                }
            },

            destroy: () => this.destroyHighlight(id)
        };

        this.highlights.set(id, highlightControl);
        return highlightControl;
    }

    /**
     * Position arrow relative to target element
     */
    positionArrow(arrow, rect, scrollLeft, scrollTop, position) {
        const positions = {
            'top': { 
                left: rect.left + scrollLeft + rect.width / 2,
                top: rect.top + scrollTop - 30
            },
            'bottom': { 
                left: rect.left + scrollLeft + rect.width / 2,
                top: rect.top + scrollTop + rect.height + 14
            },
            'left': { 
                left: rect.left + scrollLeft - 30,
                top: rect.top + scrollTop + rect.height / 2
            },
            'right': { 
                left: rect.left + scrollLeft + rect.width + 14,
                top: rect.top + scrollTop + rect.height / 2
            }
        };

        const pos = positions[position.split('-')[0]] || positions.top;
        arrow.style.left = `${pos.left}px`;
        arrow.style.top = `${pos.top}px`;
    }

    /**
     * Position sticker relative to target element
     */
    positionSticker(sticker, rect, scrollLeft, scrollTop, position) {
        const positions = {
            'top-left': { 
                left: rect.left + scrollLeft - 16,
                top: rect.top + scrollTop - 16
            },
            'top-right': { 
                left: rect.left + scrollLeft + rect.width - 16,
                top: rect.top + scrollTop - 16
            },
            'bottom-left': { 
                left: rect.left + scrollLeft - 16,
                top: rect.top + scrollTop + rect.height - 16
            },
            'bottom-right': { 
                left: rect.left + scrollLeft + rect.width - 16,
                top: rect.top + scrollTop + rect.height - 16
            },
            'center': {
                left: rect.left + scrollLeft + rect.width / 2 - 16,
                top: rect.top + scrollTop + rect.height / 2 - 16
            }
        };

        const pos = positions[position] || positions['top-right'];
        sticker.style.left = `${pos.left}px`;
        sticker.style.top = `${pos.top}px`;
    }

    /**
     * Position tooltip relative to target element
     */
    positionTooltip(tooltip, rect, scrollLeft, scrollTop, position) {
        document.body.appendChild(tooltip);
        const tooltipRect = tooltip.getBoundingClientRect();
        
        const positions = {
            'top': { 
                left: rect.left + scrollLeft + rect.width / 2 - tooltipRect.width / 2,
                top: rect.top + scrollTop - tooltipRect.height - 10
            },
            'bottom': { 
                left: rect.left + scrollLeft + rect.width / 2 - tooltipRect.width / 2,
                top: rect.top + scrollTop + rect.height + 10
            },
            'left': { 
                left: rect.left + scrollLeft - tooltipRect.width - 10,
                top: rect.top + scrollTop + rect.height / 2 - tooltipRect.height / 2
            },
            'right': { 
                left: rect.left + scrollLeft + rect.width + 10,
                top: rect.top + scrollTop + rect.height / 2 - tooltipRect.height / 2
            }
        };

        const pos = positions[position.split('-')[0]] || positions.top;
        tooltip.style.left = `${pos.left}px`;
        tooltip.style.top = `${pos.top}px`;
    }

    /**
     * Reposition highlight elements
     */
    repositionHighlight(highlightControl) {
        const rect = highlightControl.element.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        // Update positions of all highlight elements
        highlightControl.highlightElements.forEach(el => {
            if (el.classList.contains('agentlet-highlight-border')) {
                el.style.left = `${rect.left + scrollLeft - highlightControl.config.offset}px`;
                el.style.top = `${rect.top + scrollTop - highlightControl.config.offset}px`;
                el.style.width = `${rect.width + highlightControl.config.offset * 2}px`;
                el.style.height = `${rect.height + highlightControl.config.offset * 2}px`;
            }
            // Add repositioning for other element types as needed
        });
    }

    /**
     * Destroy a highlight completely
     * @param {string} id - Highlight ID
     */
    destroyHighlight(id) {
        const highlight = this.highlights.get(id);
        if (!highlight) return;

        // Remove pulse animation from original element
        if (highlight.config.type === 'pulse') {
            highlight.element.style.animation = '';
        }

        // Remove all highlight elements
        highlight.highlightElements.forEach(el => {
            if (el && el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });

        this.highlights.delete(id);
    }

    /**
     * Create a guided tour with multiple highlights
     * @param {Array} steps - Array of step configurations
     * @returns {Object} - Tour control object
     */
    createTour(steps = []) {
        let currentStep = 0;
        let currentHighlight = null;

        const tour = {
            steps,
            currentStep,

            start: () => {
                if (steps.length === 0) return;
                currentStep = 0;
                this.showStep();
            },

            next: () => {
                if (currentStep < steps.length - 1) {
                    currentStep++;
                    this.showStep();
                    return true;
                }
                return false;
            },

            previous: () => {
                if (currentStep > 0) {
                    currentStep--;
                    this.showStep();
                    return true;
                }
                return false;
            },

            goTo: (stepIndex) => {
                if (stepIndex >= 0 && stepIndex < steps.length) {
                    currentStep = stepIndex;
                    this.showStep();
                }
            },

            showStep: () => {
                if (currentHighlight) {
                    currentHighlight.destroy();
                }

                const step = steps[currentStep];
                if (step) {
                    currentHighlight = this.highlight(step.element, {
                        ...step,
                        clickable: true,
                        onClick: () => {
                            if (!tour.next()) {
                                tour.end();
                            }
                        }
                    });
                }
            },

            end: () => {
                if (currentHighlight) {
                    currentHighlight.destroy();
                    currentHighlight = null;
                }
                currentStep = 0;
            }
        };

        return tour;
    }

    /**
     * Clear all overlays and highlights
     */
    clearAll() {
        // Clear all overlays
        this.overlays.forEach((overlay, id) => {
            this.destroyOverlay(id);
        });

        // Clear all highlights
        this.highlights.forEach((highlight, id) => {
            this.destroyHighlight(id);
        });
    }

    /**
     * Scroll to an element or position with smooth animation
     * @param {Element|string|Object} target - Element, selector, or coordinates {x, y}
     * @param {Object} options - Scroll configuration
     * @returns {Promise} - Promise that resolves when scroll is complete
     */
    scrollTo(target, options = {}) {
        const config = {
            behavior: 'smooth', // 'smooth', 'instant', 'auto'
            block: 'center',    // 'start', 'center', 'end', 'nearest'
            inline: 'center',   // 'start', 'center', 'end', 'nearest'
            offset: { x: 0, y: 0 }, // Additional offset from target
            highlight: false,   // Temporarily highlight the target
            highlightDuration: 2000, // How long to show highlight
            onComplete: null,   // Callback when scroll completes
            ...options
        };

        return new Promise((resolve, reject) => {
            try {
                let targetElement = null;
                let scrollOptions = {
                    behavior: config.behavior,
                    block: config.block,
                    inline: config.inline
                };

                // Handle different target types
                if (typeof target === 'string') {
                    // CSS selector
                    targetElement = document.querySelector(target);
                    if (!targetElement) {
                        console.warn('PageHighlighter.scrollTo: Element not found', target);
                        reject(new Error(`Element not found: ${target}`));
                        return;
                    }
                } else if (target && typeof target === 'object') {
                    if (target.nodeType === Node.ELEMENT_NODE) {
                        // DOM element
                        targetElement = target;
                    } else if (typeof target.x === 'number' && typeof target.y === 'number') {
                        // Coordinates {x, y}
                        const scrollX = target.x + config.offset.x;
                        const scrollY = target.y + config.offset.y;
                        
                        window.scrollTo({
                            left: scrollX,
                            top: scrollY,
                            behavior: config.behavior
                        });

                        // For coordinate scrolling, we can't detect completion easily
                        setTimeout(() => {
                            if (config.onComplete) config.onComplete();
                            resolve({ x: scrollX, y: scrollY });
                        }, config.behavior === 'smooth' ? 500 : 0);
                        return;
                    } else {
                        reject(new Error('Invalid target object. Expected DOM element or {x, y} coordinates'));
                        return;
                    }
                } else {
                    reject(new Error('Invalid target. Expected string selector, DOM element, or {x, y} coordinates'));
                    return;
                }

                // Element scrolling
                if (targetElement) {
                    // Apply offset if needed
                    if (config.offset.x !== 0 || config.offset.y !== 0) {
                        const rect = targetElement.getBoundingClientRect();
                        const absoluteX = rect.left + window.pageXOffset + config.offset.x;
                        const absoluteY = rect.top + window.pageYOffset + config.offset.y;
                        
                        window.scrollTo({
                            left: absoluteX,
                            top: absoluteY,
                            behavior: config.behavior
                        });
                    } else {
                        // Standard element scroll
                        targetElement.scrollIntoView(scrollOptions);
                    }

                    // Add temporary highlight if requested
                    let highlight = null;
                    if (config.highlight) {
                        highlight = this.highlight(targetElement, {
                            type: 'border',
                            style: 'primary',
                            animation: 'pulse',
                            message: 'Scrolled to this element'
                        });

                        // Auto-remove highlight after duration
                        setTimeout(() => {
                            if (highlight) {
                                highlight.destroy();
                            }
                        }, config.highlightDuration);
                    }

                    // Detect scroll completion (approximate)
                    const checkScrollComplete = () => {
                        setTimeout(() => {
                            if (config.onComplete) config.onComplete();
                            resolve({
                                element: targetElement,
                                highlight: highlight,
                                rect: targetElement.getBoundingClientRect()
                            });
                        }, config.behavior === 'smooth' ? 500 : 0);
                    };

                    checkScrollComplete();
                }
            } catch (error) {
                console.error('PageHighlighter.scrollTo error:', error);
                reject(error);
            }
        });
    }

    /**
     * Scroll to the top of the page
     * @param {Object} options - Scroll configuration
     * @returns {Promise} - Promise that resolves when scroll is complete
     */
    scrollToTop(options = {}) {
        return this.scrollTo({ x: 0, y: 0 }, {
            behavior: 'smooth',
            ...options
        });
    }

    /**
     * Scroll to the bottom of the page
     * @param {Object} options - Scroll configuration
     * @returns {Promise} - Promise that resolves when scroll is complete
     */
    scrollToBottom(options = {}) {
        return this.scrollTo({ 
            x: 0, 
            y: document.documentElement.scrollHeight 
        }, {
            behavior: 'smooth',
            ...options
        });
    }

    /**
     * Scroll to an element and highlight it
     * @param {Element|string} target - Element or selector to scroll to and highlight
     * @param {Object} options - Combined scroll and highlight options
     * @returns {Promise} - Promise that resolves with highlight control object
     */
    scrollToAndHighlight(target, options = {}) {
        const scrollOptions = {
            behavior: 'smooth',
            block: 'center',
            highlight: true,
            highlightDuration: 3000,
            ...options
        };

        return this.scrollTo(target, scrollOptions);
    }

    /**
     * Get statistics about active highlights and overlays
     */
    getStats() {
        return {
            overlays: this.overlays.size,
            highlights: this.highlights.size,
            total: this.overlays.size + this.highlights.size
        };
    }
}

export default PageHighlighter;