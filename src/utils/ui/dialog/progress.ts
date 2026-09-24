/**
 * Builds the `'progress'` dialog (header, message, progress bar,
 * percentage/ETA, and an optional step list) and the pure DOM-update
 * helpers used by `Dialog.updateProgress`/`setStep`/`completeProgress`.
 * Backs `showProgressBar`, `showProgressWithSteps`, and `showBatchProgress`.
 */
import { Z_INDEX } from '../ZIndex.js';
import type { DialogProgressOptions } from '../../../types/public-api';
import type { DialogTheme, ProgressDialogHandlers, ResolvedProgressConfig } from './types';

/** Applies `showProgress()`'s defaults to caller-supplied options. */
export function resolveProgressConfig(options: DialogProgressOptions): ResolvedProgressConfig {
    return {
        title: options.title || 'Processing',
        message: options.message || 'Processing...',
        icon: options.icon || '📊',
        showPercentage: options.showPercentage !== false,
        showETA: options.showETA !== false,
        showSteps: options.showSteps !== false,
        animated: options.animated !== false,
        closable: options.closable || false,
        autoClose: options.autoClose !== false,
        initialProgress: options.initialProgress || 0,
        totalSteps: options.totalSteps || 1,
        stepLabels: options.stepLabels || [],
        currentStep: options.currentStep || 0,
        ...options
    } as ResolvedProgressConfig;
}

const STEP_DONE_ICON = '✅';
const STEP_CURRENT_ICON = '⏳';
const STEP_PENDING_ICON = '⚪';
const STEP_DONE_COLOR = '#28a745';
const STEP_PENDING_COLOR = '#999999';

