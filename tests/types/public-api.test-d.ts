/**
 * Type-level test for src/types/public-api.d.ts.
 *
 * This file is checked by `npm run typecheck` (tsc --noEmit), NOT run by
 * Jest: jest's testMatch only picks up `*.test.js`/`*.test.ts`, and this
 * file intentionally uses the `.test-d.ts` suffix so it is excluded.
 *
 * It exercises `window.agentlet` the way a plain-JavaScript agentlet
 * author would (via the global augmentation), plus a few explicit
 * `import type` usages, and asserts that obviously wrong usage is
 * rejected with `@ts-expect-error`.
 */

import type {
    AgentletAPI,
    AgentletModule,
    ModuleActivationContext,
    ModuleMountContext,
    ModuleMountTrigger,
    EventBusAPI,
    ThemeManagerAPI,
    ZIndexConstants,
    PanelManagerAPI,
    FormFillResult,
    TableData,
    AIStatus,
    PageHighlighterAPI,
    DialogAPI,
    ScriptInjectorAPI,
    ScriptInjectorConstructor,
    EnvAPI,
    CookiesAPI,
    StorageManagerAPI,
    BoundStorageAPI,
    AuthManagerAPI,
    AuthAPI,
    ElementSelectorAPI,
    ElementSelectorConstructor,
    ScreenCaptureAPI,
    FormExtractorAPI,
    FormFillerAPI,
    TableExtractorAPI,
    TablesAPI,
    PDFProcessorAPI,
    AIManagerAPI,
    MessageBubbleAPI,
    ShortcutManagerAPI,
    ShortcutsAPI,
} from '../../src/types/public-api';

import Module from '../../src/core/Module';
import { EventBus } from '../../src/core/EventBus';
import { ThemeManager } from '../../src/core/ThemeManager';
import ScriptInjector from '../../src/utils/system/ScriptInjector';
import { LocalStorageEnvironmentVariablesManager } from '../../src/utils/config-persistence/EnvManager';
import CookieManager from '../../src/utils/config-persistence/CookieManager';
import StorageManager from '../../src/utils/config-persistence/StorageManager';
import AuthManager from '../../src/utils/system/AuthManager';
import { Z_INDEX } from '../../src/utils/ui/ZIndex';
import PageHighlighter from '../../src/utils/ui/PageHighlighter';
import Dialog from '../../src/utils/ui/Dialog';
import { PanelManager } from '../../src/ui/PanelManager';
import ElementSelector from '../../src/utils/ui/ElementSelector';
import ScreenCapture from '../../src/utils/ui/ScreenCapture';
import FormExtractor from '../../src/utils/data-processing/FormExtractor';
import FormFiller from '../../src/utils/data-processing/FormFiller';
import TableExtractor from '../../src/utils/data-processing/TableExtractor';
import PDFProcessor from '../../src/utils/ai/PDFProcessor';
import { AIManager } from '../../src/utils/ai/AIProvider';
import MessageBubble from '../../src/utils/ui/MessageBubble';
import ShortcutManager from '../../src/utils/ui/ShortcutManager';

/* -------------------------------------------------------------- */
/* window.agentlet matches the exported AgentletAPI shape          */
/* -------------------------------------------------------------- */

const agentletRef: AgentletAPI = window.agentlet;
void agentletRef;

/* -------------------------------------------------------------- */
/* Dialog                                                          */
/* -------------------------------------------------------------- */

window.agentlet.utils.Dialog.info('Hello there', 'Title', (value: unknown) => {
    void value;
});

window.agentlet.utils.Dialog.confirm('Are you sure?', 'Confirm', (value) => {
    const confirmed: 'cancel' | 'confirm' = value;
    void confirmed;
});

window.agentlet.utils.Dialog.showProgress({ title: 'Working', totalSteps: 3 }).updateProgress(50, 'Halfway there');

window.agentlet.utils.Dialog.setRoot(document.body);
window.agentlet.utils.MessageBubble.setRoot(null);

const dialogRoot: ShadowRoot | HTMLElement = window.agentlet.utils.Dialog.getRoot();
void dialogRoot;

/* -------------------------------------------------------------- */
/* Shadow DOM UI root                                               */
/* -------------------------------------------------------------- */

