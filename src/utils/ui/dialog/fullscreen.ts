/**
 * Builds the `'fullscreen'` dialog: a near-viewport-sized panel with a
 * header (icon/title, optional close button), a scrollable content area
 * (message and/or custom content), and a footer button row.
 */
import { Z_INDEX } from '../ZIndex.js';
import type { DialogButton, DialogFullscreenOptions } from '../../../types/public-api';
import type { DialogTheme, HideFn, ResolvedFullscreenConfig } from './types';

/** Applies `showFullscreen()`'s defaults to caller-supplied options. */
export function resolveFullscreenConfig(options: DialogFullscreenOptions): ResolvedFullscreenConfig {
    return {
        title: options.title || 'Fullscreen Dialog',
        message: options.message || '',
        icon: options.icon || '🔍',
        allowHtml: options.allowHtml || false,
        buttons: options.buttons || [{ text: 'Close', value: 'close', primary: true }] as DialogButton[],
        customContent: options.customContent || null,
        scrollable: options.scrollable !== false,
        closeOnOverlay: options.closeOnOverlay !== false,
        showHeaderCloseButton: options.showHeaderCloseButton !== false,
        ...options
    } as ResolvedFullscreenConfig;
}

/** Builds the fullscreen dialog element (header with optional close button, scrollable content, footer buttons). */
export function buildFullscreenDialog(theme: DialogTheme, config: ResolvedFullscreenConfig, hide: HideFn): HTMLDivElement {
    const dialog = document.createElement('div');
    dialog.className = 'agentlet-fullscreen-dialog';
    dialog.style.cssText = `
        background: ${theme.backgroundColor || '#ffffff'};
        border-radius: ${theme.borderRadius || '12px'};
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        width: 90%;
        height: 90%;
        max-width: 90vw;
        max-height: 90vh;
        font-family: ${theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
        display: flex;
        flex-direction: column;
        position: relative;
        z-index: ${Z_INDEX.DIALOG};
    `;

    const header = document.createElement('div');
    header.className = 'agentlet-fullscreen-header';
    header.style.cssText = `
        padding: 24px 30px;
        border-bottom: 2px solid ${theme.borderColor || '#e0e0e0'};
        display: flex;
        align-items: center;
        gap: 15px;
        flex-shrink: 0;
        background: ${theme.headerBackground || 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'};
        border-radius: ${theme.borderRadius || '12px'} ${theme.borderRadius || '12px'} 0 0;
    `;

    const icon = document.createElement('span');
    icon.textContent = config.icon;
    icon.style.cssText = 'font-size: 32px;';

    const title = document.createElement('h2');
    title.textContent = config.title;
    title.style.cssText = `
        margin: ${theme.dialogHeaderTextMargin || '0'};
        color: ${theme.dialogHeaderTextColor || theme.headerTextColor || '#333333'};
        font-size: 24px;
        font-weight: 700;
        flex: 1;
    `;

    header.appendChild(icon);
    header.appendChild(title);

    if (config.showHeaderCloseButton) {
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${theme.textColor || '#333333'};
            opacity: 0.6;
            transition: all 0.2s;
            border-radius: 50%;
        `;

        closeButton.addEventListener('click', () => {
            hide('close');
        });

        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.opacity = '1';
            closeButton.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.opacity = '0.6';
            closeButton.style.backgroundColor = 'transparent';
        });

        header.appendChild(closeButton);
    }

    const content = document.createElement('div');
    content.className = 'agentlet-fullscreen-content';
    content.style.cssText = `
        padding: 30px;
        color: ${theme.textColor || '#333333'};
        line-height: 1.6;
        font-size: 16px;
        flex: 1;
        display: flex;
        flex-direction: column;
        ${config.scrollable ? 'overflow-y: auto;' : 'overflow: hidden;'}
    `;

    if (config.message) {
        const message = document.createElement('div');
        message.className = 'agentlet-fullscreen-message';
        message.style.cssText = 'margin-bottom: 20px;';

        if (config.allowHtml) {
            message.innerHTML = config.message;
        } else {
            message.textContent = config.message;
        }

        content.appendChild(message);
    }

    if (config.customContent) {
        const customDiv = document.createElement('div');
        customDiv.className = 'agentlet-fullscreen-custom';
        customDiv.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
        `;

        if (typeof config.customContent === 'string') {
            if (config.allowHtml) {
                customDiv.innerHTML = config.customContent;
            } else {
                customDiv.textContent = config.customContent;
            }
        } else if (config.customContent instanceof HTMLElement) {
            customDiv.appendChild(config.customContent);
        }

        content.appendChild(customDiv);
    }

    const footer = document.createElement('div');
    footer.className = 'agentlet-fullscreen-footer';
    footer.style.cssText = `
        padding: 24px 30px;
        border-top: 2px solid ${theme.borderColor || '#e0e0e0'};
        display: flex;
        gap: 15px;
        justify-content: flex-end;
        flex-shrink: 0;
        background: ${theme.footerBackground || 'rgba(248, 249, 250, 0.8)'};
        border-radius: 0 0 ${theme.borderRadius || '12px'} ${theme.borderRadius || '12px'};
    `;

    config.buttons.forEach(buttonConfig => {
        const button = document.createElement('button');
        button.textContent = buttonConfig.text;
        button.disabled = buttonConfig.disabled || false;

        let buttonStyle = `
            padding: 12px 24px;
            border: 2px solid ${theme.borderColor || '#ccc'};
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.2s;
            min-width: 100px;
        `;

        if (buttonConfig.primary) {
            buttonStyle += `
                background: ${theme.primaryColor || '#007bff'};
                color: white;
                border-color: ${theme.primaryColor || '#007bff'};
            `;
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'translateY(-1px)';
                button.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.3)';
            });
            button.addEventListener('mouseleave', () => {
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = 'none';
            });
        } else if (buttonConfig.danger) {
            buttonStyle += `
                background: #dc3545;
                color: white;
                border-color: #dc3545;
            `;
            button.addEventListener('mouseenter', () => {
                button.style.transform = 'translateY(-1px)';
                button.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.3)';
            });
            button.addEventListener('mouseleave', () => {
                button.style.transform = 'translateY(0)';
                button.style.boxShadow = 'none';
            });
        } else {
            buttonStyle += `
                background: ${theme.actionButtonBackground || '#f8f9fa'};
                color: ${theme.actionButtonText || '#333333'};
            `;
            button.addEventListener('mouseenter', () => {
                button.style.backgroundColor = '#e9ecef';
                button.style.transform = 'translateY(-1px)';
            });
            button.addEventListener('mouseleave', () => {
                button.style.backgroundColor = theme.actionButtonBackground || '#f8f9fa';
                button.style.transform = 'translateY(0)';
            });
        }

        button.style.cssText = buttonStyle;

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hide(buttonConfig.value);
        });

        footer.appendChild(button);
    });

    dialog.appendChild(header);
    dialog.appendChild(content);
    dialog.appendChild(footer);

    return dialog;
}