/** Builds the progress dialog element (header, message, progress bar, percentage/ETA, optional steps). */
export function buildProgressDialog(theme: DialogTheme, config: ResolvedProgressConfig, handlers: ProgressDialogHandlers): HTMLDivElement {
    const dialog = document.createElement('div');
    dialog.className = 'agentlet-progress-dialog';
    dialog.style.cssText = `
        background: ${theme.backgroundColor || '#ffffff'};
        border-radius: ${theme.borderRadius || '8px'};
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        max-width: 500px;
        min-width: 400px;
        font-family: ${theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
        position: relative;
        z-index: ${Z_INDEX.DIALOG};
    `;

    const header = document.createElement('div');
    header.className = 'agentlet-progress-header';
    header.style.cssText = `
        padding: 20px 20px 15px;
        border-bottom: 1px solid ${theme.borderColor || '#e0e0e0'};
        display: flex;
        align-items: center;
        gap: 10px;
    `;

    const icon = document.createElement('span');
    icon.textContent = config.icon;
    icon.style.cssText = 'font-size: 24px;';

    const title = document.createElement('h3');
    title.textContent = config.title;
    title.style.cssText = `
        margin: 0;
        color: ${theme.textColor || '#333333'};
        font-size: 18px;
        font-weight: 600;
        flex: 1;
    `;

    header.appendChild(icon);
    header.appendChild(title);

    if (config.closable) {
        const closeButton = document.createElement('button');
        closeButton.textContent = '×';
        closeButton.style.cssText = `
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${theme.textColor || '#333333'};
            opacity: 0.6;
            transition: opacity 0.2s;
        `;

        closeButton.addEventListener('click', () => {
            if (handlers.onCancel) {
                handlers.onCancel();
            }
            handlers.hide('cancel');
        });

        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.opacity = '1';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.opacity = '0.6';
        });

        header.appendChild(closeButton);
    }

    const content = document.createElement('div');
    content.className = 'agentlet-progress-content';
    content.style.cssText = 'padding: 20px;';

    const message = document.createElement('p');
    message.className = 'agentlet-progress-message';
    message.textContent = config.message;
    message.style.cssText = `
        margin: 0 0 20px 0;
        color: ${theme.textColor || '#333333'};
        line-height: 1.5;
    `;

    content.appendChild(message);

    const progressContainer = document.createElement('div');
    progressContainer.className = 'agentlet-progress-container';
    progressContainer.style.cssText = 'margin-bottom: 15px;';

    const progressBar = document.createElement('div');
    progressBar.className = 'agentlet-progress-bar';
    progressBar.style.cssText = `
        width: 100%;
        height: 20px;
        background: ${theme.borderColor || '#e0e0e0'};
        border-radius: 10px;
        overflow: hidden;
        position: relative;
    `;

    const progressFill = document.createElement('div');
    progressFill.className = 'agentlet-progress-fill';
    progressFill.style.cssText = `
        height: 100%;
        background: ${theme.primaryColor || '#007bff'};
        width: ${config.initialProgress}%;
        transition: width 0.3s ease;
        position: relative;
    `;

    if (config.animated) {
        progressFill.style.backgroundImage = `
            linear-gradient(45deg,
                rgba(255, 255, 255, 0.2) 25%,
                transparent 25%,
                transparent 50%,
                rgba(255, 255, 255, 0.2) 50%,
                rgba(255, 255, 255, 0.2) 75%,
                transparent 75%
            )`;
        progressFill.style.backgroundSize = '20px 20px';
        progressFill.style.animation = 'agentlet-progress-animate 1s linear infinite';
    }

    progressBar.appendChild(progressFill);
    progressContainer.appendChild(progressBar);
    content.appendChild(progressContainer);

    const infoContainer = document.createElement('div');
    infoContainer.className = 'agentlet-progress-info';
    infoContainer.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        font-size: 14px;
        color: ${theme.textColor || '#666666'};
    `;

    if (config.showPercentage) {
        const percentage = document.createElement('span');
        percentage.className = 'agentlet-progress-percentage';
        percentage.textContent = `${Math.round(config.initialProgress)}%`;
        infoContainer.appendChild(percentage);
    }

    if (config.showETA) {
        const eta = document.createElement('span');
        eta.className = 'agentlet-progress-eta';
        eta.textContent = 'Calculating...';
        infoContainer.appendChild(eta);
    }

    if (config.showPercentage || config.showETA) {
        content.appendChild(infoContainer);
    }

    if (config.showSteps && config.stepLabels && config.stepLabels.length > 0) {
        const stepsContainer = document.createElement('div');
        stepsContainer.className = 'agentlet-progress-steps';
        stepsContainer.style.cssText = 'margin-bottom: 15px;';

        const stepsTitle = document.createElement('div');
        stepsTitle.textContent = 'Steps:';
        stepsTitle.style.cssText = `
            font-weight: 600;
            margin-bottom: 10px;
            color: ${theme.textColor || '#333333'};
        `;
        stepsContainer.appendChild(stepsTitle);

        config.stepLabels.forEach((stepLabel, index) => {
            const step = document.createElement('div');
            step.className = `agentlet-progress-step agentlet-progress-step-${index}`;
            step.style.cssText = `
                padding: 5px 0;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 14px;
            `;

            const stepIcon = document.createElement('span');
            stepIcon.className = 'agentlet-progress-step-icon';
            if (index < config.currentStep) {
                stepIcon.textContent = STEP_DONE_ICON;
                step.style.color = STEP_DONE_COLOR;
            } else if (index === config.currentStep) {
                stepIcon.textContent = STEP_CURRENT_ICON;
                step.style.color = theme.primaryColor || '#007bff';
            } else {
                stepIcon.textContent = STEP_PENDING_ICON;
                step.style.color = STEP_PENDING_COLOR;
            }

            const stepText = document.createElement('span');
            stepText.textContent = stepLabel;

            step.appendChild(stepIcon);
            step.appendChild(stepText);
            stepsContainer.appendChild(step);
        });

        content.appendChild(stepsContainer);
    }

    dialog.appendChild(header);
    dialog.appendChild(content);

    return dialog;
}

/** Updates the fill width, percentage text, and ETA text of an already-built progress dialog. */
export function renderProgressDisplay(dialogEl: HTMLElement, currentProgress: number, startTime: number | null): void {
    const progressFill = dialogEl.querySelector<HTMLElement>('.agentlet-progress-fill');
    const percentage = dialogEl.querySelector<HTMLElement>('.agentlet-progress-percentage');
    const eta = dialogEl.querySelector<HTMLElement>('.agentlet-progress-eta');

    if (progressFill) {
        progressFill.style.width = `${currentProgress}%`;
    }

    if (percentage) {
        percentage.textContent = `${Math.round(currentProgress)}%`;
    }

    if (eta && startTime) {
        const elapsed = Date.now() - startTime;
        const rate = currentProgress / elapsed;
        const remaining = (100 - currentProgress) / rate;

        if (currentProgress > 5 && remaining > 0) {
            const seconds = Math.round(remaining / 1000);
            if (seconds < 60) {
                eta.textContent = `ETA: ${seconds}s`;
            } else {
                const minutes = Math.floor(seconds / 60);
                const remainingSeconds = seconds % 60;
                eta.textContent = `ETA: ${minutes}m ${remainingSeconds}s`;
            }
        } else {
            eta.textContent = 'Calculating...';
        }
    }
}

/** Updates each step's icon/color for `setStep(stepIndex)`. */
export function renderStepProgress(dialogEl: HTMLElement, stepIndex: number, primaryColor: string | undefined): void {
    const steps = dialogEl.querySelectorAll<HTMLElement>('.agentlet-progress-step');
    steps.forEach((step, index) => {
        const icon = step.querySelector<HTMLElement>('.agentlet-progress-step-icon');
        if (icon) {
            if (index < stepIndex) {
                icon.textContent = STEP_DONE_ICON;
                step.style.color = STEP_DONE_COLOR;
            } else if (index === stepIndex) {
                icon.textContent = STEP_CURRENT_ICON;
                step.style.color = primaryColor || '#007bff';
            } else {
                icon.textContent = STEP_PENDING_ICON;
                step.style.color = STEP_PENDING_COLOR;
            }
        }
    });
}

/** Marks every step as done, for `completeProgress()`. */
export function completeAllSteps(dialogEl: HTMLElement): void {
    const steps = dialogEl.querySelectorAll<HTMLElement>('.agentlet-progress-step');
    steps.forEach(step => {
        const icon = step.querySelector<HTMLElement>('.agentlet-progress-step-icon');
        if (icon) {
            icon.textContent = STEP_DONE_ICON;
            step.style.color = STEP_DONE_COLOR;
        }
    });
}
