/**
 * Unified Dialog - consolidated info/input/wait/progress/fullscreen/
 * command-prompt dialog functionality.
 *
 * This is a thin facade: each dialog type's DOM construction lives in its
 * own module under `./dialog/`, and this class owns the mutable state
 * (which dialog is active, its DOM nodes, callbacks, progress counters)
 * and the keyboard/overlay-click routing that all dialog types share.
 */
import type {
    DialogAPI,
    DialogButton,
    DialogCommandOptions,
    DialogFullscreenOptions,
    DialogInfoOptions,
    DialogInputOptions,
    DialogProgressCallbacks,
    DialogProgressOptions,
    DialogWaitOptions
} from '../../types/public-api';

import { addDialogStyles as injectDialogStyles } from './dialog/styles';
import {
    activateOverlayBodyState,
    buildFullscreenOverlay,
    buildOverlay,
    deactivateOverlayBodyState,
    preserveScrollPosition as preserveScroll,
    restoreScrollPosition as restoreScroll
} from './dialog/overlay';
import { escapeHtml as escapeHtmlImpl } from './dialog/escapeHtml';
import { buildInfoDialog, resolveInfoConfig } from './dialog/info';
import { buildInputDialog, resolveInputConfig } from './dialog/input';
import { buildWaitDialog, resolveWaitConfig } from './dialog/wait';
import { buildCommandPromptDialog, resolveCommandConfig } from './dialog/commandPrompt';
import { buildFullscreenDialog, resolveFullscreenConfig } from './dialog/fullscreen';
import {
    buildProgressDialog,
    completeAllSteps,
    renderProgressDisplay,
    renderStepProgress,
    resolveProgressConfig
} from './dialog/progress';
import type { DialogTheme } from './dialog/types';

/** Config accepted by the `Dialog` constructor. */
export interface DialogConfig {
    theme?: DialogTheme;
}

/** The `type` values `show()`/the internal dialog state can hold. */
type DialogType = 'info' | 'input' | 'wait' | 'progress' | 'fullscreen' | 'command';

/** Union of every dialog-close callback shape used across dialog types. */
type DialogCallback = (result?: unknown) => void;

class Dialog implements DialogAPI {
    theme: DialogTheme;
    isActive: boolean;
    overlay: HTMLElement | null;
    dialog: HTMLElement | null;
    callback: DialogCallback | null;
    type: DialogType | null;
    activeInput: HTMLInputElement | HTMLTextAreaElement | null;
    cancelCallback: (() => void) | null;
    scrollY: number;

    // Progress-dialog state, set by showProgress()/updateProgress()/setStep().
    onProgress: ((progress: number, message?: string) => void) | null;
    onComplete: (() => void) | null;
    currentProgress: number;
    totalSteps: number;
    stepLabels: string[];
    currentStep: number;
    startTime: number | null;

    constructor(config: DialogConfig = {}) {
        this.theme = config.theme || {};
        this.isActive = false;
        this.overlay = null;
        this.dialog = null;
        this.callback = null;
        this.type = null;
        this.activeInput = null;
        this.cancelCallback = null;
        this.scrollY = 0;

        this.onProgress = null;
        this.onComplete = null;
        this.currentProgress = 0;
        this.totalSteps = 1;
        this.stepLabels = [];
        this.currentStep = 0;
        this.startTime = null;

        // Bind methods
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleOverlayClick = this.handleOverlayClick.bind(this);

        // Ensure dialog styles are injected
        this.addDialogStyles();
    }

    /**
     * Preserve current scroll position before showing dialog.
     */
    preserveScrollPosition(): void {
        this.scrollY = preserveScroll();
    }

    /**
     * Restore scroll position after hiding dialog.
     */
    restoreScrollPosition(): void {
        restoreScroll(this.scrollY);
    }

