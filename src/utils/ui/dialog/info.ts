/**
 * Builds the `'info'` dialog: an icon+title header, a message body (plain
 * text or HTML), and a row of buttons. Also used by `confirm`, `yesNo`,
 * `choice`, and the `info`/`success`/`warning`/`error` convenience methods,
 * which all funnel through `showInfo`.
 */
import { Z_INDEX } from '../ZIndex.js';
import type { DialogInfoOptions } from '../../../types/public-api';
import type { DialogTheme, HideFn, ResolvedInfoConfig } from './types';

/** Applies `showInfo()`'s defaults to caller-supplied options. */
export function resolveInfoConfig(options: DialogInfoOptions): ResolvedInfoConfig {
    return {
        title: options.title || 'Information',
        message: options.message || '',
        icon: options.icon || 'ℹ️',
        allowHtml: options.allowHtml || false,
        buttons: options.buttons || [{ text: 'OK', value: 'ok', primary: true }],
        ...options
    } as ResolvedInfoConfig;
}

/** Builds the info dialog element (header icon/title, message body, button row). */
export function buildInfoDialog(theme: DialogTheme, config: ResolvedInfoConfig, hide: HideFn): HTMLDivElement {
    const dialog = document.createElement('div');
    dialog.className = 'agentlet-info-dialog';
    dialog.style.cssText = `
        background: ${theme.backgroundColor || '#ffffff'};
        border-radius: ${theme.borderRadius || '8px'};
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        max-width: ${config.maxWidth || '500px'};
        min-width: ${config.minWidth || '300px'};
        width: ${config.width || 'auto'};
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        font-family: ${theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
        position: relative;
        z-index: ${Z_INDEX.DIALOG};
    `;

    const header = document.createElement('div');
    header.className = 'agentlet-info-header';
    header.style.cssText = `
        padding: 20px 20px 15px;
        border-bottom: 1px solid ${theme.borderColor || '#e0e0e0'};
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        background: ${theme.headerBackground || 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'};
        flex-shrink: 0;
    `;

    const icon = document.createElement('span');
    icon.textContent = config.icon;
    icon.style.cssText = 'font-size: 24px;';

    const title = document.createElement('h3');
    title.textContent = config.title;
    title.style.cssText = `
        margin: 0;
        color: ${theme.dialogHeaderTextColor || theme.headerTextColor || '#333333'};
        font-size: 18px;
        font-weight: 600;
    `;

    header.appendChild(icon);
    header.appendChild(title);

    const content = document.createElement('div');
    content.className = 'agentlet-info-content';
    content.style.cssText = `
        padding: 20px;
        color: ${theme.textColor || '#333333'};
        line-height: 1.5;
        flex: 1;
        overflow-y: auto;
    `;

    if (config.allowHtml) {
        content.innerHTML = config.message;
    } else {
        content.textContent = config.message;
    }

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'agentlet-info-buttons';
    buttonContainer.style.cssText = `
        padding: 0 20px 20px;
        display: flex;
        gap: 10px;
        justify-content: flex-end;
        flex-shrink: 0;
    `;

    config.buttons.forEach(buttonConfig => {
        const button = document.createElement('button');
        button.textContent = buttonConfig.text;
        button.disabled = buttonConfig.disabled || false;

        let buttonStyle = `
            padding: 10px 20px;
            border: 1px solid ${theme.borderColor || '#ccc'};
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        `;

        if (buttonConfig.primary) {
            buttonStyle += `
                background: ${theme.primaryColor || '#007bff'};
                color: white;
                border-color: ${theme.primaryColor || '#007bff'};
            `;
        } else if (buttonConfig.danger) {
            buttonStyle += `
                background: #dc3545;
                color: white;
                border-color: #dc3545;
            `;
        } else {
            buttonStyle += `
                background: ${theme.actionButtonBackground || '#f8f9fa'};
                color: ${theme.actionButtonText || '#333333'};
            `;
        }

        button.style.cssText = buttonStyle;

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hide(buttonConfig.value);
        });

        buttonContainer.appendChild(button);
    });

    dialog.appendChild(header);
    dialog.appendChild(content);
    dialog.appendChild(buttonContainer);

    // Force visibility - ensure the dialog is not hidden by CSS conflicts
    // from the host page.
    dialog.style.display = 'flex';
    dialog.style.visibility = 'visible';
    dialog.style.opacity = '1';

    return dialog;
}
