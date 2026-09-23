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
    ModuleActivationContext,
    FormFillResult,
    TableData,
    AIStatus,
} from '../../src/types/public-api';

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
