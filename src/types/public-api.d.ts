/**
 * Hand-written public API declarations for agentlet-core.
 *
 * This file describes `window.agentlet` (built at runtime by
 * `src/core/GlobalAPI.js`), the `Module` base class agentlets extend
 * (`src/core/Module.js`), and the `AgentletCore` constructor config
 * (`src/index.js`) exactly as they behave today.
 *
 * It is hand-written for now (step 2.2 of the progressive TypeScript
 * migration). Step 2.3 will convert some of the underlying classes
 * (EventBus, ThemeManager, ZIndex, Module, ...) to `.ts` and derive the
 * corresponding parts of this file from them instead of hand-maintaining
 * both. JavaScript agentlet authors never need to write TypeScript to
 * benefit from these types; see docs/typescript.md.
 *
 * Scope note: framework-internal wiring methods that exist on the
 * `AgentletCore` instance (DOM construction helpers, one-time setup
 * routines invoked during `init()`) are included below for completeness
 * since `window.agentlet` literally is the `AgentletCore` instance, but
 * are marked `@internal` in their doc comments because agentlet authors
 * are not expected to call them directly.
 */

/* ------------------------------------------------------------------ */
/* Dialog (window.agentlet.utils.Dialog)                              */
/* ------------------------------------------------------------------ */

/** A single button rendered in an info/fullscreen dialog. */
export interface DialogButton {
    /** Button label. */
    text: string;
    /** Value passed to the dialog callback when this button is clicked. */
    value: unknown;
    /** Renders as the accent/primary button; also enables Enter-key activation. */
    primary?: boolean;
    /** Renders as a red/destructive button (ignored if `primary` is set). */
    danger?: boolean;
    disabled?: boolean;
    /** Accepted but currently has no visual effect in the built-in dialog renderer. */
    secondary?: boolean;
}

export interface DialogInfoOptions {
    title?: string;
    message?: string;
    icon?: string;
    /** Render `message` as HTML instead of plain text. */
    allowHtml?: boolean;
    /** Defaults to a single "OK" button. */
    buttons?: DialogButton[];
    maxWidth?: string;
    minWidth?: string;
    width?: string;
}

export interface DialogInputOptions {
    title?: string;
    message?: string;
    placeholder?: string;
    defaultValue?: string;
    inputType?: 'text' | 'password' | 'email' | 'textarea' | string;
    /** Only used when `inputType` is `'textarea'`. */
    rows?: number;
    /** Only meaningful when `inputType` is `'textarea'`; set false to disable manual resize. */
    resizable?: boolean;
}

export interface DialogWaitOptions {
    title?: string;
    message?: string;
    icon?: string;
    showSpinner?: boolean;
    allowCancel?: boolean;
    /** Only read by `showAIProcessing()`: set false to omit the icon entirely (overridden by an empty `icon`). */
    showIcon?: boolean;
}

export interface DialogProgressCallbacks {
    onProgress?: (progress: number, message?: string) => void;
    onComplete?: () => void;
    onCancel?: () => void;
}

export interface DialogProgressOptions extends DialogProgressCallbacks {
    title?: string;
    message?: string;
    icon?: string;
    showPercentage?: boolean;
    showETA?: boolean;
    showSteps?: boolean;
    animated?: boolean;
    closable?: boolean;
    /**
     * Whether `completeProgress()` auto-closes the dialog after 2000ms.
     * Defaults to `true`; set `false` to keep the dialog open until it is
     * closed explicitly (e.g. via `hide()` or a closable header button).
     */
    autoClose?: boolean;
    initialProgress?: number;
    totalSteps?: number;
    stepLabels?: string[];
    currentStep?: number;
}

export interface DialogFullscreenOptions {
    title?: string;
    message?: string;
    icon?: string;
    allowHtml?: boolean;
    /** Defaults to a single "Close" button. */
    buttons?: DialogButton[];
    customContent?: string | HTMLElement | null;
    scrollable?: boolean;
    closeOnOverlay?: boolean;
    showHeaderCloseButton?: boolean;
}

export interface DialogCommandOptions {
    title?: string;
    message?: string;
    icon?: string;
    placeholder?: string;
    defaultValue?: string;
    inputType?: 'text' | 'textarea' | string;
    /** CSS font-size, e.g. `'24px'`. */
    fontSize?: string;
    showHeader?: boolean;
    showMessage?: boolean;
    allowHtml?: boolean;
    closeOnOverlay?: boolean;
}

/**
 * `window.agentlet.utils.Dialog` is a singleton *instance* (there are no
 * static members on the underlying class), so this is declared as an
 * instance interface rather than a `declare class`.
 */
export interface DialogAPI {
    readonly isActive: boolean;

    /**
     * Sets the element/root dialogs mount into (a `ShadowRoot`, or an
     * `HTMLElement` such as `document.body`). AgentletCore calls this
     * automatically once its UI root exists; pass `null` to fall back to
     * `window.agentlet.ui.root`, or `document.body` when neither is set
     * (standalone use of the `Dialog` class without AgentletCore).
     */
    setRoot(root: ShadowRoot | HTMLElement | null): void;

    /**
     * Resolves the element/root dialogs currently mount into: an explicitly
     * set root (setRoot()), else `window.agentlet.ui.root`, else
     * `document.body` (standalone use of the `Dialog` class without
     * AgentletCore).
     */
    getRoot(): ShadowRoot | HTMLElement;

    show(type: 'info', options?: DialogInfoOptions, callback?: (value: unknown) => void): void;
    show(type: 'input', options?: DialogInputOptions, callback?: (value: string | null) => void): void;
    show(type: 'wait', options?: DialogWaitOptions, cancelCallback?: () => void): void;
    show(type: 'progress', options?: DialogProgressOptions, callbacks?: DialogProgressCallbacks): DialogAPI;
    show(type: 'fullscreen', options?: DialogFullscreenOptions, callback?: (value: unknown) => void): void;
    show(type: 'command', options?: DialogCommandOptions, callback?: (value: string | null) => void): void;

    showInfo(options?: DialogInfoOptions, callback?: (value: unknown) => void): void;
    showInput(options?: DialogInputOptions, callback?: (value: string | null) => void): void;
    showWait(options?: DialogWaitOptions, cancelCallback?: () => void): void;
    showFullscreen(options?: DialogFullscreenOptions, callback?: (value: unknown) => void): void;
    showCommandPrompt(options?: DialogCommandOptions, callback?: (value: string | null) => void): void;
    /** Returns `this` so `updateProgress`/`setStep`/`completeProgress` can be chained. */
    showProgress(options?: DialogProgressOptions, callbacks?: DialogProgressCallbacks): DialogAPI;

    /** Closes the active dialog and invokes its callback with `result`. No-op if no dialog is active. */
    hide(result?: unknown): void;
    /** Updates the message of an active `'wait'`-type dialog only; no-op (with a warning) otherwise. */
    updateMessage(newMessage: string): void;

    info(message: string, title?: string, callback?: (value: unknown) => void): void;
    success(message: string, title?: string, callback?: (value: unknown) => void): void;
    warning(message: string, title?: string, callback?: (value: unknown) => void): void;
    error(message: string, title?: string, callback?: (value: unknown) => void): void;
    confirm(message: string, title?: string, callback?: (value: 'cancel' | 'confirm') => void): void;
    yesNo(message: string, title?: string, callback?: (value: 'no' | 'yes') => void): void;
    choice(
        message: string,
        choices: Array<string | { text: string; value: unknown }>,
        title?: string,
        callback?: (value: unknown) => void
    ): void;

    prompt(message: string, defaultValue?: string, callback?: (value: string | null) => void): void;
    promptPassword(message: string, callback?: (value: string | null) => void): void;
    promptEmail(message: string, defaultValue?: string, callback?: (value: string | null) => void): void;
    promptTextarea(
        message: string,
        defaultValue?: string,
        rows?: number,
        callback?: (value: string | null) => void
    ): void;
    promptAI(message: string, defaultValue?: string, callback?: (value: string | null) => void): void;

    /** `options` may be a bare string, treated as `placeholder` (legacy call form). */
    commandPrompt(options?: DialogCommandOptions | string, callback?: (value: string | null) => void): void;
    quickCommand(placeholder?: string, callback?: (value: string | null) => void): void;

    fullscreen(options: DialogFullscreenOptions, callback?: (value: unknown) => void): void;

    /**
     * `options` may be a bare string, treated as `message` (legacy call
     * form). In that legacy form the code also reads a 2nd positional
     * `allowCancel` boolean via `arguments[1]` before the callback, which
     * this overload exposes explicitly.
     */
    showAIProcessing(message: string, allowCancel?: boolean, cancelCallback?: () => void): void;
    showAIProcessing(options?: DialogWaitOptions, cancelCallback?: () => void): void;
    showLoading(message?: string, allowCancel?: boolean, cancelCallback?: () => void): void;
    showAnalyzing(message?: string, allowCancel?: boolean, cancelCallback?: () => void): void;
    showThinking(message?: string, allowCancel?: boolean, cancelCallback?: () => void): void;