    /**
     * Universal show method - primary interface for all dialog types.
     */
    show(type: 'info', options?: DialogInfoOptions, callback?: (value: unknown) => void): void;
    show(type: 'input', options?: DialogInputOptions, callback?: (value: string | null) => void): void;
    show(type: 'wait', options?: DialogWaitOptions, cancelCallback?: () => void): void;
    show(type: 'progress', options?: DialogProgressOptions, callbacks?: DialogProgressCallbacks): DialogAPI;
    show(type: 'fullscreen', options?: DialogFullscreenOptions, callback?: (value: unknown) => void): void;
    show(type: 'command', options?: DialogCommandOptions, callback?: (value: string | null) => void): void;
    show(
        type: DialogType,
        options: Record<string, unknown> = {},
        callback?: unknown
    ): void | DialogAPI {
        this.type = type;
        switch (type) {
        case 'info':
            return this.showInfo(options as DialogInfoOptions, callback as ((value: unknown) => void) | undefined);
        case 'input':
            return this.showInput(options as DialogInputOptions, callback as ((value: string | null) => void) | undefined);
        case 'wait':
            return this.showWait(options as DialogWaitOptions, callback as (() => void) | undefined);
        case 'progress':
            return this.showProgress(options as DialogProgressOptions, callback as DialogProgressCallbacks);
        case 'fullscreen':
            return this.showFullscreen(options as DialogFullscreenOptions, callback as ((value: unknown) => void) | undefined);
        case 'command':
            return this.showCommandPrompt(options as DialogCommandOptions, callback as ((value: string | null) => void) | undefined);
        default:
            throw new Error(`Unknown dialog type: ${type as string}`);
        }
    }

    /**
     * Show information dialog.
     */
    showInfo(options: DialogInfoOptions = {}, callback?: (value: unknown) => void): void {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return;
        }

        const config = resolveInfoConfig(options);

        this.callback = (callback as DialogCallback | undefined) ?? null;
        this.isActive = true;
        this.type = 'info';

        this.createOverlay();

        if (!this.overlay) {
            this.isActive = false;
            this.type = null;
            return;
        }

        this.dialog = buildInfoDialog(this.theme, config, (result) => this.hide(result));

        if (!this.dialog) {
            this.removeOverlay();
            this.isActive = false;
            this.type = null;
            return;
        }

        this.overlay.appendChild(this.dialog);