const uiRoot: ShadowRoot | HTMLElement | null = window.agentlet.ui.root;
void uiRoot;
const uiHost: HTMLElement | null = window.agentlet.ui.host;
void uiHost;
const queried: Element | null = window.agentlet.ui.query('#agentlet-toggle');
void queried;
const queriedAll: NodeListOf<Element> = window.agentlet.ui.queryAll('.agentlet-action-btn');
void queriedAll;

const shadowConfig: import('../../src/types/public-api').AgentletCoreConfig = { shadowDom: false };
void shadowConfig;

/* -------------------------------------------------------------- */
/* Forms                                                           */
/* -------------------------------------------------------------- */

declare const formEl: HTMLFormElement;

const quickFields = window.agentlet.forms.quickExport(formEl);
const firstFieldSelector: string | undefined = quickFields[0]?.selector;
void firstFieldSelector;

const fillResult: FormFillResult = window.agentlet.forms.fill(formEl, {
    '#email': 'user@example.com',
    '#subscribe': true,
});
void fillResult.successful;

/* -------------------------------------------------------------- */
/* Tables                                                           */
/* -------------------------------------------------------------- */

declare const tableEl: HTMLTableElement;

const tableData: TableData = window.agentlet.tables.extract(tableEl);
void tableData.headers;

/* -------------------------------------------------------------- */
/* AI                                                               */
/* -------------------------------------------------------------- */

const aiReply: Promise<string> = window.agentlet.ai.sendPrompt('Summarize this page');
void aiReply;

const aiStatus: AIStatus = window.agentlet.ai.getStatus();
void aiStatus.available;

/* -------------------------------------------------------------- */
/* Env / cookies / storage                                          */
/* -------------------------------------------------------------- */

window.agentlet.env?.set('MY_VAR', 'a-value');
const myVar: string | undefined = window.agentlet.env?.get('MY_VAR');
void myVar;

window.agentlet.cookies.set('session', 'abc123', { secure: true, sameSite: 'Strict' });

window.agentlet.storage.local.set('key', 'value');
const storedValue: string | null | undefined = window.agentlet.storage.local.get('key');
void storedValue;

/* -------------------------------------------------------------- */
/* zIndex constants                                                 */
/* -------------------------------------------------------------- */

const baseZIndex: number = window.agentlet.utils.zIndex.constants.BASE;
void baseZIndex;

/* -------------------------------------------------------------- */
/* Module subclassing                                               */
/* -------------------------------------------------------------- */

class MyAgentlet extends window.agentlet.Module {
    async initModule(): Promise<void> {
        this.log('initializing');
    }

    async activateModule(context?: ModuleActivationContext): Promise<void> {
        this.emit('my-agentlet:activated', context);
    }

    async cleanupModule(): Promise<void> {
        this.removeAllStyles();
    }

    getContent(): string {
        return `<div>${this.name}</div>`;
    }
}

const myAgentlet = new MyAgentlet({ name: 'my-agentlet', patterns: ['example.com'] });
myAgentlet.on('my-agentlet:activated', (data: unknown) => {
    void data;
});
window.agentlet.modules.register(myAgentlet);

/* -------------------------------------------------------------- */
/* Module mount / unmount API                                       */
/* -------------------------------------------------------------- */

declare const mountContainer: HTMLElement;

class ImperativeAgentlet extends window.agentlet.Module {
    async mount(container: HTMLElement, context: ModuleMountContext): Promise<void> {
        // `this.mounted`/`this.mountedContainer` are tracked by the core even
        // though this override doesn't render via `getContent()`.
        const root: ShadowRoot | HTMLElement = context.root;
        const trigger: ModuleMountTrigger = context.trigger;
        void container;
        void root;
        void trigger;
    }

    async unmount(container: HTMLElement): Promise<void> {
        void container;
    }
}

const imperativeAgentlet = new ImperativeAgentlet({ name: 'imperative-agentlet', patterns: ['example.com'] });
const mounted: boolean = imperativeAgentlet.mounted;
const mountedContainer: HTMLElement | null = imperativeAgentlet.mountedContainer;
void mounted;
void mountedContainer;

