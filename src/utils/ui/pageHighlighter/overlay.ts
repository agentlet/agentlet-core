/**
 * Full-screen message overlays: creation, update, fade-out hide and
 * immediate destroy.
 */
import type { PageHighlighterOverlayOptions, PageHighlighterOverlayControl } from '../../../types/public-api';
import type { PageHighlighterContext, OverlayEntry, ResolvedOverlayConfig } from './types.js';

const DEFAULT_OVERLAY_CONFIG: ResolvedOverlayConfig = {
    message: 'Loading...',
    position: 'center',
    type: 'info',
    progress: 0,
    persistent: false,
    duration: 3000,
    onClick: null,
    overlay: false,
    closeable: false
};

/**
 * Shows a full-screen overlay with a message (optionally with a dimmed
 * background, a close button, or a progress bar) and returns its control
 * object. Auto-hides after `duration` ms unless `persistent` is set.
 */
export function showOverlay(context: PageHighlighterContext, options: PageHighlighterOverlayOptions = {}): PageHighlighterOverlayControl {
    const config: ResolvedOverlayConfig = { ...DEFAULT_OVERLAY_CONFIG, ...options };

    const id = `overlay_${context.nextId++}`;
    let backgroundOverlay: HTMLElement | null = null;

    // Create optional background overlay
    if (config.overlay) {
        backgroundOverlay = document.createElement('div');
        backgroundOverlay.className = 'agentlet-overlay fade-in';
        backgroundOverlay.id = `${id}_bg`;
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
        closeButton.onclick = (event: MouseEvent): void => {
            event.stopPropagation();
            hideOverlay(context, id);
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
    const onClick = config.onClick;
    if (onClick) {
        messageContent.addEventListener('click', onClick);
        messageContent.style.cursor = 'pointer';
    }

    // Add to page
    if (backgroundOverlay) {
        document.body.appendChild(backgroundOverlay);
    }
    document.body.appendChild(messageContainer);

    // Auto-hide if not persistent
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (!config.persistent && config.duration > 0) {
        timeoutId = setTimeout(() => {
            hideOverlay(context, id);
        }, config.duration);
    }

    // Store overlay reference
    const overlayControl: OverlayEntry = {
        id,
        element: messageContainer,
        backgroundOverlay,
        messageContent,
        config,
        timeoutId,

        update: (updates) => {
            Object.assign(config, updates);

            if (updates.message) {
                messageText.textContent = updates.message;
            }

            // BUG (preserved from PageHighlighter.js): `config.type` was just
            // overwritten to `updates.type` by the Object.assign above, so
            // this comparison is always false whenever `updates.type` is set
            // - the class never actually changes. See
            // tests/utils/ui/PageHighlighter.markup.test.ts's "update({
            // type }) never changes the message content class" test.
            if (updates.type && updates.type !== config.type) {
                messageContent.className = `agentlet-message-content ${updates.type}`;
            }

            if (updates.progress !== undefined && config.type === 'progress') {
                console.log('🔄 Updating progress to:', `${updates.progress}%`);
                const progressContainer = messageContent.querySelector('.agentlet-progress-container');
                const progressFill = progressContainer?.querySelector('.agentlet-progress-fill') as HTMLElement | null;
                const progressText = progressContainer?.querySelector('.agentlet-progress-text') as HTMLElement | null;
                console.log('🔍 Progress elements found:', { progressContainer: !!progressContainer, progressFill: !!progressFill, progressText: !!progressText });
                if (progressFill && progressText) {
                    progressFill.style.width = `${updates.progress}%`;
                    progressText.textContent = `${updates.progress}%`;
                    console.log('✅ Progress updated to:', `${updates.progress}%`, 'Width set to:', progressFill.style.width);
                } else {
                    console.error('❌ Progress elements not found!');
                }
            }
        },

        hide: () => hideOverlay(context, id),
        destroy: () => destroyOverlay(context, id)
    };

    context.overlays.set(id, overlayControl);
    return overlayControl;
}

/** Fades an overlay (and its background dim, if any) out, then destroys it 300ms later. */
export function hideOverlay(context: PageHighlighterContext, id: string): void {
    const overlay = context.overlays.get(id);
    if (!overlay) return;

    // Add fade out animation to both elements
    overlay.element.classList.add('fade-out');
    if (overlay.backgroundOverlay) {
        overlay.backgroundOverlay.classList.add('fade-out');
    }

    setTimeout(() => {
        destroyOverlay(context, id);
    }, 300);
}

/** Removes an overlay (and its background dim, if any) from the DOM immediately. */
export function destroyOverlay(context: PageHighlighterContext, id: string): void {
    const overlay = context.overlays.get(id);
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

    context.overlays.delete(id);
}