        this.addEventListeners();
    }

    /**
     * Show input dialog.
     */
    showInput(options: DialogInputOptions = {}, callback?: (value: string | null) => void): void {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return;
        }

        const config = resolveInputConfig(options);

        this.callback = (callback as DialogCallback | undefined) ?? null;
        this.isActive = true;
        this.type = 'input';

        this.createOverlay();
        const { element, input } = buildInputDialog(this.theme, config, (result) => this.hide(result));
        this.dialog = element;
        this.activeInput = input;
        this.overlay?.appendChild(this.dialog);

        this.addEventListeners();
        this.focusFirstInput();
    }

    /**
     * Show wait dialog.
     */
    showWait(options: DialogWaitOptions = {}, cancelCallback?: () => void): void {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return;
        }

        const config = resolveWaitConfig(options);

        this.cancelCallback = cancelCallback ?? null;
        this.isActive = true;
        this.type = 'wait';

        this.createOverlay();
        this.dialog = buildWaitDialog(this.theme, config, (result) => this.hide(result), this.cancelCallback);
        this.overlay?.appendChild(this.dialog);
        this.addEventListeners();
    }

    /**
     * Show fullscreen dialog.
     */
    showFullscreen(options: DialogFullscreenOptions = {}, callback?: (value: unknown) => void): void {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return;
        }

        const config = resolveFullscreenConfig(options);

        this.callback = (callback as DialogCallback | undefined) ?? null;
        this.isActive = true;
        this.type = 'fullscreen';

        this.createFullscreenOverlay();
        this.dialog = buildFullscreenDialog(this.theme, config, (result) => this.hide(result));
        this.overlay?.appendChild(this.dialog);
        this.addEventListeners();
    }

    /**
     * Show command prompt dialog - large centered input for quick commands.
     */
    showCommandPrompt(options: DialogCommandOptions = {}, callback?: (value: string | null) => void): void {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return;
        }

        const config = resolveCommandConfig(options);

        this.callback = (callback as DialogCallback | undefined) ?? null;
        this.isActive = true;
        this.type = 'command';

        this.createOverlay();
        const { element, input } = buildCommandPromptDialog(this.theme, config, (result) => this.hide(result));
        this.dialog = element;
        this.activeInput = input;
        this.overlay?.appendChild(this.dialog);

        this.addEventListeners();
        this.focusFirstInput();
    }

    /**
     * Show progress dialog.
     */
    showProgress(options: DialogProgressOptions = {}, callbacks: DialogProgressCallbacks = {}): DialogAPI {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return this;
        }

        const config = resolveProgressConfig(options);

        // Set callbacks
        this.onProgress = callbacks.onProgress || options.onProgress || null;
        this.onComplete = callbacks.onComplete || options.onComplete || null;
        this.cancelCallback = callbacks.onCancel || options.onCancel || null;

        // Initialize progress state
        this.currentProgress = config.initialProgress;
        this.totalSteps = config.totalSteps;
        this.stepLabels = config.stepLabels;
        this.currentStep = config.currentStep;
        this.startTime = Date.now();

        this.isActive = true;
        this.type = 'progress';

        this.createOverlay();
        this.dialog = buildProgressDialog(this.theme, config, {
            hide: (result) => this.hide(result),
            onCancel: this.cancelCallback
        });
        this.overlay?.appendChild(this.dialog);
        this.addEventListeners();
        this.updateProgressDisplay();

        return this;
    }

    /**
     * Hide dialog with result.
     */
    hide(result: unknown = null): void {
        if (!this.isActive) return;

        this.removeEventListeners();
        this.removeDialog();
        this.removeOverlay();

        this.isActive = false;
        this.type = null;
        this.activeInput = null;

        if (this.callback) {
            const callback = this.callback;
            this.callback = null;
            callback(result);
        }

        if (this.cancelCallback) {
            this.cancelCallback = null;
        }
    }

    /**
     * Update message for active wait dialog.
     */
    updateMessage(newMessage: string): void {
        if (!this.isActive || this.type !== 'wait') {
            console.warn('No active wait dialog to update');
            return;
        }

        const messageElement = this.dialog?.querySelector('.agentlet-wait-message');
        if (messageElement) {
            messageElement.textContent = newMessage;
        }
    }

    /**
     * Focus on the first input element in the dialog.
     */
    focusFirstInput(): void {
        if (!this.dialog) return;

        const attemptFocus = (attempt = 0): void => {
            const firstInput = this.dialog?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select');
            if (firstInput && document.body.contains(firstInput)) {
                try {
                    firstInput.focus();

                    // Only <input>/<textarea> have .select(); a <select>'s
                    // type/tagName never match below, so this mirrors the
                    // original untyped check without calling .select() on it.
                    if (firstInput.tagName !== 'SELECT') {
                        const textLike = firstInput as HTMLInputElement | HTMLTextAreaElement;
                        if (
                            ((textLike as HTMLInputElement).type === 'text' ||
                                (textLike as HTMLInputElement).type === 'email' ||
                                (textLike as HTMLInputElement).type === 'password' ||
                                textLike.tagName === 'TEXTAREA') &&
                            textLike.value
                        ) {
                            textLike.select();
                        }
                    }
                } catch (error) {
                    console.warn('Failed to focus input:', error);
                }
            } else if (attempt < 5) {
                setTimeout(() => attemptFocus(attempt + 1), 50 * (attempt + 1));
            }
        };

        attemptFocus();
    }

    // =================
    // INFO DIALOG METHODS
    // =================

    /**
     * Show info dialog.
     */
    info(message: string, title = 'Information', callback?: (value: unknown) => void): void {
        return this.showInfo({ message, title, icon: 'ℹ️' }, callback);
    }

    /**
     * Show success dialog.
     */
    success(message: string, title = 'Success', callback?: (value: unknown) => void): void {
        return this.showInfo({ message, title, icon: '✅' }, callback);
    }

    /**
     * Show warning dialog.
     */
    warning(message: string, title = 'Warning', callback?: (value: unknown) => void): void {
        return this.showInfo({ message, title, icon: '⚠️' }, callback);
    }

    /**
     * Show error dialog.
     */
    error(message: string, title = 'Error', callback?: (value: unknown) => void): void {
        return this.showInfo({ message, title, icon: '❌' }, callback);
    }

    /**
     * Show confirm dialog.
     */
    confirm(message: string, title = 'Confirm', callback?: (value: 'cancel' | 'confirm') => void): void {
        return this.showInfo({
            message,
            title,
            icon: '❓',
            buttons: [
                { text: 'Cancel', value: 'cancel', secondary: true },
                { text: 'Confirm', value: 'confirm', primary: true }
            ]
        }, callback as ((value: unknown) => void) | undefined);
    }

    /**
     * Show yes/no dialog.
     */
    yesNo(message: string, title = 'Question', callback?: (value: 'no' | 'yes') => void): void {
        return this.showInfo({
            message,
            title,
            icon: '❓',
            buttons: [
                { text: 'No', value: 'no', secondary: true },
                { text: 'Yes', value: 'yes', primary: true }
            ]
        }, callback as ((value: unknown) => void) | undefined);
    }

    /**
     * Show choice dialog.
     */
    choice(
        message: string,
        choices: Array<string | { text: string; value: unknown }>,
        title = 'Choose',
        callback?: (value: unknown) => void
    ): void {
        const buttons: DialogButton[] = choices.map((choice, index) => ({
            text: typeof choice === 'string' ? choice : choice.text,
            value: typeof choice === 'string' ? choice : choice.value,
            primary: index === 0
        }));

        return this.showInfo({ message, title, icon: '📋', buttons }, callback);
    }

    // =================
    // INPUT DIALOG METHODS
    // =================

    /**
     * Simple text prompt.
     */
    prompt(message: string, defaultValue = '', callback?: (value: string | null) => void): void {
        return this.showInput({ message, defaultValue, inputType: 'text' }, callback);
    }

    /**
     * Password prompt.
     */
    promptPassword(message: string, callback?: (value: string | null) => void): void {
        return this.showInput({ message, inputType: 'password' }, callback);
    }

    /**
     * Email prompt.
     */
    promptEmail(message: string, defaultValue = '', callback?: (value: string | null) => void): void {
        return this.showInput({ message, defaultValue, inputType: 'email' }, callback);
    }

    /**
     * Textarea prompt.
     */
    promptTextarea(message: string, defaultValue = '', rows = 4, callback?: (value: string | null) => void): void {
        return this.showInput({ message, defaultValue, inputType: 'textarea', rows }, callback);
    }

    /**
     * AI prompt (textarea).
     */
    promptAI(message: string, defaultValue = '', callback?: (value: string | null) => void): void {
        return this.showInput({
            message,
            defaultValue,
            inputType: 'textarea',
            title: 'AI Prompt',
            rows: 6
        }, callback);
    }

    // =================
    // COMMAND PROMPT METHODS
    // =================

    /**
     * Show command prompt dialog. `options` may be a bare string, treated as `placeholder`.
     */
    commandPrompt(options: DialogCommandOptions | string = {}, callback?: (value: string | null) => void): void {
        // Support legacy API (string as first param) for backward compatibility
        const resolvedOptions: DialogCommandOptions = typeof options === 'string' ? { placeholder: options } : options;
        return this.showCommandPrompt(resolvedOptions, callback);
    }

    /**
     * Quick command prompt - minimal setup.
     */
    quickCommand(placeholder = 'Enter command...', callback?: (value: string | null) => void): void {
        return this.showCommandPrompt({
            placeholder,
            showHeader: false,
            showMessage: false,
            fontSize: '28px'
        }, callback);
    }

    // =================
    // FULLSCREEN DIALOG METHODS
    // =================

    /**
     * Show fullscreen dialog.
     */
    fullscreen(options: DialogFullscreenOptions, callback?: (value: unknown) => void): void {
        return this.showFullscreen(options, callback);
    }

    // =================
    // WAIT DIALOG METHODS
    // =================

    /**
     * Show AI processing dialog. `options` may be a bare string, treated as `message`,
     * in which case a 2nd positional `allowCancel` boolean is also accepted.
     */
    showAIProcessing(options: DialogWaitOptions | string = {}, allowCancelOrCallback?: boolean | (() => void), maybeCallback?: () => void): void {
        let resolvedOptions: DialogWaitOptions;
        let cancelCallback: (() => void) | undefined;

        if (typeof options === 'string') {
            resolvedOptions = {
                message: options,
                allowCancel: (allowCancelOrCallback as boolean) || false
            };
            cancelCallback = maybeCallback;
        } else {
            resolvedOptions = options;
            cancelCallback = allowCancelOrCallback as (() => void) | undefined;
        }

        return this.showWait({
            title: resolvedOptions.title || 'AI Processing',
            message: resolvedOptions.message || 'Processing with AI...',
            icon: resolvedOptions.showIcon !== false ? (resolvedOptions.icon || '🤖') : '',
            allowCancel: resolvedOptions.allowCancel || false,
            showSpinner: resolvedOptions.showSpinner !== false,
            ...resolvedOptions
        }, cancelCallback);
    }

    /**
     * Show loading dialog.
     */
    showLoading(message = 'Loading...', allowCancel = false, cancelCallback?: () => void): void {
        return this.showWait({ message, title: 'Loading', icon: '⏳', allowCancel }, cancelCallback);
    }

    /**
     * Show analyzing dialog.
     */
    showAnalyzing(message = 'Analyzing...', allowCancel = false, cancelCallback?: () => void): void {
        return this.showWait({ message, title: 'Analyzing', icon: '🔍', allowCancel }, cancelCallback);
    }

    /**
     * Show thinking dialog.
     */
    showThinking(message = 'Thinking...', allowCancel = false, cancelCallback?: () => void): void {
        return this.showWait({ message, title: 'Thinking', icon: '💭', allowCancel }, cancelCallback);
    }

    // =================
    // PROGRESS DIALOG METHODS
    // =================

    /**
     * Show simple progress bar.
     */
    showProgressBar(message = 'Processing...', options: DialogProgressOptions = {}): DialogAPI {
        return this.showProgress({
            message,
            showPercentage: true,
            showETA: true,
            closable: true,
            ...options
        });
    }

    /**
     * Show progress bar with steps.
     */
    showProgressWithSteps(steps: string[], options: DialogProgressOptions = {}): DialogAPI {
        return this.showProgress({
            stepLabels: steps,
            showSteps: true,
            totalSteps: steps.length,
            showPercentage: true,
            closable: true,
            ...options
        });
    }

    /**
     * Show progress bar for batch processing.
     */
    showBatchProgress(totalItems: number, options: DialogProgressOptions = {}): DialogAPI {
        return this.showProgress({
            message: `Processing 0 of ${totalItems} items...`,
            showPercentage: true,
            showETA: true,
            closable: true,
            ...options
        });
    }

    // =================
    // INTERNAL METHODS
    // =================

    /**
     * Create overlay element.
     */
    createOverlay(): void {
        this.overlay = buildOverlay(this.type || '');
        document.body.appendChild(this.overlay);

        activateOverlayBodyState();
        // Block background scroll when dialog is open, preserve scroll position.
        // (matches activateOverlayBodyState's class ordering: 'agentlet-overlay-active'
        // is added first, then scroll is preserved, then 'agentlet-dialog-open'.)
        this.preserveScrollPosition();
        document.body.classList.add('agentlet-dialog-open');
    }

    /**
     * Create fullscreen overlay element.
     */
    createFullscreenOverlay(): void {
        this.overlay = buildFullscreenOverlay(this.type || '');
        document.body.appendChild(this.overlay);

        document.body.classList.add('agentlet-overlay-active');
        this.preserveScrollPosition();
        document.body.classList.add('agentlet-dialog-open');
    }

    /**
     * Remove overlay element.
     */
    removeOverlay(): void {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;

            deactivateOverlayBodyState();
            this.restoreScrollPosition();
        }
    }

    /**
     * Update progress dialog display.
     */
    updateProgressDisplay(): void {
        if (!this.isActive || this.type !== 'progress' || !this.dialog) return;
        renderProgressDisplay(this.dialog, this.currentProgress, this.startTime);
    }

    /**
     * Update progress percentage and message.
     */
    updateProgress(percentage: number, message?: string): DialogAPI {
        if (!this.isActive || this.type !== 'progress') {
            console.warn('No active progress dialog to update');
            return this;
        }

        this.currentProgress = Math.max(0, Math.min(100, percentage));

        if (message) {
            const messageElement = this.dialog?.querySelector('.agentlet-progress-message');
            if (messageElement) {
                messageElement.textContent = message;
            }
        }

        this.updateProgressDisplay();

        if (this.onProgress) {
            this.onProgress(this.currentProgress, message);
        }

        return this;
    }

    /**
     * Set current step in progress dialog.
     */
    setStep(stepIndex: number, stepMessage?: string): DialogAPI {
        if (!this.isActive || this.type !== 'progress') {
            console.warn('No active progress dialog to update');
            return this;
        }

        this.currentStep = stepIndex;

        if (this.dialog) {
            renderStepProgress(this.dialog, stepIndex, this.theme.primaryColor);
        }

        if (stepMessage) {
            const messageElement = this.dialog?.querySelector('.agentlet-progress-message');
            if (messageElement) {
                messageElement.textContent = stepMessage;
            }
        }

        if (this.totalSteps > 0) {
            const stepProgress = (stepIndex / this.totalSteps) * 100;
            this.updateProgress(stepProgress);
        }

        return this;
    }

    /**
     * Complete progress dialog.
     */
    completeProgress(message = 'Complete!'): DialogAPI {
        if (!this.isActive || this.type !== 'progress') {
            console.warn('No active progress dialog to complete');
            return this;
        }

        this.updateProgress(100, message);

        if (this.dialog) {
            completeAllSteps(this.dialog);
        }

        if (this.onComplete) {
            this.onComplete();
        }

        // Auto-close if enabled.
        //
        // Known quirk (preserved from the pre-split implementation): this
        // always reads `true` for `dialog.dataset.autoClose !== 'false'`
        // because nothing ever sets `dataset.autoClose`, so the dialog
        // auto-closes after 2000ms regardless of the `autoClose` option.
        const shouldAutoClose = this.dialog?.dataset?.autoClose !== 'false';
        if (shouldAutoClose) {
            setTimeout(() => {
                if (this.isActive) {
                    this.hide('complete');
                }
            }, 2000);
        }

        return this;
    }

    /**
     * Add CSS animations for dialogs.
     */
    addDialogStyles(): void {
        injectDialogStyles();
    }

    /**
     * Remove dialog element.
     */
    removeDialog(): void {
        if (this.dialog) {
            this.dialog.remove();
            this.dialog = null;
        }
    }

    /**
     * Add event listeners.
     */
    addEventListeners(): void {
        document.addEventListener('keydown', this.handleKeydown);
        if (this.overlay) {
            this.overlay.addEventListener('click', this.handleOverlayClick);
        }
    }

    /**
     * Remove event listeners.
     */
    removeEventListeners(): void {
        document.removeEventListener('keydown', this.handleKeydown);
        if (this.overlay) {
            this.overlay.removeEventListener('click', this.handleOverlayClick);
        }
    }

    /**
     * Handle keydown events.
     */
    handleKeydown(event: KeyboardEvent): void {
        if (!this.isActive) return;

        if (event.key === 'Escape') {
            event.preventDefault();

            if (this.type === 'wait') {
                // Only allow escape in wait dialogs if cancel is allowed.
                const cancelSection = this.dialog?.querySelector('.agentlet-wait-buttons');
                if (cancelSection && this.cancelCallback) {
                    this.cancelCallback();
                    this.hide(true);
                }
            } else if (this.type === 'input') {
                this.hide(null);
            } else if (this.type === 'command') {
                this.hide(null);
            } else {
                this.hide('cancel');
            }
        } else if (event.key === 'Enter') {
            event.preventDefault();

            if (this.type === 'input') {
                // For textarea, require Ctrl+Enter or Cmd+Enter.
                if (this.activeInput?.tagName.toLowerCase() === 'textarea') {
                    if (event.ctrlKey || event.metaKey) {
                        this.hide(this.activeInput.value);
                    }
                } else {
                    this.hide(this.activeInput?.value);
                }
            } else if (this.type === 'command') {
                // For command prompt, Enter submits directly.
                if (this.activeInput?.tagName.toLowerCase() === 'textarea') {
                    if (event.ctrlKey || event.metaKey) {
                        this.hide(this.activeInput.value.trim());
                    }
                } else {
                    this.hide(this.activeInput?.value.trim());
                }
            } else if (this.type === 'info') {
                // Click primary button if available.
                //
                // Known quirk (preserved from the pre-split implementation):
                // this selector never matches in practice. Both browsers and
                // jsdom normalize an inline `background: #007bff` style to
                // `background: rgb(0, 123, 255)` when it is read back, so
                // `button[style*="background: #007bff"]` never finds the
                // primary button and Enter is a no-op on info dialogs.
                const primaryButton = this.dialog?.querySelector<HTMLButtonElement>(`button[style*="background: ${this.theme.primaryColor || '#007bff'}"]`);
                if (primaryButton && !primaryButton.disabled) {
                    primaryButton.click();
                }
            }
        }
    }

    /**
     * Handle overlay click.
     */
    handleOverlayClick(event: MouseEvent): void {
        if (event.target === this.overlay) {
            if (this.type === 'input') {
                this.hide(null);
            } else if (this.type === 'command') {
                // Check if command dialog allows closing on overlay click.
                //
                // Known quirk (preserved from the pre-split implementation):
                // this always reads `true`, because nothing ever sets
                // `dialog.dataset.closeOnOverlay`, so `closeOnOverlay: false`
                // has no effect and the command dialog always closes.
                const closeOnOverlay = this.dialog?.dataset?.closeOnOverlay !== 'false';
                if (closeOnOverlay) {
                    this.hide(null);
                }
            } else if (this.type === 'info') {
                this.hide('cancel');
            } else if (this.type === 'fullscreen') {
                // Check if fullscreen dialog allows closing on overlay click.
                // Same `dataset.closeOnOverlay` quirk as the command dialog above.
                const closeOnOverlay = this.dialog?.dataset?.closeOnOverlay !== 'false';
                if (closeOnOverlay) {
                    this.hide('cancel');
                }
            }
            // Wait/progress dialogs don't close on overlay click.
        }
    }

    /**
     * Escape HTML to prevent XSS.
     */
    escapeHtml(text: string): string {
        return escapeHtmlImpl(text);
    }
}

// Export for ES modules
export default Dialog;

// Also export for global scope for compatibility
if (typeof window !== 'undefined') {
    (window as unknown as { Dialog: typeof Dialog }).Dialog = Dialog;
}
