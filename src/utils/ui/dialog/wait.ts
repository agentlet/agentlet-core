/**
 * Builds the `'wait'` dialog: a header with an optional icon, an optional
 * spinner, a message, and an optional Cancel button. Backs
 * `showAIProcessing`, `showLoading`, `showAnalyzing`, and `showThinking`.
 */
import { Z_INDEX } from '../ZIndex.js';
import type { DialogWaitOptions } from '../../../types/public-api';
import type { DialogTheme, HideFn, ResolvedWaitConfig } from './types';

/** Applies `showWait()`'s defaults to caller-supplied options. */
export function resolveWaitConfig(options: DialogWaitOptions): ResolvedWaitConfig {
    return {
        title: options.title || 'AI Processing',
        message: options.message || 'Please wait...',
        icon: options.icon || '🤖',
        showSpinner: options.showSpinner !== false,
        allowCancel: options.allowCancel || false,
        ...options
    } as ResolvedWaitConfig;
}

/** Builds the wait dialog element (header with optional icon, optional spinner, message, optional Cancel button). */
export function buildWaitDialog(
    theme: DialogTheme,
    config: ResolvedWaitConfig,
    hide: HideFn,
    cancelCallback: (() => void) | null | undefined
): HTMLDivElement {
    const dialog = document.createElement('div');
    dialog.className = 'agentlet-wait-dialog';
    dialog.style.cssText = `
        background: ${theme.backgroundColor || '#ffffff'};
        border-radius: ${theme.borderRadius || '8px'};
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        max-width: 400px;
        min-width: 300px;
        font-family: ${theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
        text-align: center;
        position: relative;
        z-index: ${Z_INDEX.DIALOG};
    `;

    const header = document.createElement('div');
    header.className = 'agentlet-wait-header';
    header.style.cssText = `
        padding: 20px 20px 15px;
        border-bottom: 1px solid ${theme.borderColor || '#e0e0e0'};
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        background: ${theme.headerBackground || 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'};
    `;

    if (config.icon) {
        const icon = document.createElement('span');
        icon.textContent = config.icon;
        icon.style.cssText = `
            font-size: 24px;
            animation: pulse 2s infinite;
        `;
        header.appendChild(icon);
    }

    const title = document.createElement('h3');
    title.textContent = config.title;
    title.style.cssText = `
        margin: 0;
        color: ${theme.dialogHeaderTextColor || theme.headerTextColor || '#333333'};
        font-size: 18px;
        font-weight: 600;
    `;

    header.appendChild(title);

    const content = document.createElement('div');
    content.className = 'agentlet-wait-content';
    content.style.cssText = 'padding: 20px;';

    if (config.showSpinner) {
        const spinner = document.createElement('div');
        spinner.className = 'agentlet-wait-spinner';
        spinner.style.cssText = `
            width: 40px;
            height: 40px;
            border: 4px solid ${theme.borderColor || '#e0e0e0'};
            border-top: 4px solid ${theme.primaryColor || '#007bff'};
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 15px;
        `;
        content.appendChild(spinner);
    }

    const message = document.createElement('p');
    message.className = 'agentlet-wait-message';
    message.textContent = config.message;
    message.style.cssText = `
        margin: 0;
        color: ${theme.textColor || '#333333'};
        line-height: 1.5;
    `;

    content.appendChild(message);

    dialog.appendChild(header);
    dialog.appendChild(content);

    if (config.allowCancel) {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'agentlet-wait-buttons';
        buttonContainer.style.cssText = `
            padding: 0 20px 20px;
            display: flex;
            justify-content: center;
        `;

        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = `
            padding: 10px 20px;
            border: 1px solid ${theme.borderColor || '#ccc'};
            border-radius: 4px;
            background: ${theme.actionButtonBackground || '#f8f9fa'};
            color: ${theme.actionButtonText || '#333333'};
            cursor: pointer;
            font-size: 14px;
        `;

        cancelButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (cancelCallback) {
                cancelCallback();
            }
            hide(true); // true indicates cancellation
        });

        buttonContainer.appendChild(cancelButton);
        dialog.appendChild(buttonContainer);
    }

    // Force visibility - ensure the dialog is not hidden by CSS conflicts
    // from the host page.
    dialog.style.display = 'block';
    dialog.style.visibility = 'visible';
    dialog.style.opacity = '1';

    return dialog;
}