    showProgressBar(message?: string, options?: DialogProgressOptions): DialogAPI;
    showProgressWithSteps(steps: string[], options?: DialogProgressOptions): DialogAPI;
    showBatchProgress(totalItems: number, options?: DialogProgressOptions): DialogAPI;

    /** Updates the active progress dialog. Returns `this` for chaining. */
    updateProgress(percentage: number, message?: string): DialogAPI;
    setStep(stepIndex: number, stepMessage?: string): DialogAPI;
    completeProgress(message?: string): DialogAPI;
}

/* ------------------------------------------------------------------ */
/* MessageBubble (window.agentlet.utils.MessageBubble)                */
/* ------------------------------------------------------------------ */

export type MessageBubbleType = 'info' | 'success' | 'warning' | 'error' | 'custom';

export interface MessageBubbleOptions {
    message?: string;
    type?: MessageBubbleType;
    title?: string | null;
    /** Emoji or HTML snippet. */
    icon?: string | null;
    /** Milliseconds; `0` disables auto-hide. */
    duration?: number;
    closable?: boolean;
    allowHtml?: boolean;
    position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
    style?: Partial<CSSStyleDeclaration>;
    onClick?: ((event: MouseEvent) => void) | null;
    onClose?: ((event: CustomEvent) => void) | null;
}

export interface MessageBubbleRecord {
    element: HTMLElement;
    timer: ReturnType<typeof setTimeout> | null;
    options: MessageBubbleOptions;
}

export interface MessageBubbleAPI {
    /**
     * Sets the element/root the bubble container mounts into (a
     * `ShadowRoot`, or an `HTMLElement` such as `document.body`).
     * AgentletCore calls this automatically once its UI root exists; pass
     * `null` to fall back to `window.agentlet.ui.root`, or `document.body`
     * when neither is set (standalone use without AgentletCore).
     */
    setRoot(root: ShadowRoot | HTMLElement | null): void;
    /** Lazily creates the fixed-position container; idempotent. */
    init(): void;
    /** Shows one bubble and returns its id (e.g. `"bubble-1"`). */
    show(options?: MessageBubbleOptions): string;
    updateContainerPosition(position: string): void;
    hide(bubbleId: string): void;
    hideAll(): void;
    info(message: string, options?: MessageBubbleOptions): string;
    success(message: string, options?: MessageBubbleOptions): string;
    warning(message: string, options?: MessageBubbleOptions): string;
    error(message: string, options?: MessageBubbleOptions): string;
    custom(message: string, options?: MessageBubbleOptions): string;
    toast(message: string, type?: MessageBubbleType, duration?: number): string;
    notify(message: string, type?: MessageBubbleType, title?: string | null): string;
    loading(message?: string, options?: MessageBubbleOptions): string;
    getCount(): number;
    getBubble(bubbleId: string): MessageBubbleRecord | undefined;
    exists(bubbleId: string): boolean;
    updateMessage(bubbleId: string, newMessage: string, allowHtml?: boolean): boolean;
    cleanup(): void;
}

/* ------------------------------------------------------------------ */
/* ElementSelector (window.agentlet.utils.ElementSelector)            */
/* ------------------------------------------------------------------ */

export interface ElementSelectorStartOptions {
    /** Restricts which elements can be picked, e.g. `'button, a'`. */
    selector?: string;
    /** Custom overlay instruction text. */
    message?: string;
}

export interface ElementInfo {
    tagName: string;
    id: string | null;
    className: string | null;
    classes: string[];
    /** Trimmed text content, truncated to 100 characters. */
    text: string | null;
    attributes: Record<string, string>;
    position: { x: number; y: number; width: number; height: number };
    styles: {
        display: string;
        visibility: string;
        backgroundColor: string;
        color: string;
        fontSize: string;
        fontFamily: string;
    };
    xpath: string;
    cssSelector: string;
    isVisible: boolean;
    hasChildren: boolean;
    parent: string | null;
}

export interface ElementSelectorAPI {
    readonly isActive: boolean;
    /** Activates click-to-select mode; no-ops with a warning if already active. */
    start(callback: (element: Element, info: ElementInfo) => void, options?: ElementSelectorStartOptions): void;
    stop(): void;
    getElementFromPoint(x: number, y: number): Element | null;
    isInternalElement(element: Element | null): boolean;
    isElementSelectable(element: Element | null): boolean;
    findSelectableElement(element: Element | null): Element | null;
    selectElement(element: Element): void;
    highlightElement(element: Element): void;
    hideHighlight(): void;
    getElementInfo(element: Element | null): ElementInfo | null;
    getElementAttributes(element: Element): Record<string, string>;
    getXPath(element: Element): string;
    generateCSSSelector(element: Element): string;
    isElementVisible(element: Element): boolean;
}

/** The raw `ElementSelector` class, exposed as `window.agentlet.ElementSelectorClass`. */
export interface ElementSelectorConstructor {
    new (): ElementSelectorAPI;
}

/* ------------------------------------------------------------------ */
/* ScreenCapture (window.agentlet.utils.ScreenCapture)                */
/* ------------------------------------------------------------------ */

/**
 * Options forwarded to html2canvas. The exact set of keys html2canvas
 * accepts is not modeled here (agentlet-core just merges this object over
 * its own defaults and passes it through), so extra keys are allowed via
 * the index signature.
 */
export interface Html2CanvasOptions {
    allowTaint?: boolean;
    useCORS?: boolean;
    scale?: number;
    backgroundColor?: string | null;
    removeContainer?: boolean;
    logging?: boolean;
    imageTimeout?: number;
    onclone?: ((doc: Document) => void) | null;
    [key: string]: unknown;
}

export interface ScreenCaptureAsDataURLOptions extends Html2CanvasOptions {
    format?: string;
    quality?: number;
    showInConsole?: boolean;
}

export interface ScreenCaptureAsBlobOptions extends Html2CanvasOptions {
    format?: string;
    quality?: number;
}

export interface ScreenCaptureDownloadOptions extends Html2CanvasOptions {
    filename?: string;
    format?: string;
    quality?: number;
}

export interface ScreenCaptureRegion {
    x?: number;
    y?: number;
    width: number;
    height: number;
}