// Every module (whether or not it overrides mount()/unmount()) exposes the
// full mount/unmount API, since the base implementation is not abstract.
const plainAgentletMount: (container: HTMLElement, context: ModuleMountContext) => Promise<void> = myAgentlet.mount.bind(myAgentlet);
void plainAgentletMount;

declare const mountContext: ModuleMountContext;
const mountContextRoot: ShadowRoot | HTMLElement = mountContext.root;
const mountContextTheme: import('../../src/types/public-api').AgentletTheme = mountContext.theme;
const mountContextEventBus: EventBusAPI = mountContext.eventBus;
const mountContextApi: AgentletAPI = mountContext.api;
const mountContextTrigger: ModuleMountTrigger = mountContext.trigger;
void mountContextRoot;
void mountContextTheme;
void mountContextEventBus;
void mountContextApi;
void mountContextTrigger;

void imperativeAgentlet.mount(mountContainer, mountContext);
void imperativeAgentlet.unmount(mountContainer);

// window.agentlet.updateModuleContent() mounts/renders the active module and
// accepts an optional trigger describing why.
const contentUpdated: Promise<void> = window.agentlet.updateModuleContent('refresh');
void contentUpdated;
void window.agentlet.updateModuleContent();

/* -------------------------------------------------------------- */
/* Conformance: real classes <-> hand-written declarations          */
/* -------------------------------------------------------------- */

/**
 * Step 2.3 of the progressive TypeScript migration converted EventBus,
 * ThemeManager, ZIndex and Module to real .ts classes/modules, and step
 * 2.4a converted Dialog, all of which share their option/shape types with
 * this file (see the `import type { ... } from '../../src/types/public-api'`
 * usages in each of them). These checks assert bidirectional assignability
 * between each real class and its hand-written declaration here, so drift
 * in either direction fails `npm run typecheck`.
 */

// real -> declared
const moduleCtorCheck: typeof AgentletModule = Module;
const moduleInstanceCheck: AgentletModule = new Module({ name: 'conformance-check', patterns: ['example.com'] });
const eventBusCheck: EventBusAPI = new EventBus();
const themeCheck: ThemeManagerAPI = new ThemeManager();
const zIndexCheck: ZIndexConstants = Z_INDEX;
const highlighterCheck: PageHighlighterAPI = new PageHighlighter();
const dialogCheck: DialogAPI = new Dialog({ theme: {} });
const scriptInjectorCtorCheck: ScriptInjectorConstructor = ScriptInjector;
const scriptInjectorInstanceCheck: ScriptInjectorAPI = new ScriptInjector();
const envCheck: EnvAPI = new LocalStorageEnvironmentVariablesManager();
const cookiesCheck: CookiesAPI = new CookieManager();
const storageManagerCheck: StorageManagerAPI = new StorageManager();
const boundStorageCheck: BoundStorageAPI = new StorageManager().createProxy('localStorage');
const authManagerCheck: AuthManagerAPI = new AuthManager();
const authApiCheck: AuthAPI = new AuthManager().createProxy();
const elementSelectorCtorCheck: ElementSelectorConstructor = ElementSelector;
const elementSelectorInstanceCheck: ElementSelectorAPI = new ElementSelector();
declare const librarySetupStub: { ensureLibrary(name: string): Promise<boolean> };
const screenCaptureCheck: ScreenCaptureAPI = new ScreenCapture(librarySetupStub);
const formExtractorCheck: FormExtractorAPI = new FormExtractor();
const formFillerCheck: FormFillerAPI = new FormFiller();
const tableExtractorCheck: TableExtractorAPI = new TableExtractor();
const tablesApiCheck: TablesAPI = new TableExtractor().createProxy();
const pdfProcessorCheck: PDFProcessorAPI = new PDFProcessor();
declare const envStub: EnvAPI;
const aiManagerCheck: AIManagerAPI = new AIManager(envStub);
const messageBubbleCheck: MessageBubbleAPI = new MessageBubble();
const shortcutManagerCheck: ShortcutManagerAPI = new ShortcutManager();
const shortcutsApiCheck: ShortcutsAPI = new ShortcutManager().createProxy();
void moduleCtorCheck;
void moduleInstanceCheck;
void eventBusCheck;
void themeCheck;
void zIndexCheck;
void highlighterCheck;
void dialogCheck;
void scriptInjectorCtorCheck;
void scriptInjectorInstanceCheck;
void envCheck;
void cookiesCheck;
void storageManagerCheck;
void boundStorageCheck;
void authManagerCheck;
void authApiCheck;
void elementSelectorCtorCheck;
void elementSelectorInstanceCheck;
void screenCaptureCheck;
void formExtractorCheck;
void formFillerCheck;
void tableExtractorCheck;
void tablesApiCheck;
void pdfProcessorCheck;
void aiManagerCheck;
void messageBubbleCheck;
void shortcutManagerCheck;
void shortcutsApiCheck;

