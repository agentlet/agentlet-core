/**
 * Builds the `'input'` dialog: an optional message, a single text/
 * textarea field, and Cancel/Submit buttons. Backs `prompt`,
 * `promptPassword`, `promptEmail`, `promptTextarea`, and `promptAI`.
 */
import { Z_INDEX } from '../ZIndex.js';
import type { DialogInputOptions } from '../../../types/public-api';
import type { DialogTheme, HideFn, InputDialogResult, ResolvedInputConfig } from './types';

/** Applies `showInput()`'s defaults to caller-supplied options. */
export function resolveInputConfig(options: DialogInputOptions): ResolvedInputConfig {
    return {
        title: options.title || 'Input Required',
        message: options.message || '',
        placeholder: options.placeholder || '',
        defaultValue: options.defaultValue || '',
        inputType: options.inputType || 'text',
        rows: options.rows || 4,
        resizable: options.resizable !== false,
        ...options
    } as ResolvedInputConfig;
}

/** Builds the input dialog element (optional message, text/textarea field, Cancel/Submit buttons). */
export function buildInputDialog(theme: DialogTheme, config: ResolvedInputConfig, hide: HideFn): InputDialogResult {
    const dialog = document.createElement('div');
    dialog.className = 'agentlet-input-dialog';
    dialog.style.cssText = `
        background: ${theme.backgroundColor || '#ffffff'};
        border-radius: ${theme.borderRadius || '8px'};
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        max-width: 500px;
        min-width: 350px;
        font-family: ${theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
        position: relative;
        z-index: ${Z_INDEX.DIALOG};
    `;

    const header = document.createElement('div');
    header.className = 'agentlet-input-header';
    header.style.cssText = `
        padding: 20px 20px 15px;
        border-bottom: 1px solid ${theme.borderColor || '#e0e0e0'};
    `;

    const title = document.createElement('h3');
    title.textContent = config.title;
    title.style.cssText = `
        margin: 0;
        color: ${theme.textColor || '#333333'};
        font-size: 18px;
        font-weight: 600;
    `;

    header.appendChild(title);

    const content = document.createElement('div');
    content.className = 'agentlet-input-content';
    content.style.cssText = 'padding: 20px;';

    if (config.message) {
        const message = document.createElement('p');
        message.textContent = config.message;
        message.style.cssText = `
            margin: 0 0 15px 0;
            color: ${theme.textColor || '#333333'};
            line-height: 1.5;
        `;
        content.appendChild(message);
    }

    let input: HTMLInputElement | HTMLTextAreaElement;
    if (config.inputType === 'textarea') {
        const textarea = document.createElement('textarea');
        textarea.rows = config.rows;
        if (!config.resizable) {
            textarea.style.resize = 'none';
        }
        input = textarea;
    } else {
        const textInput = document.createElement('input');
        textInput.type = config.inputType;
        input = textInput;
    }

    input.className = 'agentlet-input-field';
    input.placeholder = config.placeholder;
    input.value = config.defaultValue;
    input.style.cssText = `
        width: 100%;
        padding: 10px;
        border: 1px solid ${theme.borderColor || '#ccc'};
        border-radius: 4px;
        font-size: 14px;
        font-family: inherit;
        box-sizing: border-box;
    `;

    content.appendChild(input);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'agentlet-input-buttons';
    buttonContainer.style.cssText = `
        padding: 0 20px 20px;
        display: flex;
        gap: 10px;
        justify-content: flex-end;
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

    const submitButton = document.createElement('button');
    submitButton.textContent = 'Submit';
    submitButton.style.cssText = `
        padding: 10px 20px;
        border: 1px solid ${theme.primaryColor || '#007bff'};
        border-radius: 4px;
        background: ${theme.primaryColor || '#007bff'};
        color: white;
        cursor: pointer;
        font-size: 14px;
    `;

    cancelButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hide(null);
    });

    submitButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hide(input.value);
    });

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(submitButton);

    dialog.appendChild(header);
    dialog.appendChild(content);
    dialog.appendChild(buttonContainer);

    return { element: dialog, input };
}
