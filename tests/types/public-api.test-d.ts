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
} from '../../src/types/public-api';

import Module from '../../src/core/Module';
import { EventBus } from '../../src/core/EventBus';
import { ThemeManager } from '../../src/core/ThemeManager';
import ScriptInjector from '../../src/utils/system/ScriptInjector';
import { LocalStorageEnvironmentVariablesManager } from '../../src/utils/config-persistence/EnvManager';
import CookieManager from '../../src/utils/config-persistence/CookieManager';
import { Z_INDEX } from '../../src/utils/ui/ZIndex';
import PageHighlighter from '../../src/utils/ui/PageHighlighter';
import Dialog from '../../src/utils/ui/Dialog';
import { PanelManager } from '../../src/ui/PanelManager';

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
const storedValue: string | undefined = window.agentlet.storage.local.get('key');
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
}
void BadAgentlet;

// @ts-expect-error sendPrompt resolves to a string, not a number
const wrongAiReply: Promise<number> = window.agentlet.ai.sendPrompt('hi');
void wrongAiReply;

export {};