export interface ScreenCaptureAPI {
    isScreenCaptureAvailable(): boolean;
    ensureHTML2Canvas(): Promise<boolean>;
    capturePage(options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;
    captureElement(element: HTMLElement, options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;
    captureBySelector(selector: string, options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;
    canvasToDataURL(canvas: HTMLCanvasElement, format?: string, quality?: number): string;
    canvasToBlob(canvas: HTMLCanvasElement, format?: string, quality?: number): Promise<Blob>;
    captureAsDataURL(target?: HTMLElement | string, options?: ScreenCaptureAsDataURLOptions): Promise<string>;
    captureAsBlob(target?: HTMLElement | string, options?: ScreenCaptureAsBlobOptions): Promise<Blob>;
    downloadCapture(target?: HTMLElement | string, options?: ScreenCaptureDownloadOptions): Promise<void>;
    copyToClipboard(target?: HTMLElement | string, options?: ScreenCaptureAsBlobOptions): Promise<void>;
    /** Lets the user click-select an element to capture (uses ElementSelector + MessageBubble). */
    interactiveCapture(options?: Html2CanvasOptions): Promise<string>;
    captureViewport(options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;
    captureRegion(region: ScreenCaptureRegion, options?: Html2CanvasOptions): Promise<HTMLCanvasElement>;
    isCapturingInProgress(): boolean;
    getImageDimensions(dataURL: string): Promise<{ width: number; height: number }>;
    displayImageInConsole(dataURL: string, captureType?: string): void;
    createPreview(
        dataURL: string,
        options?: { maxWidth?: number; maxHeight?: number; border?: string; borderRadius?: string }
    ): HTMLElement;
}

/* ------------------------------------------------------------------ */
/* PageHighlighter (window.agentlet.utils.PageHighlighter)            */
/* ------------------------------------------------------------------ */

export interface PageHighlighterOverlayOptions {
    message?: string;
    position?: 'top' | 'bottom' | 'center';
    type?: 'info' | 'success' | 'warning' | 'error' | 'progress';
    /** 0-100; only meaningful when `type` is `'progress'`. */
    progress?: number;
    /** Disables auto-hide. */
    persistent?: boolean;
    /** Milliseconds. */
    duration?: number;
    onClick?: ((event: MouseEvent) => void) | null;
    overlay?: boolean;
    closeable?: boolean;
}

export interface PageHighlighterOverlayControl {
    id: string;
    element: HTMLElement;
    backgroundOverlay: HTMLElement | null;
    messageContent: HTMLElement;
    update(updates: Partial<{ message: string; type: string; progress: number }>): void;
    hide(): void;
    destroy(): void;
}

export interface PageHighlighterHighlightOptions {
    type?: 'border' | 'arrow' | 'sticker' | 'pulse';
    style?: 'primary' | 'success' | 'warning' | 'danger';
    /** Accepted and defaulted like every other option, but currently unused by the implementation. */
    overlay?: boolean;
    animation?: 'pulse' | 'glow' | 'bounce' | 'none';
    /** Tooltip text (or the sticker's own label for `type: 'sticker'`). */
    message?: string | null;
    position?: string;
    clickable?: boolean;
    onClick?: ((event: MouseEvent) => void) | null;
    /** Pixels; only used by `type: 'border'`. */
    offset?: number;
}

export interface PageHighlighterHighlightControl {
    id: string;
    element: Element;
    highlightElements: HTMLElement[];
    visible: boolean;
    update(updates: Partial<{ message: string }>): void;
    show(): void;
    hide(): void;
    destroy(): void;
}

export interface PageHighlighterTourStep extends PageHighlighterHighlightOptions {
    element: Element | string;
}

export interface PageHighlighterTourControl {
    steps: PageHighlighterTourStep[];
    /** Live index of the step last navigated to by start()/next()/previous()/goTo(). */
    currentStep: number;
    start(): void;
    next(): boolean;
    previous(): boolean;
    goTo(stepIndex: number): void;
    showStep(): void;
    end(): void;
}

export interface PageHighlighterScrollOptions {
    behavior?: 'smooth' | 'instant' | 'auto';
    block?: 'start' | 'center' | 'end' | 'nearest';
    inline?: 'start' | 'center' | 'end' | 'nearest';
    offset?: { x: number; y: number };
    highlight?: boolean;
    /** Milliseconds. */
    highlightDuration?: number;
    onComplete?: (() => void) | null;
}

export type PageHighlighterScrollResult =
    | { x: number; y: number }
    | { element: Element; highlight: PageHighlighterHighlightControl | null; rect: DOMRect };

export interface PageHighlighterAPI {
    showOverlay(options?: PageHighlighterOverlayOptions): PageHighlighterOverlayControl;
    hideOverlay(id: string): void;
    destroyOverlay(id: string): void;
    /** Returns `null` (with a console warning) if `element` cannot be resolved. */
    highlight(element: Element | string, options?: PageHighlighterHighlightOptions): PageHighlighterHighlightControl | null;
    repositionHighlight(highlightControl: PageHighlighterHighlightControl): void;
    destroyHighlight(id: string): void;
    createTour(steps?: PageHighlighterTourStep[]): PageHighlighterTourControl;
    clearAll(): void;
    scrollTo(
        target: Element | string | { x: number; y: number },
        options?: PageHighlighterScrollOptions
    ): Promise<PageHighlighterScrollResult>;
    scrollToTop(options?: PageHighlighterScrollOptions): Promise<{ x: number; y: number }>;
    scrollToBottom(options?: PageHighlighterScrollOptions): Promise<{ x: number; y: number }>;
    scrollToAndHighlight(target: Element | string, options?: PageHighlighterScrollOptions): Promise<PageHighlighterScrollResult>;
    getStats(): { overlays: number; highlights: number; total: number };
}

/* ------------------------------------------------------------------ */
/* Z-Index utilities (window.agentlet.utils.zIndex)                   */
/* ------------------------------------------------------------------ */

/** Exact literal values from `src/utils/ui/ZIndex.js`. */
export interface ZIndexConstants {
    readonly BASE: number;
    readonly INPUT: number;
    readonly BUTTON: number;
    readonly BACKDROP: number;
    /** Dim page overlay shown while picking an element; below SELECTION_HIGHLIGHT, above page content. */
    readonly SELECTION_BACKDROP: number;
    /** Backdrop behind a highlighted element; below ELEMENT_HIGHLIGHT, above page content. */
    readonly HIGHLIGHT_BACKDROP: number;
    /** Intentionally the same value as DIALOG_OVERLAY. */
    readonly MODAL_BACKDROP: number;
    readonly HOVER_HIGHLIGHT: number;
    readonly ELEMENT_HIGHLIGHT: number;
    readonly SELECTION_HIGHLIGHT: number;
    readonly ACTIVE_SELECTION: number;
    readonly TOOLTIP: number;
    readonly MESSAGE_BUBBLE: number;
    readonly NOTIFICATION: number;
    readonly PANEL: number;
    readonly PANEL_CONTENT: number;
    readonly PANEL_HEADER: number;
    readonly DIALOG: number;
    /** Intentionally the same value as MODAL_BACKDROP. */
    readonly DIALOG_OVERLAY: number;
    readonly INFO_DIALOG: number;
    readonly INPUT_DIALOG: number;
    readonly PROGRESS_DIALOG: number;
    readonly FULLSCREEN_DIALOG: number;
    readonly LOADING_OVERLAY: number;
    readonly ERROR_OVERLAY: number;
    readonly IMAGE_OVERLAY: number;
    /** Always-on-top layer (e.g. the panel toggle button); stays above every other overlay. */
    readonly CRITICAL_OVERLAY: number;
}

export interface ZIndexDetectionResult {
    maxZIndex: number;
    maxElement: Element | null;
    totalElements: number;
    agentletBase: number;
    isSafe: boolean;
}

export interface ZIndexSuggestionResult {
    current: number;
    suggested: number;
    detection: ZIndexDetectionResult;
    recommendation: string;
}

export interface ZIndexAnalysisResult {
    detection: ZIndexDetectionResult;
    agentletBase: number;
    summary: { totalElements: number; maxZIndex: number; agentletRange: string; status: string };
}

export interface ZIndexAPI {
    detect(options?: { excludeAgentlet?: boolean }): ZIndexDetectionResult;
    suggest(): ZIndexSuggestionResult;
    analyze(): ZIndexAnalysisResult;
    constants: ZIndexConstants;
    createConstants(base?: number): Record<string, number>;
}

/* ------------------------------------------------------------------ */
/* ScriptInjector (window.agentlet.utils.ScriptInjector)              */
/* ------------------------------------------------------------------ */

export interface ScriptInjectOptions {
    code?: string;
    file?: string;
    /** Chrome-extension environments only. */
    tabId?: number;
    target?: 'main' | 'isolated';
    allFrames?: boolean;
    func?: (...args: unknown[]) => unknown;
    args?: unknown[];
}

export interface ScriptInjectorAPI {
    /** Requires one of `code`, `file`, or `func`. */
    inject(options: ScriptInjectOptions): Promise<unknown>;
    injectModule(options: { moduleCode?: string; moduleUrl?: string; tabId?: number }): Promise<unknown>;
    /** Rejects any pending injections and clears internal state. */
    cleanup(): void;
}

/** The raw `ScriptInjector` class, exposed as `window.agentlet.ScriptInjectorClass`. */
export interface ScriptInjectorConstructor {
    new (): ScriptInjectorAPI;
    isExtensionEnvironment(): boolean;
    isContentScriptEnvironment(): boolean;
    createFunctionInjection(
        func: (...args: unknown[]) => unknown,
        ...args: unknown[]
    ): { func: (...args: unknown[]) => unknown; args: unknown[] };
}

/* ------------------------------------------------------------------ */
/* PDFProcessor (window.agentlet.utils.PDFProcessor)                  */
/* ------------------------------------------------------------------ */

export interface PDFConversionOptions {
    /** Render scale; higher is sharper but slower. Default `1.5`. */
    scale?: number;
    /** Output image MIME type, e.g. `'image/png'`. */
    format?: string;
    /** 0-1, only meaningful for lossy formats. */
    quality?: number;
    maxPages?: number;
    /** Accepted but currently unused by the conversion routine. */
    canvasFactory?: unknown;
}

export interface PDFCapabilities {
    pdfJSAvailable: boolean;
    supportedFormats: string[];
    outputFormats: string[];
    maxRecommendedFileSize: string;
    maxRecommendedPages: number;
    features: string[];
}

export interface PDFProcessorAPI {
    isPDFJSAvailable(): boolean;
    ensurePDFJS(): Promise<boolean>;
    loadPDFJS(): Promise<void>;
    /** Returns an array of base64 data-URL image strings, one per rendered page. */
    convertPDFToImages(pdfData: File | ArrayBuffer | Uint8Array, options?: PDFConversionOptions): Promise<string[]>;
    fileToArrayBuffer(file: File): Promise<ArrayBuffer>;
    convertFileInputToImages(fileInput: HTMLInputElement, options?: PDFConversionOptions): Promise<string[]>;
    convertPDFFromURL(pdfUrl: string, options?: PDFConversionOptions): Promise<string[]>;
    displayPDFImagesInConsole(images: string[], pdfName?: string): void;
    createPDFPreviews(
        images: string[],
        options?: { maxWidth?: number; maxHeight?: number; border?: string; borderRadius?: string; showPageNumbers?: boolean }
    ): HTMLElement[];
    getCapabilities(): PDFCapabilities;
}

/* ------------------------------------------------------------------ */
/* Shortcuts (window.agentlet.utils.shortcuts / core.shortcutManager) */
/* ------------------------------------------------------------------ */

export interface ShortcutRegisterOptions {
    description?: string;
    preventDefault?: boolean;
    stopPropagation?: boolean;
    scope?: string;
    /** Allow the shortcut to fire while an input/textarea/select is focused. */
    allowInInputs?: boolean;
}

export interface ShortcutInfo {
    keys: string;
    description: string;
    scope: string;
    registered: Date;
    allowInInputs: boolean;
}

/** The fixed-shape object returned by `ShortcutManager.createProxy()`. */
export interface ShortcutsAPI {
    /** Resolves `false` (never throws) if hotkeys-js could not be loaded or `keys`/`callback` are invalid. */
    register(
        keys: string,
        callback: (event: KeyboardEvent, handler: Record<string, unknown>) => void,
        options?: ShortcutRegisterOptions
    ): Promise<boolean>;
    unregister(keys: string, scope?: string): boolean;
    setEnabled(enabled: boolean): void;
    getShortcuts(): ShortcutInfo[];
    isRegistered(keys: string): boolean;
    clear(): void;
    showHelp(): void;
    /** Snapshot of the enabled flag taken when this proxy object was created; it does not update reactively. */
    enabled: boolean;
}

/** The full `ShortcutManager` class surface, exposed as `window.agentlet.shortcutManager`. */
export interface ShortcutManagerAPI {
    isHotkeysAvailable(): boolean;
    ensureHotkeys(): Promise<boolean>;
    register(
        keys: string,
        callback: (event: KeyboardEvent, handler: Record<string, unknown>) => void,
        options?: ShortcutRegisterOptions
    ): Promise<boolean>;
    unregister(keys: string, scope?: string): boolean;
    setEnabled(enabled: boolean): void;
    getShortcuts(): ShortcutInfo[];
    isRegistered(keys: string): boolean;
    clear(): void;
    registerDefaultShortcuts(config?: {
        quickCommandDialogShortcut?: boolean;
        quickCommandCallback?: (result: unknown) => void;
    }): Promise<void>;
    showHelp(): void;
    enabled: boolean;
    /** Builds the fixed-shape {@link ShortcutsAPI} object exposed as `window.agentlet.utils.shortcuts`. */
    createProxy(): ShortcutsAPI;
}

/* ------------------------------------------------------------------ */
/* utils namespace (window.agentlet.utils)                            */
/* ------------------------------------------------------------------ */

export interface AgentletUtils {
    ElementSelector: ElementSelectorAPI;
    Dialog: DialogAPI;
    MessageBubble: MessageBubbleAPI;
    ScreenCapture: ScreenCaptureAPI;
    ScriptInjector: ScriptInjectorAPI;
    PDFProcessor: PDFProcessorAPI;
    /** `null` when no `ShortcutManager` was configured on the core instance. */
    shortcuts: ShortcutsAPI | null;
    zIndex: ZIndexAPI;
    /** `null` if `PageHighlighter` failed to instantiate (construction is wrapped in try/catch). */
    PageHighlighter: PageHighlighterAPI | null;
}

/* ------------------------------------------------------------------ */
/* Environment variables (window.agentlet.env)                        */
/* ------------------------------------------------------------------ */

/**
 * At runtime, `window.agentlet.env` is a JS `Proxy` that also allows
 * arbitrary property access/assignment for variable names, e.g.
 * `agentlet.env.MY_VAR = 'x'`. Any variable name that collides with one
 * of the method names below (`get`, `set`, `has`, ...) is shadowed by the
 * real method instead of being treated as a variable, and TypeScript has
 * no sound way to express "index signature except for these literal
 * keys" — so this type only models the method API. Use `get`/`set`
 * rather than bracket/dot access on arbitrary keys from TypeScript code.
 */
export interface EnvAPI {
    /** Human-readable description of the backing storage, e.g. `"Browser Local Storage (example.com)"`. */
    name(): string;
    get(key: string, defaultValue?: string): string | undefined;
    set(key: string, value: string): void;
    has(key: string): boolean;
    remove(key: string): boolean;
    clear(): void;
    /** Values are masked unless `includeSensitive` is true. */
    getAll(includeSensitive?: boolean): Record<string, string>;
    setMultiple(variables: Record<string, string>): void;
    loadFromObject(envObject: Record<string, string>, merge?: boolean): void;
    addChangeListener(callback: (key: string, newValue: string | undefined, oldValue: string | undefined) => void): void;
    removeChangeListener(callback: (key: string, newValue: string | undefined, oldValue: string | undefined) => void): void;
    /** Wraps the manager in a passthrough `Proxy` that also allows arbitrary variable-name access; see the class doc comment above. */
    createProxy(): EnvAPI;
}

/* ------------------------------------------------------------------ */
/* Cookies (window.agentlet.cookies)                                   */
/* ------------------------------------------------------------------ */

export interface CookieSetOptions {
    maxAge?: number;
    expires?: Date;
    path?: string;
    domain?: string;
    secure?: boolean;
    sameSite?: string;
    /** Documented as not effective from client-side JS. */
    httpOnly?: boolean;
}

export interface CookieDeleteOptions {
    path?: string;
    domain?: string;
}

export interface CookieStatistics {
    total: number;
    totalSize: number;
    averageSize: number;
    names: string[];
    listeners: number;
    monitoring: boolean;
    pollFrequency: number;
}

/**
 * Same dynamic-key caveat as {@link EnvAPI}: the runtime object is a
 * `Proxy` that also allows arbitrary `agentlet.cookies.myCookie` access,
 * shadowed by the method names below.
 */
export interface CookiesAPI {
    get(name: string, defaultValue?: string): string | undefined;
    set(name: string, value: string, options?: CookieSetOptions): void;
    /** Returns whether the cookie existed before deletion. */
    delete(name: string, options?: CookieDeleteOptions): boolean;
    has(name: string): boolean;
    getAllCookies(): Record<string, string>;
    /** Returns the number of cookies it attempted to delete. */
    clearAll(options?: CookieDeleteOptions): number;
    getMatching(pattern: string | RegExp): Record<string, string>;
    addChangeListener(
        callback: (name: string, newValue: string | undefined, oldValue: string | undefined) => void
    ): void;
    removeChangeListener(
        callback: (name: string, newValue: string | undefined, oldValue: string | undefined) => void
    ): boolean;
    startMonitoring(): void;
    stopMonitoring(): void;
    setPollFrequency(frequency: number): void;
    getStatistics(): CookieStatistics;
    export(format?: 'json' | 'netscape' | 'curl', includeSensitive?: boolean): string;
    /** Wraps the manager in a passthrough `Proxy` that also allows arbitrary cookie-name access; see the class doc comment above. */
    createProxy(): CookiesAPI;
    cleanup(): void;
    cleanup(): void;
}

/* ------------------------------------------------------------------ */
/* Storage (window.agentlet.storage)                                   */
/* ------------------------------------------------------------------ */

export type StorageType = 'localStorage' | 'sessionStorage';

export interface StorageStatistics {
    type: StorageType;
    total: number;
    totalSize: number;
    averageSize: number;
    keys: string[];
    listeners: number;
    available: boolean;
    error?: string;
}

/**
 * `window.agentlet.storage.local` / `.session`, each bound to one storage
 * type. Same dynamic-key caveat as {@link EnvAPI}: the runtime object is
 * a `Proxy` that also allows arbitrary `agentlet.storage.local.myKey`
 * access, shadowed by the method names below.
 */
export interface BoundStorageAPI {
    get(key: string, defaultValue?: string): string | undefined;
    set(key: string, value: string): void;
    remove(key: string): boolean;
    has(key: string): boolean;
    /** Returns the number of keys cleared. */
    clear(): number;
    getAll(includeSensitive?: boolean): Record<string, string>;
    getMatching(pattern: string | RegExp): Record<string, string>;
    /** Returns `defaultValue` if the key is missing or the stored value fails to parse as JSON. */
    getJSON<T = unknown>(key: string, defaultValue?: T): T;
    setJSON(key: string, value: unknown): void;
    setMultiple(items: Record<string, string>): void;
    addChangeListener(
        callback: (storageType: StorageType, key: string, newValue: string | null, oldValue: string | null) => void
    ): void;
    removeChangeListener(
        callback: (storageType: StorageType, key: string, newValue: string | null, oldValue: string | null) => void
    ): boolean;
    getStatistics(): StorageStatistics;
    export(format?: 'json' | 'csv' | 'tsv', includeSensitive?: boolean): string;
}

/**
 * The raw `StorageManager` class surface, exposed as
 * `window.agentlet.storage.manager` and `window.agentlet.storageManager`.
 * Unlike {@link BoundStorageAPI}, every method takes an explicit
 * `storageType` (defaulting to `'localStorage'`) since one instance
 * manages both storages.
 */
export interface StorageManagerAPI {
    get(key: string, defaultValue?: string, storageType?: StorageType): string | undefined;
    set(key: string, value: string, storageType?: StorageType): void;
    remove(key: string, storageType?: StorageType): boolean;
    has(key: string, storageType?: StorageType): boolean;
    clear(storageType?: StorageType): number;
    getAll(storageType?: StorageType, includeSensitive?: boolean): Record<string, string>;
    getMatching(pattern: string | RegExp, storageType?: StorageType): Record<string, string>;
    getJSON<T = unknown>(key: string, defaultValue?: T, storageType?: StorageType): T;
    setJSON(key: string, value: unknown, storageType?: StorageType): void;
    setMultiple(items: Record<string, string>, storageType?: StorageType): void;
    addChangeListener(
        callback: (storageType: StorageType, key: string, newValue: string | null, oldValue: string | null) => void,
        storageType?: StorageType | 'both'
    ): void;
    removeChangeListener(
        callback: (storageType: StorageType, key: string, newValue: string | null, oldValue: string | null) => void,
        storageType?: StorageType | 'both'
    ): boolean;
    getStatistics(storageType?: StorageType): StorageStatistics;
    export(format?: 'json' | 'csv' | 'tsv', storageType?: StorageType, includeSensitive?: boolean): string;
    createProxy(storageType?: StorageType): BoundStorageAPI;
    cleanup(): void;
}

export interface StorageAPI {
    local: BoundStorageAPI;
    session: BoundStorageAPI;
    manager: StorageManagerAPI;
}

/* ------------------------------------------------------------------ */
/* Authentication (window.agentlet.auth / core config `auth`)          */
/* ------------------------------------------------------------------ */

export interface AuthManagerConfig {
    enabled?: boolean;
    buttonText?: string;
    buttonIcon?: string;
    loginUrl?: string;
    popupWidth?: number;
    popupHeight?: number;
    popupFeatures?: string;
    tokenExtractor?: ((raw: string) => string | null) | null;
    messageHandler?:
        | ((
              data: unknown,
              manager: AuthManagerAPI
          ) => { success?: boolean; cancelled?: boolean; error?: string; accessToken?: string; token?: string } | null | undefined)
        | null;
    onSuccess?: ((result: AuthResult) => void) | null;
    onError?: ((result: { success: false; error: string; timestamp: string }) => void) | null;
    onCancel?: ((result: { success: false; cancelled: true; timestamp: string }) => void) | null;
    allowedOrigins?: string[];
}

export interface AuthResult {
    success: true;
    token: string;
    timestamp: string;
    userInfo: Record<string, unknown> | null;
    [key: string]: unknown;
}

export interface AuthState {
    enabled: boolean;
    authenticating: boolean;
    /** `null` (not strictly `false`) when there is no popup at all. */
    popupOpen: boolean | null;
}

/** The fixed-shape object returned by `AuthManager.createProxy()`. */
export interface AuthAPI {
    isEnabled(): boolean;
    startAuthentication(): Promise<void>;
    logout(): Promise<void>;
    getState(): AuthState;
    getAuthenticatedUser(): Record<string, unknown> | null;
    updateConfig(config: Partial<AuthManagerConfig>): void;
}

/** The full `AuthManager` class surface, exposed as `window.agentlet.authManager`. */
export interface AuthManagerAPI {
    isEnabled(): boolean;
    createLoginButton(onClick?: () => void): HTMLButtonElement | null;
    startAuthentication(): Promise<void>;
    logout(): Promise<void>;
    getState(): AuthState;
    updateConfig(config: Partial<AuthManagerConfig>): void;
    cleanup(): void;
    /** Builds the fixed-shape {@link AuthAPI} object exposed as `window.agentlet.auth`. */
    createProxy(): AuthAPI;
}

/* ------------------------------------------------------------------ */
/* Forms (window.agentlet.forms)                                      */
/* ------------------------------------------------------------------ */

export type FormElementValue =
    | { checked: boolean; value: string }
    | { selectedValue: string; selectedOptions: Array<{ value: string; text: string }> }
    | { files: string[]; accept: string }
    | string
    | null;

export type FormElementOptionsInfo =
    | { multiple: boolean; options: Array<{ index: number; value: string; text: string; selected: boolean; disabled: boolean }> }
    | { group: Array<{ index: number; value: string; checked: boolean; label: string | null }>; groupSize: number }
    | null;

export interface FormElementInfo {
    tagName: string;
    type: string;
    id: string | null;
    name: string | null;
    className: string | null;
    selector: string;
    attributes: Record<string, string>;
    value: FormElementValue;
    placeholder: string | null;
    required: boolean;
    disabled: boolean;
    readonly: boolean;
    visible: boolean;
    interactable: boolean;
    label: string | null;
    options: FormElementOptionsInfo;
    /** Only present when `includeBoundingBoxes` was passed. */
    boundingBox?: { x: number; y: number; width: number; height: number; visible: boolean };
}

export interface FormGroup {
    type: 'form';
    element: FormElementInfo;
    elements: FormElementInfo[];
}

export interface FormExtractionOptions {
    includeHidden?: boolean;
    includeDisabled?: boolean;
    /** Default `true`. */
    includeReadOnly?: boolean;
    includeBoundingBoxes?: boolean;
    /** Additional keys are forwarded as-is to the internal element-info extraction. */
    [key: string]: unknown;
}

export interface FormExtractionResult {
    metadata: { tagName: string; id: string | null; className: string | null; url: string; title: string };
    forms: FormGroup[];
    /** Only elements with no enclosing `<form>` ancestor. */
    elements: FormElementInfo[];
    extractedAt: string;
}

export interface CleanFormElement {
    type: string;
    id: string | null;
    name: string | null;
    selector: string;
    label: string | null;
    placeholder: string | null;
    value: FormElementValue;
    required: boolean;
    disabled: boolean;
    visible: boolean;
    interactable: boolean;
    options?:
        | Array<{ value: string; text: string; selected: boolean; disabled: boolean }>
        | Array<{ value: string; checked: boolean; label: string | null }>;
}

export interface AIFormExport {
    metadata: { url: string; title: string; extractedAt: string; totalForms: number; totalElements: number };
    forms: Array<{
        id: string | null;
        name: string | null;
        action: string | undefined;
        method: string | undefined;
        selector: string;
        /** Only elements where `interactable === true`. */
        elements: CleanFormElement[];
    }>;
    standaloneElements: CleanFormElement[];
}

export interface QuickExportField {
    selector: string;
    type: string;
    name: string | null;
    label: string | null;
    value: FormElementValue;
    required: boolean;
    options: FormElementOptionsInfo;
}

/** Value type accepted when filling a single form field. */
export type FormFillValue = string | boolean;

export type FormFillSelectorValues =
    | Record<string, FormFillValue>
    | Array<{ selector: string; value: FormFillValue; type?: string }>;

export interface FormFillOptions {
    /** Dispatch `input`/`change` events after setting a value. Default `true`. */
    triggerEvents?: boolean;
    skipDisabled?: boolean;
    skipReadonly?: boolean;
    skipHidden?: boolean;
    validateFields?: boolean;
    debugMode?: boolean;
    [key: string]: unknown;
}

export interface FormFillElementInfo {
    tagName: string;
    type: string;
    id: string | null;
    name: string | null;
    visible: boolean;
    enabled: boolean;
}

export type FormFillDetail =
    | { selector: string; status: 'success'; value: unknown; element: FormFillElementInfo }
    | { selector: string; status: 'skipped'; reason: string; element: FormFillElementInfo }
    | { selector: string; status: 'error'; error: string; element: null };

export interface FormFillResult {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    details: FormFillDetail[];
    /** Only the messages of caught exceptions, not skip/fail reasons. */
    errors: string[];
}

export interface FormFillMultipleEntry {
    selectors: FormFillSelectorValues;
    /** Default `1`; retried with a fixed 500ms delay until `failed === 0`. */
    retryAttempts?: number;
}

export interface FormExtractorAPI {
    extractFormStructure(element: Element, options?: FormExtractionOptions): FormExtractionResult;
    exportForAI(element: Element, options?: FormExtractionOptions): AIFormExport;
    /** `exportForAI` with hidden/disabled/bounding-box options fixed to `false`. */
    quickExport(element: Element): QuickExportField[];
}

export interface FormFillerAPI {
    fillForm(parentElement: Element, selectorValues: FormFillSelectorValues, options?: FormFillOptions): FormFillResult;
    /** `aiFormData` must match the shape produced by `FormExtractorAPI.exportForAI`. */
    fillFromAIData(
        parentElement: Element,
        aiFormData: AIFormExport,
        userValues: Record<string, FormFillValue>,
        options?: FormFillOptions
    ): FormFillResult;
    fillMultipleForms(
        parentElement: Element,
        formDataArray: FormFillMultipleEntry[],
        options?: FormFillOptions
    ): Promise<FormFillResult[]>;
}

export interface FormsAPI {
    extract(element: Element, options?: FormExtractionOptions): FormExtractionResult;
    exportForAI(element: Element, options?: FormExtractionOptions): AIFormExport;
    quickExport(element: Element): QuickExportField[];
    fill(parentElement: Element, selectorValues: FormFillSelectorValues, options?: FormFillOptions): FormFillResult;
    fillFromAI(
        parentElement: Element,
        aiFormData: AIFormExport,
        userValues: Record<string, FormFillValue>,
        options?: FormFillOptions
    ): FormFillResult;
    fillMultiple(parentElement: Element, formDataArray: FormFillMultipleEntry[], options?: FormFillOptions): Promise<FormFillResult[]>;
    extractor: FormExtractorAPI;
    filler: FormFillerAPI;
}

/* ------------------------------------------------------------------ */
/* Tables (window.agentlet.tables)                                    */
/* ------------------------------------------------------------------ */

export interface TableData {
    headers: string[];
    rows: string[][];
    metadata: { totalRows: number; totalColumns: number; extractedAt: string; tableId: string | null };
}

export interface TableAllPagesData {
    headers: string[];
    rows: string[][];
    metadata: {
        /** Stays `1` unless `nextButtonSelector` was provided. */
        totalPages: number;
        totalRows: number;
        totalColumns: number;
        extractedAt: string;
        paginationMethod: 'basic';
    };
}

export interface TableExtractionOptions {
    includeHeaderRow?: boolean;
    trimWhitespace?: boolean;
    [key: string]: unknown;
}

export interface TableExtractAllOptions extends TableExtractionOptions {
    maxPages?: number;
    /** Milliseconds to wait after clicking the "next" button. */
    delay?: number;
    /** Pagination only runs when this is provided; the same table element is re-read after each click. */
    nextButtonSelector?: string | null;
}

export interface TableDownloadOptions {
    filename?: string;
    sheetName?: string;
    includeMetadata?: boolean;
}

export type TableDownloadResult =
    | { success: true; filename: string; rowCount: number; columnCount: number }
    | { success: false; error: string };

export interface TableExtractAndDownloadOptions extends TableExtractAllOptions, TableDownloadOptions {
    includePagination?: boolean;
}

export interface TableExtractorAPI {
    isExcelExportAvailable(): boolean;
    extractTableData(tableElement: HTMLTableElement, options?: TableExtractionOptions): TableData;
    extractAllPages(tableElement: HTMLTableElement, options?: TableExtractAllOptions): Promise<TableAllPagesData>;
    downloadAsExcel(tableData: TableData | TableAllPagesData, options?: TableDownloadOptions): Promise<TableDownloadResult>;
    extractAndDownload(tableElement: HTMLTableElement, options?: TableExtractAndDownloadOptions): Promise<TableDownloadResult>;
    /** Builds the fixed-shape {@link TablesAPI} object exposed as `window.agentlet.tables`. */
    createProxy(): TablesAPI;
}

export interface TablesAPI {
    extract(tableElement: HTMLTableElement, options?: TableExtractionOptions): TableData;
    extractAll(tableElement: HTMLTableElement, options?: TableExtractAllOptions): Promise<TableAllPagesData>;
    download(tableData: TableData | TableAllPagesData, options?: TableDownloadOptions): Promise<TableDownloadResult>;
    extractAndDownload(tableElement: HTMLTableElement, options?: TableExtractAndDownloadOptions): Promise<TableDownloadResult>;
    /** Direct reference to the underlying `TableExtractor` instance. */
    extractor: TableExtractorAPI;
}

/* ------------------------------------------------------------------ */
/* AI (window.agentlet.ai)                                            */
/* ------------------------------------------------------------------ */

/** A data URL, an http(s) URL, or a bare base64 string (no object shapes). */
export type AIImageInput = string;

/** A File/ArrayBuffer/Uint8Array, or an http(s) URL string pointing at a PDF. */
export type PDFInputData = File | ArrayBuffer | Uint8Array | string;

export interface AIPromptOptions {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    [key: string]: unknown;
}

export interface AISendPromptWithPDFOptions extends AIPromptOptions {
    pdfOptions?: PDFConversionOptions;
    /** Default `true`: logs converted page images to the console. */
    showInConsole?: boolean;
    pdfName?: string;
}

export interface AIProviderStatusEntry {
    ready: boolean;
    name: string;
}

export interface AIStatus {
    available: boolean;
    currentProvider: string | null;
    availableProviders: string[];
    pdfSupport: { available: boolean; capabilities: PDFCapabilities };
    providerStatus: Record<string, AIProviderStatusEntry>;
}

export type AIValidateAPIResult =
    | {
          success: true;
          message: string;
          details: { provider: string; model: string; responseTime: number; usage: Record<string, unknown>; testResponse: string };
      }
    | { success: false; error: string; details: Record<string, unknown> };

export interface AIProviderHandle {
    isReady(): boolean;
    getProviderName(): string;
}

export interface AIAPI {
    /** Resolves to the assistant's raw text reply (not an object). Throws if no provider is configured. */
    sendPrompt(prompt: string, images?: AIImageInput[], options?: AIPromptOptions): Promise<string>;
    /** Converts `pdfData` to images internally, then behaves like `sendPrompt`. */
    sendPromptWithPDF(prompt: string, pdfData: PDFInputData, options?: AISendPromptWithPDFOptions): Promise<string>;
    /** Resolves to an array of base64 data-URL image strings, one per page. */
    convertPDFToImages(pdfData: PDFInputData, options?: PDFConversionOptions): Promise<string[]>;
    isAvailable(): boolean;
    getStatus(): AIStatus;
    validateAPI(): Promise<AIValidateAPIResult>;
    setProvider(providerName: string): void;
    getAvailableProviders(): string[];
    refresh(): void;
    /** Direct reference to the underlying `AIManager` instance. */
    manager: AIManagerAPI;
}

/** The full `AIManager` class surface, exposed as `window.agentlet.aiManager` and `ai.manager`. */
export interface AIManagerAPI {
    sendPrompt(prompt: string, images?: AIImageInput[], options?: AIPromptOptions): Promise<string>;
    sendPromptWithPDF(prompt: string, pdfData: PDFInputData, options?: AISendPromptWithPDFOptions): Promise<string>;
    convertPDFToImages(pdfData: PDFInputData, options?: PDFConversionOptions): Promise<string[]>;
    isAvailable(): boolean;
    getStatus(): AIStatus;
    validateAPI(): Promise<AIValidateAPIResult>;
    setCurrentProvider(providerName: string): void;
    getAvailableProviders(): string[];
    refresh(): void;
    getCurrentProvider(): AIProviderHandle | null;
}

/* ------------------------------------------------------------------ */
/* Modules (window.agentlet.modules / moduleManager / moduleRegistry) */
/* ------------------------------------------------------------------ */

/** The friendly proxy object built directly in GlobalAPI.js. */
export interface ModulesAPI {
    get(name: string): AgentletModule | null | undefined;
    getAll(): string[];
    register(module: AgentletModule): void;
    unregister(name: string): Promise<boolean> | undefined;
}

export interface ModuleStatistics {
    totalModules: number;
    activationCount: number;
    failedActivations: number;
    registriesLoaded: number;
    registryLoadFailures: number;
    activeModule: string | null;
    moduleList: string[];
}

export interface ModuleManagerAPI {
    register(module: AgentletModule, source?: string): void;
    unregister(moduleName: string): Promise<boolean>;
    get(moduleName: string): AgentletModule | undefined;
    getAll(): string[];
    activate(module: AgentletModule, context?: ModuleActivationContext): Promise<void>;
    getStatistics(): ModuleStatistics & { registrationSources: Record<string, string> };
    initialize(): void;
}

export interface ModuleRegistryAPI {
    readonly modules: Map<string, AgentletModule>;
    activeModule: AgentletModule | null;
    register(module: AgentletModule): void;
    unregister(moduleName: string): Promise<boolean>;
    findMatchingModule(url?: string): AgentletModule | null;
    activateModule(module: AgentletModule, context?: ModuleActivationContext): Promise<void>;
    deactivateModule(context?: ModuleActivationContext): Promise<void>;
    setModuleChangeCallback(callback: (module: AgentletModule | null, context?: ModuleActivationContext) => void): void;
    initialize(): Promise<void>;
    getAll(): string[];
    get(name: string): AgentletModule | null;
    getStatistics(): ModuleStatistics;
    cleanup(): Promise<void>;
}

/* ------------------------------------------------------------------ */
/* UI (window.agentlet.ui)                                            */
/* ------------------------------------------------------------------ */

export interface UIAPI {
    refreshContent(): Promise<void>;
    show(): void;
    hide(): void;
    minimize(): void;
    maximize(): void;
    regenerateStyles(): void;
    resizePanel(size: 'small' | 'medium' | 'large' | number): void;
    getPanelWidth(): number;
    setPanelWidth(width: number): void;
    /** DOM references, merged in once the panel is created; `null` before `init()` completes. */
    container: HTMLElement | null;
    content: HTMLElement | null;
    header: HTMLElement | null;
    actions: HTMLElement | null;
    imageOverlay: HTMLElement | null;
    /**
     * UI mount root: an open `ShadowRoot` when `shadowDom` is enabled
     * (the default), or `document.body` when `shadowDom: false`. `null`
     * before `UIManager.ensureRoot()` runs (i.e. before `init()` completes).
     */
    root: ShadowRoot | HTMLElement | null;
    /** `#agentlet-host` element mounted on `document.body`, or `null` in legacy (`shadowDom: false`) mode. */
    host: HTMLElement | null;
    /** `root.querySelector()`, so callers never need to know whether the UI lives in a shadow root or directly in the page. */
    query(selector: string): Element | null;
    /** `root.querySelectorAll()`, mirroring `query()`. */
    queryAll(selector: string): NodeListOf<Element>;
}

/* ------------------------------------------------------------------ */
/* Theme (window.agentlet.theme / themeManager)                       */
/* ------------------------------------------------------------------ */

export interface AgentletTheme {
    primaryColor: string;
    secondaryColor: string;
    backgroundColor: string;
    contentBackground: string;
    textColor: string;
    borderColor: string;
    headerBackground: string;
    headerTextColor: string;
    actionButtonBackground: string;
    actionButtonBorder: string;
    actionButtonHover: string;
    actionButtonText: string;
    actionsJustifyContent: string;
    panelWidth: string;
    borderRadius: string;
    boxShadow: string;
    fontFamily: string;
    headerPadding: string;
    contentPadding: string;
    actionsPadding: string;
    borderWidth: string;
    transitionDuration: string;
    dialogOverlayBackground: string;
    dialogBackground: string;
    dialogBorderRadius: string;
    dialogBoxShadow: string;
    dialogHeaderBackground: string;
    dialogHeaderTextColor: string;
    dialogHeaderTextMargin: string;
    dialogContentBackground: string;
    dialogContentTextColor: string;
    dialogButtonPrimaryBackground: string;
    dialogButtonPrimaryHover: string;
    dialogButtonSecondaryBackground: string;
    dialogButtonSecondaryHover: string;
    dialogButtonDangerBackground: string;
    dialogButtonDangerHover: string;
    dialogProgressBarBackground: string;
    dialogProgressBarTrackBackground: string;
    spinnerTrackColor: string;
    spinnerColor: string;
    imageOverlayWidth: string;
    imageOverlayHeight: string;
    imageOverlayBottom: string;
    imageOverlayRight: string;
    imageOverlayZIndex: number;
    imageOverlayTransition: string;
    imageOverlayHoverScale: string;
    /**
     * Command-prompt dialog input background. Not one of the keys
     * `ThemeManager.getTheme()` ever populates (there is no default for
     * it), so in practice this is always `undefined` and the dialog falls
     * back to `#ffffff`; documented here because `Dialog` reads it.
     */
    inputBackground?: string;
    /**
     * Fullscreen-dialog footer background. Same situation as
     * {@link AgentletTheme.inputBackground}: `ThemeManager` never sets it,
     * so the dialog always falls back to `rgba(248, 249, 250, 0.8)`.
     */
    footerBackground?: string;
}

export interface ThemeManagerAPI {
    getTheme(): AgentletTheme;
    updateTheme(newThemeConfig: string | Partial<AgentletTheme>): AgentletTheme;
    processThemeConfig(themeConfig: string | Partial<AgentletTheme> | undefined): AgentletTheme;
}

/* ------------------------------------------------------------------ */
/* Event bus (window.agentlet.eventBus)                                */
/* ------------------------------------------------------------------ */

/**
 * Event names are plain strings at runtime (no enum is enforced). Common
 * names emitted by the framework include `module:registered`,
 * `module:activated`, `module:deactivated`, `module:initialized`,
 * `module:cleaned`, `url:changed`, `core:initialized`, `core:cleanup`,
 * `ui:contentUpdated`, `ui:error`, and `localStorage:changed`.
 */
export interface EventBusAPI {
    emit(event: string, data?: unknown): void;
    on(event: string, callback: (data: unknown) => void): void;
    off(event: string, callback: (data: unknown) => void): void;
    /** Request/response pattern: calls only the first registered listener for `event`. */
    request<T = unknown>(event: string, data?: unknown): Promise<T>;
    getEvents(): string[];
    getListenerCount(event: string): number;
    clear(): void;
    clearEvent(event: string): void;
}

/* ------------------------------------------------------------------ */
/* Library setup (window.agentlet.librarySetup)                        */
/* ------------------------------------------------------------------ */

/** Minimal surface of `LibrarySetup` relevant to agentlet authors. */
export interface LibrarySetupAPI {
    configurePDFWorker(workerUrl: string): void;
    isLibraryAvailable(name: string): boolean;
    ensureLibrary(name: string): Promise<boolean>;
}

/* ------------------------------------------------------------------ */
/* Module base class (window.agentlet.Module)                          */
/* ------------------------------------------------------------------ */

export type ModulePatternMatcher = string | { type: 'includes' | 'exact' | 'regex'; value: string };

export interface ModuleConfig {
    name: string;
    version?: string;
    description?: string;
    patterns: ModulePatternMatcher | ModulePatternMatcher[];
    eventBus?: EventBusAPI;
}

export interface ModuleActivationContext {
    trigger?: 'urlChange' | 'moduleRegistration' | string;
    oldUrl?: string;
    newUrl?: string;
    [key: string]: unknown;
}

/**
 * Why `Module.mount()`/`unmount()` is being invoked for the active module:
 * `'init'` on the core's first `init()`, `'moduleChange'` when a different
 * module becomes active, `'urlChange'` when the URL changed but the same
 * module stays active, `'refresh'` from `window.agentlet.refreshContent()` /
 * `ui.refreshContent()`, or a caller-supplied string.
 */
export type ModuleMountTrigger = 'init' | 'moduleChange' | 'urlChange' | 'refresh' | string;

/**
 * Passed to `Module.mount()`/`unmount()` by the core. Gives module authors
 * everything needed to mount a UI framework root (React, Lit, ...) into
 * `container`: where the panel lives in the DOM, the active theme, the
 * shared event bus, and the full `window.agentlet` surface.
 */
export interface ModuleMountContext {
    /** UI mount root: the shadow root when `shadowDom` is enabled, or `document.body` otherwise (same value as `window.agentlet.ui.root`). */
    root: ShadowRoot | HTMLElement;
    /** The current theme, as returned by `window.agentlet.themeManager.getTheme()`. */
    theme: AgentletTheme;
    /** The shared core event bus, same instance as `window.agentlet.eventBus`. */
    eventBus: EventBusAPI;
    /** The full `window.agentlet` API surface. */
    api: AgentletAPI;
    /** Why this mount/unmount is happening. */
    trigger: ModuleMountTrigger;
}

export interface ModuleMetadata {
    name: string;
    version: string;
    description: string;
    patterns: ModulePatternMatcher[];
    isActive: boolean;
    performanceMetrics: { initTime: number; activateTime: number; cleanupTime: number };
}

/**
 * Base class agentlets extend, exposed as `window.agentlet.Module`.
 * There is no `Submodule` base class in the current codebase.
 */
export declare class AgentletModule {
    constructor(config: ModuleConfig);

    name: string;
    version: string;
    description: string;
    patterns: ModulePatternMatcher[];
    isActive: boolean;
    eventBus?: EventBusAPI;
    injectedStyles: Set<string>;
    styleElement: HTMLStyleElement | null;
    /** `true` between a successful `mount()` call and the matching `unmount()`. */
    mounted: boolean;
    /** The container passed to the most recent `mount()` call, or `null` when not mounted. */
    mountedContainer: HTMLElement | null;
    performanceMetrics: { initTime: number; activateTime: number; cleanupTime: number };
    /** Set by `ModuleRegistry` after the first successful `init()`; not initialized in the constructor. */
    isInitialized?: boolean;

    checkPattern(url: string): boolean;
    /** Outer lifecycle entry point; calls `initModule()`. Called by the framework, not by module authors. */
    init(): Promise<void>;
    /** Outer lifecycle entry point; calls `activateModule()`. Called by the framework, not by module authors. */
    activate(context?: ModuleActivationContext): Promise<void>;
    /** Outer lifecycle entry point; calls `cleanupModule()`. Called by the framework, not by module authors. */
    cleanup(context?: ModuleActivationContext): Promise<void>;

    /** Override to run one-time module setup. Called once by `init()`. */
    initModule(): Promise<void> | void;
    /** Override to run per-activation logic. Called on every activation, including URL changes. */
    activateModule(context?: ModuleActivationContext): Promise<void> | void;
    /** Override to tear down per-activation state. */
    cleanupModule(context?: ModuleActivationContext): Promise<void> | void;

    /** Override to return the HTML shown in the agentlet panel. */
    getContent(): string;
    /**
     * Render this module's content into `container`. Called by the core
     * whenever this module becomes (or stays) the active module - on init,
     * module switch, URL change, or a manual refresh; see `context.trigger`.
     * Override for imperative DOM mounting (e.g. a React or Lit root).
     * Default implementation: `container.innerHTML = this.getContent();`.
     */
    mount(container: HTMLElement, context: ModuleMountContext): Promise<void>;
    /**
     * Tear down what `mount()` set up. Called by the core before a different
     * module mounts, and by `cleanup()` if this module is still mounted. The
     * core clears the container's content itself, so the default
     * implementation is a no-op.
     */
    unmount(container: HTMLElement): Promise<void>;
    getMetadata(): ModuleMetadata;

    on(event: string, callback: (data: unknown) => void): void;
    off(event: string, callback: (data: unknown) => void): void;
    /** Notifies local listeners, then forwards to `this.eventBus` if one is set. */
    emit(event: string, data?: unknown): void;
    removeAllEventListeners(): void;

    /** Appends `css` to a single `<style data-module="...">` element (cumulative across calls). */
    injectStyles(css: string): void;
    removeAllStyles(): void;

    log(message: unknown, ...args: unknown[]): void;
    error(message: unknown, ...args: unknown[]): void;
    warn(message: unknown, ...args: unknown[]): void;

    /** Convention used by the scaffold templates; not invoked automatically by the framework. */
    getStyles?(): string;
    /** Read by the core to label the panel header instead of `name`, if implemented. */
    getPanelTitle?(): string;
    /** Called by the core instead of the default settings dialog, if implemented. */
    showSettings?(): void;
    /** Called by the core instead of the default help dialog, if implemented. */
    showHelp?(): void;
    /** Called by the core with a callback this module should invoke whenever its internal submodule changes. */
    setSubmoduleChangeCallback?(callback: () => void): void;
    /** Set to `true` to receive `onLocalStorageChange` notifications from the core. */
    requiresLocalStorageChangeNotification?: boolean;
    onLocalStorageChange?(key: string | null, newValue: string | null): void;
}

/* ------------------------------------------------------------------ */
/* AgentletCore config (new AgentletCore(config))                      */
/* ------------------------------------------------------------------ */

export interface AgentletCoreConfig {
    enablePlugins?: boolean;
    /** Read into `config.moduleRegistry` but not currently consulted by `ModuleRegistry` itself. */
    moduleRegistry?: unknown[];
    registryUrl?: string;
    debugMode?: boolean;
    /** URL of an image shown when the panel is minimized. */
    minimizeWithImage?: string | null;
    startMinimized?: boolean;
    showEnvVarsButton?: boolean;
    showRefreshButton?: boolean;
    showSettingsButton?: boolean;
    showHelpButton?: boolean;
    /** A custom environment-variable manager instance, or `null` to disable environment variables entirely. */
    envManager?: EnvAPI | null;
    resizablePanel?: boolean;
    minimumPanelWidth?: number;
    /**
     * Mount the panel UI (and dialogs/toasts triggered through
     * `window.agentlet.utils.Dialog`/`MessageBubble`) inside an open shadow
     * root under a `#agentlet-host` element, isolating it from the host
     * page's CSS in both directions. Default `true`; set to `false` to
     * restore the pre-shadow-DOM behavior of mounting directly on
     * `document.body`.
     */
    shadowDom?: boolean;
    /** Enables the Ctrl/Cmd+; quick command dialog shortcut. Default `false`. */
    quickCommandDialogShortcut?: boolean;
    quickCommandCallback?: ((result: unknown) => void) | null;
    auth?: AuthManagerConfig;
    /** Loaded into the environment-variable manager at startup, merged over any existing values. */
    env?: Record<string, string>;
    theme?: string | Partial<AgentletTheme>;
    skipRegistryModuleRegistration?: boolean;
    /** Forwarded to `LibrarySetup`, which reads it while configuring PDF.js. */
    pdfWorkerUrl?: string;
    /** Consumers may pass additional keys; the constructor spreads the raw config object over its defaults. */
    [key: string]: unknown;
}

export interface AgentletPerformanceReport {
    core: { initTime: number; moduleLoadTime: number; uiRenderTime: number };
    moduleRegistry: ModuleStatistics;
    modules: Array<{ name: string; metrics: Record<string, unknown> }>;
}

/** Only present when the core was constructed with `debugMode: true`. */
export interface AgentletDebugAPI {
    getMetrics(): AgentletPerformanceReport;
    getConfig(): AgentletCoreConfig;
    getStatistics(): ModuleStatistics;
    eventBus: EventBusAPI;
    envManager: EnvAPI;
    cookieManager: CookiesAPI;
    storageManager: StorageManagerAPI;
}

/** @internal minimal surface of `StyleInjector`, exposed as `window.agentlet.styleInjector`. */
export interface StyleInjectorAPI {
    injectStyles(): void;
    regenerateStyles(): void;
}

/** @internal minimal surface of `UIManager`, exposed as `window.agentlet.uiManager`. Prefer `agentlet.ui.*`. */
export interface UIManagerInternalAPI {
    show(): void;
    hide(): void;
    minimize(): void;
    maximize(): void;
    setupBaseUI(): void;
    readonly isMinimized: boolean;
}

export interface PanelManagerAPI {
    resizePanel(size: 'small' | 'medium' | 'large' | number): void;
    setPanelWidth(width: number): void;
    getPanelWidth(): number;
    savePanelWidthForModule(width: number): void;
    restorePanelWidthForModule(activeModule: AgentletModule | null): void;
}

/* ------------------------------------------------------------------ */
/* The window.agentlet object itself                                   */
/* ------------------------------------------------------------------ */

/**
 * The shape of `window.agentlet`. Built by assigning the `AgentletCore`
 * instance to `window.agentlet` and then attaching further properties in
 * `GlobalAPI.setupGlobalAccess()`, so this interface combines both: the
 * `AgentletCore` instance's own state/methods, and the friendlier
 * `utils`/`forms`/`tables`/`ai`/`env`/... proxies GlobalAPI adds on top.
 */
export interface AgentletAPI {
    /* ---- AgentletCore instance state ---- */
    initialized: boolean;
    config: AgentletCoreConfig;
    eventBus: EventBusAPI;
    envManager: EnvAPI;
    cookieManager: CookiesAPI;
    storageManager: StorageManagerAPI;
    authManager: AuthManagerAPI;
    formExtractor: FormExtractorAPI;
    formFiller: FormFillerAPI;
    tableExtractor: TableExtractorAPI;
    aiManager: AIManagerAPI;
    /** `null` when no shortcut manager could be created. */
    shortcutManager: ShortcutManagerAPI | null;
    librarySetup: LibrarySetupAPI;
    isMinimized: boolean;
    themeManager: ThemeManagerAPI;
    /** @internal */
    styleInjector: StyleInjectorAPI;
    /** @internal framework wiring; prefer `agentlet.ui.*` and the lifecycle methods below. */
    uiManager: UIManagerInternalAPI;
    panelManager: PanelManagerAPI;
    /** @internal already applied by the time `window.agentlet` exists. */
    globalAPI: { setupGlobalAccess(): void };
    moduleRegistry: ModuleRegistryAPI;
    moduleManager: ModuleManagerAPI;
    performanceMetrics: { initTime: number; moduleLoadTime: number; uiRenderTime: number };
    /** Only set while the environment-variables dialog is open. */
    currentEnvVarsDialog?: { close: () => void } | null;

    /* ---- AgentletCore lifecycle & UI methods ---- */
    init(): Promise<void>;
    cleanup(): Promise<void>;
    show(): void;
    hide(): void;
    minimize(): void;
    maximize(): void;
    refreshContent(): Promise<void>;
    showSettings(): void;
    showHelp(): void;
    showError(message: string): void;
    showModal(title: string, content: string): void;
    showEnvVarsDialog(): void;
    regenerateStyles(): void;
    getPerformanceMetrics(): AgentletPerformanceReport;
    updateApplicationDisplay(): void;
    /** Mounts (or renders) the active module's content into the panel; see `Module.mount()`/`unmount()`. */
    updateModuleContent(trigger?: ModuleMountTrigger): Promise<void>;

    /** @internal called once during `init()` to wire up core event-bus handlers. */
    setupEventListeners(): void;
    /** @internal called by `ModuleRegistry` whenever the active module changes. */
    onModuleChange(activeModule: AgentletModule | null, context?: ModuleActivationContext): void;
    /** @internal builds the discrete close button in the panel header. */
    createDiscreteCloseButton(): HTMLButtonElement;
    /** @internal builds one action button for the panel header. */
    createActionButton(icon: string, title: string, onClick: (event: MouseEvent) => void): HTMLButtonElement;
    /** @internal called once during `init()` to enable same-tab localStorage change detection. */
    setupLocalStorageListener(): void;
    /** @internal invoked whenever a monitored localStorage key changes. */
    handleLocalStorageChange(key: string | null, newValue: string | null): void;
    /** @internal delegates to `UIManager.setupBaseUI()`; called once during `init()`. */
    setupBaseUI(): void;
    /** @internal merges DOM references created by `UIManager` into `agentlet.ui`. */
    finalizeGlobalAccess(): void;
    /** @internal resolves the configured environment-variable manager. */
    initializeEnvManager(): EnvAPI | null;
    /** @internal builds the HTML for the environment-variables dialog list. */
    generateEnvVarsListHTML(): string;
    /** @internal refreshes an open environment-variables dialog in place. */
    refreshEnvVarsDialog(): void;

    /* ---- Global API additions (src/core/GlobalAPI.js) ---- */
    Module: typeof AgentletModule;
    ElementSelectorClass: ElementSelectorConstructor;
    ScriptInjectorClass: ScriptInjectorConstructor;
    utils: AgentletUtils;
    /** `null` when environment variables are disabled via `envManager: null` in the core config. */
    env: EnvAPI | null;
    cookies: CookiesAPI;
    storage: StorageAPI;
    auth: AuthAPI;
    forms: FormsAPI;
    tables: TablesAPI;
    ai: AIAPI;
    configurePDFWorker(workerUrl: string): void;
    modules: ModulesAPI;
    ui: UIAPI;
    theme: AgentletTheme;
    /** Present only when the core was constructed with `debugMode: true`. */
    debug?: AgentletDebugAPI;
}

declare global {
    interface Window {
        agentlet: AgentletAPI;
        /**
         * Conventional global consumers set before constructing
         * `AgentletCore` in bookmarklet-style loading (see examples/), and
         * which `eslint.config.js` whitelists as a known global. Not read
         * automatically by `src/index.js` itself — pass it explicitly to
         * the constructor, e.g. `new AgentletCore(window.agentletConfig)`.
         */
        agentletConfig?: AgentletCoreConfig;
    }
}
