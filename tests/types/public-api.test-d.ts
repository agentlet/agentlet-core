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
    FormFillResult,
    TableData,
    AIStatus,
} from '../../src/types/public-api';

import Module from '../../src/core/Module';
import { EventBus } from '../../src/core/EventBus';
import { ThemeManager } from '../../src/core/ThemeManager';
import { Z_INDEX } from '../../src/utils/ui/ZIndex';

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
 * ThemeManager, ZIndex and Module to real .ts classes/modules that share
 * their option/shape types with this file (see the `import type { ... }
 * from '../../src/types/public-api'` usages in each of them). These
 * checks assert bidirectional assignability between each real class and
 * its hand-written declaration here, so drift in either direction fails
 * `npm run typecheck`.
 */

// real -> declared
const moduleCtorCheck: typeof AgentletModule = Module;
const moduleInstanceCheck: AgentletModule = new Module({ name: 'conformance-check', patterns: ['example.com'] });
const eventBusCheck: EventBusAPI = new EventBus();
const themeCheck: ThemeManagerAPI = new ThemeManager();
const zIndexCheck: ZIndexConstants = Z_INDEX;
void moduleCtorCheck;
void moduleInstanceCheck;
void eventBusCheck;
void themeCheck;
void zIndexCheck;

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