// PanelManager's constructor takes an internal (unexported) core shape, not
// a public config object like Module's, so both directions below use
// `declare const` the same way the "declared -> real" checks do further
// down, rather than constructing a real instance.
declare const realPanelManager: PanelManager;
const panelManagerCheck: PanelManagerAPI = realPanelManager;
void panelManagerCheck;

// declared -> real
//
// The real classes intentionally have a larger public surface than these
// hand-written declarations expose (framework-internal state such as
// Module's `eventListeners`/`_initialized`, EventBus's `listeners`, or
// ThemeManager's `config`, none of which agentlet authors are meant to
// rely on). A literal `AgentletModule -> Module` assignment would fail on
// that extra surface even with zero drift, so each check below is scoped
// with `Pick<Real, keyof Declared>` to the members the declaration
// actually claims to have - still failing if any of *those* members goes
// missing or becomes incompatible on the real class, which is what this
// direction is for.
declare const declaredModuleInstance: AgentletModule;
const moduleBackToReal: Pick<InstanceType<typeof Module>, keyof AgentletModule> = declaredModuleInstance;
void moduleBackToReal;

declare const declaredEventBus: EventBusAPI;
const eventBusBackToReal: Pick<EventBus, keyof EventBusAPI> = declaredEventBus;
void eventBusBackToReal;

declare const declaredTheme: ThemeManagerAPI;
const themeBackToReal: Pick<ThemeManager, keyof ThemeManagerAPI> = declaredTheme;
void themeBackToReal;

declare const declaredZIndex: ZIndexConstants;
const zIndexBackToReal: Pick<typeof Z_INDEX, keyof ZIndexConstants> = declaredZIndex;
void zIndexBackToReal;

declare const declaredHighlighter: PageHighlighterAPI;
const highlighterBackToReal: Pick<InstanceType<typeof PageHighlighter>, keyof PageHighlighterAPI> = declaredHighlighter;
void highlighterBackToReal;
declare const declaredDialog: DialogAPI;
const dialogBackToReal: Pick<InstanceType<typeof Dialog>, keyof DialogAPI> = declaredDialog;
void dialogBackToReal;

declare const declaredScriptInjector: ScriptInjectorAPI;
const scriptInjectorBackToReal: Pick<InstanceType<typeof ScriptInjector>, keyof ScriptInjectorAPI> = declaredScriptInjector;
void scriptInjectorBackToReal;

declare const declaredEnv: EnvAPI;
const envBackToReal: Pick<InstanceType<typeof LocalStorageEnvironmentVariablesManager>, keyof EnvAPI> = declaredEnv;
void envBackToReal;

declare const declaredCookies: CookiesAPI;
const cookiesBackToReal: Pick<InstanceType<typeof CookieManager>, keyof CookiesAPI> = declaredCookies;
void cookiesBackToReal;

declare const declaredPanelManager: PanelManagerAPI;
const panelManagerBackToReal: Pick<PanelManager, keyof PanelManagerAPI> = declaredPanelManager;
void panelManagerBackToReal;
declare const declaredStorageManager: StorageManagerAPI;
const storageManagerBackToReal: Pick<InstanceType<typeof StorageManager>, keyof StorageManagerAPI> = declaredStorageManager;
void storageManagerBackToReal;

declare const declaredBoundStorage: BoundStorageAPI;
const boundStorageBackToReal: Pick<ReturnType<InstanceType<typeof StorageManager>['createProxy']>, keyof BoundStorageAPI> = declaredBoundStorage;
void boundStorageBackToReal;

