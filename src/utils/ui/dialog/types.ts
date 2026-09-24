/**
 * Internal types shared by the `dialog/` builder modules and the
 * `Dialog` facade. These describe the module's own working shapes, not
 * the public API - the public option/button shapes are imported from
 * `src/types/public-api.d.ts` and re-exported/extended here where a
 * builder needs the "resolved" (defaults applied) version of an options
 * object.
 */
import type { AgentletTheme, DialogButton } from '../../../types/public-api';

/** Dialog theme is always partial: callers may supply `{}` or a subset. */
export type DialogTheme = Partial<AgentletTheme>;

/** Called by a builder's buttons/keyboard handlers to close the dialog. */
export type HideFn = (result?: unknown) => void;

/** Resolved (defaults applied) config for {@link buildInfoDialog}. */
export interface ResolvedInfoConfig {
    title: string;
    message: string;
    icon: string;
    allowHtml: boolean;
    buttons: DialogButton[];
    maxWidth?: string;
    minWidth?: string;
    width?: string;
}

/** Resolved (defaults applied) config for {@link buildInputDialog}. */
export interface ResolvedInputConfig {
    title: string;
    message: string;
    placeholder: string;
    defaultValue: string;
    inputType: string;
    rows: number;
    resizable: boolean;
}

/** An input/input-dialog builder hands its live input element back to the caller. */
export interface InputDialogResult {
    element: HTMLDivElement;
    input: HTMLInputElement | HTMLTextAreaElement;
}

/** Resolved (defaults applied) config for {@link buildWaitDialog}. */
export interface ResolvedWaitConfig {
    title: string;
    message: string;
    icon: string;
    showSpinner: boolean;
    allowCancel: boolean;
}

/** Resolved (defaults applied) config for {@link buildCommandPromptDialog}. */
export interface ResolvedCommandConfig {
    title: string;
    message: string;
    icon: string;
    placeholder: string;
    defaultValue: string;
    inputType: string;
    fontSize: string;
    showHeader: boolean;
    showMessage: boolean;
    allowHtml: boolean;
    closeOnOverlay: boolean;
}

/** Resolved (defaults applied) config for {@link buildFullscreenDialog}. */
export interface ResolvedFullscreenConfig {
    title: string;
    message: string;
    icon: string;
    allowHtml: boolean;
    buttons: DialogButton[];
    customContent: string | HTMLElement | null;
    scrollable: boolean;
    closeOnOverlay: boolean;
    showHeaderCloseButton: boolean;
}

/** Resolved (defaults applied) config for {@link buildProgressDialog}. */
export interface ResolvedProgressConfig {
    title: string;
    message: string;
    icon: string;
    showPercentage: boolean;
    showETA: boolean;
    showSteps: boolean;
    animated: boolean;
    closable: boolean;
    autoClose: boolean;
    initialProgress: number;
    totalSteps: number;
    stepLabels: string[];
    currentStep: number;
}

/** Handlers a progress dialog's header close button needs at build time. */
export interface ProgressDialogHandlers {
    hide: HideFn;
    onCancel?: (() => void) | null;
}
