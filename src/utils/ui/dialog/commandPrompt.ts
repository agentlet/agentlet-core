/**
 * Builds the `'command'` dialog: a large centered input meant for quick
 * commands, with an optional header/message and Cancel/Execute buttons.
 * Backs `commandPrompt` and `quickCommand`.
 */
import { Z_INDEX } from '../ZIndex.js';
import type { DialogCommandOptions } from '../../../types/public-api';
import type { DialogTheme, HideFn, InputDialogResult, ResolvedCommandConfig } from './types';

/**
 * Applies `showCommandPrompt()`'s defaults to caller-supplied options.
 * The legacy bare-string call form is resolved by the caller first, so
 * this only ever sees an options object.
 */
export function resolveCommandConfig(options: DialogCommandOptions): ResolvedCommandConfig {
    return {
        title: options.title || 'Command Prompt',
        message: options.message || '',
        icon: options.icon || '⚡',
        placeholder: options.placeholder || 'Enter command...',
        defaultValue: options.defaultValue || '',
        inputType: options.inputType || 'text',
        fontSize: options.fontSize || '24px',
        showHeader: options.showHeader !== false,
        showMessage: options.showMessage !== false,
        allowHtml: options.allowHtml || false,
        closeOnOverlay: options.closeOnOverlay !== false,
        ...options
    } as ResolvedCommandConfig;
}

/** Builds the command-prompt dialog element (optional header, optional message, large input, Cancel/Execute buttons). */
export function buildCommandPromptDialog(theme: DialogTheme, config: ResolvedCommandConfig, hide: HideFn): InputDialogResult {
    const dialog = document.createElement('div');
    dialog.className = 'agentlet-command-dialog';
    dialog.style.cssText = `
        background: ${theme.backgroundColor || '#ffffff'};
        border-radius: ${theme.borderRadius || '12px'};
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        max-width: 800px;
        min-width: 400px;
        width: 80%;
        font-family: ${theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
        display: flex;
        flex-direction: column;
        position: relative;
        z-index: ${Z_INDEX.DIALOG};
    `;

    if (config.showHeader) {
        const header = document.createElement('div');
        header.className = 'agentlet-command-header';
        header.style.cssText = `
            padding: 24px 30px 20px;
            border-bottom: 2px solid ${theme.borderColor || '#e0e0e0'};
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
            background: ${theme.headerBackground || 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'};
            border-radius: ${theme.borderRadius || '12px'} ${theme.borderRadius || '12px'} 0 0;
            flex-shrink: 0;
        `;

        const icon = document.createElement('span');
        icon.textContent = config.icon;
        icon.style.cssText = 'font-size: 32px;';

        const title = document.createElement('h2');
        title.textContent = config.title;
        title.style.cssText = `
            margin: 0;
            color: ${theme.dialogHeaderTextColor || theme.headerTextColor || '#333333'};
            font-size: 24px;
            font-weight: 700;
        `;

        header.appendChild(icon);
        header.appendChild(title);
        dialog.appendChild(header);
    }

    const content = document.createElement('div');
    content.className = 'agentlet-command-content';
    content.style.cssText = `
        padding: ${config.showHeader ? '30px' : '40px'};
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        flex: 1;
    `;

    if (config.showMessage && config.message) {
        const message = document.createElement('div');
        message.className = 'agentlet-command-message';
        message.style.cssText = `
            color: ${theme.textColor || '#333333'};
            font-size: 18px;
            line-height: 1.5;
            text-align: center;
            margin-bottom: 10px;
        `;

        if (config.allowHtml) {
            message.innerHTML = config.message;
        } else {
            message.textContent = config.message;
        }

        content.appendChild(message);
    }

    let input: HTMLInputElement | HTMLTextAreaElement;
    if (config.inputType === 'textarea') {
        const textarea = document.createElement('textarea');
        textarea.rows = 3;
        textarea.style.resize = 'vertical';
        input = textarea;
    } else {
        const textInput = document.createElement('input');
        textInput.type = config.inputType;
        input = textInput;
    }

    input.className = 'agentlet-command-input';
    input.placeholder = config.placeholder;
    input.value = config.defaultValue;
    input.style.cssText = `
        width: 100%;
        padding: 20px 24px;
        border: 3px solid ${theme.borderColor || '#e0e0e0'};
        border-radius: 12px;
        font-size: ${config.fontSize};
        font-family: ${theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
        font-weight: 500;
        box-sizing: border-box;
        text-align: center;
        background: ${theme.inputBackground || '#ffffff'};
        color: ${theme.textColor || '#333333'};
        transition: all 0.2s ease;
        outline: none;
    `;

    input.addEventListener('focus', () => {
        input.style.borderColor = theme.primaryColor || '#007bff';
        input.style.boxShadow = '0 0 0 4px rgba(0, 123, 255, 0.15)';
        input.style.transform = 'scale(1.02)';
    });

    input.addEventListener('blur', () => {
        input.style.borderColor = theme.borderColor || '#e0e0e0';
        input.style.boxShadow = 'none';
        input.style.transform = 'scale(1)';
    });

    content.appendChild(input);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'agentlet-command-buttons';
    buttonContainer.style.cssText = `
        display: flex;
        gap: 15px;
        justify-content: center;
        margin-top: 10px;
    `;

    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = `
        padding: 12px 24px;
        border: 2px solid ${theme.borderColor || '#ccc'};
        border-radius: 8px;
        background: ${theme.actionButtonBackground || '#f8f9fa'};
        color: ${theme.actionButtonText || '#333333'};
        cursor: pointer;
        font-size: 16px;
        font-weight: 600;
        transition: all 0.2s;
        min-width: 100px;
    `;

    const submitButton = document.createElement('button');
    submitButton.textContent = 'Execute';
    submitButton.style.cssText = `
        padding: 12px 24px;
        border: 2px solid ${theme.primaryColor || '#007bff'};
        border-radius: 8px;
        background: ${theme.primaryColor || '#007bff'};
        color: white;
        cursor: pointer;
        font-size: 16px;
        font-weight: 600;
        transition: all 0.2s;
        min-width: 100px;
    `;

    cancelButton.addEventListener('mouseenter', () => {
        cancelButton.style.backgroundColor = '#e9ecef';
        cancelButton.style.transform = 'translateY(-1px)';
    });

    cancelButton.addEventListener('mouseleave', () => {
        cancelButton.style.backgroundColor = theme.actionButtonBackground || '#f8f9fa';
        cancelButton.style.transform = 'translateY(0)';
    });

    submitButton.addEventListener('mouseenter', () => {
        submitButton.style.transform = 'translateY(-1px)';
        submitButton.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.3)';
    });

    submitButton.addEventListener('mouseleave', () => {
        submitButton.style.transform = 'translateY(0)';
        submitButton.style.boxShadow = 'none';
    });

    cancelButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hide(null);
    });

    submitButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hide(input.value.trim());
    });

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(submitButton);
    content.appendChild(buttonContainer);

    dialog.appendChild(content);

    return { element: dialog, input };
}