declare const declaredAuthManager: AuthManagerAPI;
const authManagerBackToReal: Pick<InstanceType<typeof AuthManager>, keyof AuthManagerAPI> = declaredAuthManager;
void authManagerBackToReal;

declare const declaredAuthApi: AuthAPI;
const authApiBackToReal: Pick<ReturnType<InstanceType<typeof AuthManager>['createProxy']>, keyof AuthAPI> = declaredAuthApi;
void authApiBackToReal;

declare const declaredElementSelector: ElementSelectorAPI;
const elementSelectorBackToReal: Pick<InstanceType<typeof ElementSelector>, keyof ElementSelectorAPI> = declaredElementSelector;
void elementSelectorBackToReal;

declare const declaredScreenCapture: ScreenCaptureAPI;
const screenCaptureBackToReal: Pick<InstanceType<typeof ScreenCapture>, keyof ScreenCaptureAPI> = declaredScreenCapture;
void screenCaptureBackToReal;
declare const declaredFormExtractor: FormExtractorAPI;
const formExtractorBackToReal: Pick<InstanceType<typeof FormExtractor>, keyof FormExtractorAPI> = declaredFormExtractor;
void formExtractorBackToReal;

declare const declaredFormFiller: FormFillerAPI;
const formFillerBackToReal: Pick<InstanceType<typeof FormFiller>, keyof FormFillerAPI> = declaredFormFiller;
void formFillerBackToReal;

declare const declaredTableExtractor: TableExtractorAPI;
const tableExtractorBackToReal: Pick<InstanceType<typeof TableExtractor>, keyof TableExtractorAPI> = declaredTableExtractor;
void tableExtractorBackToReal;

declare const declaredTablesApi: TablesAPI;
const tablesApiBackToReal: Pick<ReturnType<InstanceType<typeof TableExtractor>['createProxy']>, keyof TablesAPI> = declaredTablesApi;
void tablesApiBackToReal;

declare const declaredPdfProcessor: PDFProcessorAPI;
const pdfProcessorBackToReal: Pick<InstanceType<typeof PDFProcessor>, keyof PDFProcessorAPI> = declaredPdfProcessor;
void pdfProcessorBackToReal;

declare const declaredAiManager: AIManagerAPI;
const aiManagerBackToReal: Pick<InstanceType<typeof AIManager>, keyof AIManagerAPI> = declaredAiManager;
void aiManagerBackToReal;

declare const declaredMessageBubble: MessageBubbleAPI;
const messageBubbleBackToReal: Pick<InstanceType<typeof MessageBubble>, keyof MessageBubbleAPI> = declaredMessageBubble;
void messageBubbleBackToReal;

declare const declaredShortcutManager: ShortcutManagerAPI;
const shortcutManagerBackToReal: Pick<InstanceType<typeof ShortcutManager>, keyof ShortcutManagerAPI> = declaredShortcutManager;
void shortcutManagerBackToReal;

declare const declaredShortcutsApi: ShortcutsAPI;
const shortcutsApiBackToReal: Pick<ReturnType<InstanceType<typeof ShortcutManager>['createProxy']>, keyof ShortcutsAPI> = declaredShortcutsApi;
void shortcutsApiBackToReal;

/* -------------------------------------------------------------- */
/* Wrong usage is rejected                                          */
/* -------------------------------------------------------------- */

// @ts-expect-error fill() requires a selector-value map/array, not a bare number
window.agentlet.forms.fill(formEl, 42);

// @ts-expect-error Module config requires a `name` property
new window.agentlet.Module({ patterns: ['example.com'] });

class BadAgentlet extends window.agentlet.Module {
    // @ts-expect-error cleanupModule must return void or Promise<void>, not a string
    cleanupModule(): string {
        return 'nope';
    }

    // @ts-expect-error unmount must return Promise<void>, not a string
    unmount(_container: HTMLElement): string {
        return 'nope';
    }
}
void BadAgentlet;

// @ts-expect-error sendPrompt resolves to a string, not a number
const wrongAiReply: Promise<number> = window.agentlet.ai.sendPrompt('hi');
void wrongAiReply;

export {};
