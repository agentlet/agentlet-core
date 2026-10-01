/**
 * Tests for `records.onPaste()` (unsubscribe, scope, types, no interception
 * of a paste without a record), the events, and the wiring of
 * `window.agentlet.records` on a real core instance.
 */
import AgentletCore from '../../../../src/index.js';
import { toBase64Url } from '../../../../src/utils/data-processing/records/text.js';
import { installRealDom, makeManager as createManager, pasteEvent, setPage, uninstallLayout } from './helpers.js';

beforeAll(installRealDom);
afterAll(uninstallLayout);
const created: Array<{ cleanup(): void }> = [];
/** Every manager made here is cleaned up after the test, so its document-level listeners cannot leak into the next one. */
const makeManager: typeof createManager = (overrides) => {
    const context = createManager(overrides);
    created.push(context.manager);
    return context;
};

afterEach(() => {
    created.splice(0).forEach(manager => manager.cleanup());
    document.body.innerHTML = '';
});

const envelope = (type = 'organization') => ({ agentlet: 'record', version: 1, type, fields: { organization: 'Example SAS' }, source: { url: '', origin: 'https://registry.example', title: '', copiedAt: '' } });
const withRecord = (type?: string) => ({ 'text/html': `<dl data-agentlet-record="${toBase64Url(JSON.stringify(envelope(type)))}"><dt>Organization</dt><dd>Example SAS</dd></dl>`, 'text/plain': 'Organization: Example SAS' });

describe('records.onPaste()', () => {
    it('calls the handler with the records and the event, and takes over the paste', () => {
        const { manager, emit } = makeManager();
        const handler = jest.fn();
        manager.onPaste(handler, { scope: document.body });
        const event = pasteEvent(withRecord());
        document.body.dispatchEvent(event);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0]).toEqual([expect.objectContaining({ type: 'organization', fields: { organization: 'Example SAS' } })]);
        expect(handler.mock.calls[0][1]).toBe(event);
        expect(event.defaultPrevented).toBe(true);
        expect(emit).toHaveBeenCalledWith('records:pasted', { type: 'organization', fieldCount: 1, itemCount: 1, sourceOrigin: 'https://registry.example' });
    });

    it('returns an unsubscribe function that stops the handler', () => {
        const { manager } = makeManager();
        const handler = jest.fn();
        const unsubscribe = manager.onPaste(handler, { scope: document.body });
        unsubscribe();
        const event = pasteEvent(withRecord());
        document.body.dispatchEvent(event);
        expect(handler).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
        expect(() => unsubscribe()).not.toThrow();
    });

    it.each([
        ['plain text', { 'text/plain': 'just some text' }],
        ['ordinary html', { 'text/html': '<p>Hello</p>', 'text/plain': 'Hello' }],
        ['an invalid record', { 'text/html': `<dl data-agentlet-record="${toBase64Url('{"agentlet":"record","version":3}')}"></dl>` }],
        ['an empty clipboard', {}]
    ])('ignores a paste with %s and does not call preventDefault', (_name, data) => {
        setPage('<input id="field">');
        const { manager } = makeManager();
        const handler = jest.fn();
        manager.onPaste(handler, { scope: document.body });
        const event = pasteEvent(data);
        const preventDefault = jest.spyOn(event, 'preventDefault');
        document.getElementById('field')?.dispatchEvent(event);
        expect(handler).not.toHaveBeenCalled();
        expect(preventDefault).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('ignores a paste event that has no clipboardData', () => {
        const { manager } = makeManager();
        const handler = jest.fn();
        manager.onPaste(handler, { scope: document.body });
        const event = new Event('paste', { bubbles: true, cancelable: true });
        document.body.dispatchEvent(event);
        expect(handler).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    it('only reacts to the listed types, and leaves other pastes alone', () => {
        const { manager } = makeManager();
        const handler = jest.fn();
        manager.onPaste(handler, { scope: document.body, types: ['organization'] });
        const other = pasteEvent(withRecord('contact'));
        document.body.dispatchEvent(other);
        expect(handler).not.toHaveBeenCalled();
        expect(other.defaultPrevented).toBe(false);
        const match = pasteEvent(withRecord('organization'));
        document.body.dispatchEvent(match);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(match.defaultPrevented).toBe(true);
    });

    it.each([undefined, {}, { scope: null }, { scope: document }, { scope: 'form' }, { scope: {} }])('throws a TypeError when scope is missing or not an element: %p', (options) => {
        const { manager } = makeManager();
        expect(() => manager.onPaste(jest.fn(), options as never)).toThrow(TypeError);
        expect(() => manager.onPaste(jest.fn(), options as never)).toThrow(/scope/);
    });

    it('listens only inside the scope', () => {
        setPage('<form id="inside"><input id="a"></form><input id="outside">');
        const { manager } = makeManager();
        const handler = jest.fn();
        manager.onPaste(handler, { scope: document.getElementById('inside') as HTMLElement });
        const outside = pasteEvent(withRecord());
        document.getElementById('outside')?.dispatchEvent(outside);
        expect(handler).not.toHaveBeenCalled();
        expect(outside.defaultPrevented).toBe(false);
        const inside = pasteEvent(withRecord());
        document.getElementById('a')?.dispatchEvent(inside);
        expect(handler).toHaveBeenCalledTimes(1);
        expect(inside.defaultPrevented).toBe(true);
    });

    it('keeps listening after a handler throws, and reports a rejected promise', async () => {
        const { manager } = makeManager();
        const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const handler = jest.fn()
            .mockImplementationOnce(() => { throw new Error('boom'); })
            .mockImplementationOnce(() => Promise.reject(new Error('async boom')));
        manager.onPaste(handler, { scope: document.body });
        document.body.dispatchEvent(pasteEvent(withRecord()));
        document.body.dispatchEvent(pasteEvent(withRecord()));
        await Promise.resolve();
        await Promise.resolve();
        expect(handler).toHaveBeenCalledTimes(2);
        expect(errors).toHaveBeenCalledTimes(2);
        errors.mockRestore();
    });

    it('supports several subscriptions and cleanup() removes them all', () => {
        const { manager } = makeManager();
        const first = jest.fn();
        const second = jest.fn();
        manager.onPaste(first, { scope: document.body });
        manager.onPaste(second, { scope: document.body });
        document.body.dispatchEvent(pasteEvent(withRecord()));
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
        manager.cleanup();
        document.body.dispatchEvent(pasteEvent(withRecord()));
        expect(first).toHaveBeenCalledTimes(1);
        expect(second).toHaveBeenCalledTimes(1);
    });

    it('can fill a form from a paste, the way the RFC example does', async () => {
        const form = setPage('<form id="supplier"><label for="co">Raison sociale</label><input id="co" name="f1"></form>').querySelector('form') as HTMLFormElement;
        const { manager } = makeManager();
        const done = new Promise<void>(resolve => {
            manager.onPaste(async ([record]) => {
                const result = await manager.fill(record, form, { preview: false });
                expect(result.confirmed).toBe(true);
                resolve();
            }, { scope: form, types: ['organization'] });
        });
        form.querySelector('input')?.dispatchEvent(pasteEvent(withRecord()));
        await done;
        expect((document.getElementById('co') as HTMLInputElement).value).toBe('Example SAS');
    });
});

describe('window.agentlet.records', () => {
    let core: AgentletCore | undefined;

    beforeEach(() => {
        delete (window as { agentlet?: unknown }).agentlet;
    });

    afterEach(async () => {
        if (core && core.initialized) await core.cleanup();
        delete (window as { agentlet?: unknown }).agentlet;
    });

    it('is exposed with every method of the API, and the manager is on the core', () => {
        core = new AgentletCore();
        const { records } = window.agentlet;
        expect(Object.keys(records).sort()).toEqual([
            'copy', 'create', 'defineType', 'fill', 'fromElement', 'fromForm', 'fromPasteEvent', 'fromTable',
            'getType', 'listTypes', 'match', 'onPaste', 'pasteFromClipboard', 'pick', 'read', 'validate'
        ]);
        expect(window.agentlet.recordsManager).toBe(core.recordsManager);
        expect(records.listTypes().map(type => type.name)).toContain('contact');
    });

    it('works through the global object, with the shared event bus and storage', async () => {
        core = new AgentletCore();
        const seen: unknown[] = [];
        window.agentlet.eventBus.on('records:filled', data => seen.push(data));
        const form = setPage('<form><input id="a" name="email"></form>');
        const record = window.agentlet.records.create('contact', { email: 'ada@example.com' });
        const result = await window.agentlet.records.fill(record, form, { preview: false });
        expect(result.successful).toBe(1);
        expect((document.getElementById('a') as HTMLInputElement).value).toBe('ada@example.com');
        expect(seen).toEqual([{ type: 'contact', fieldCount: 1, itemCount: 1, sourceOrigin: window.location.origin }]);
    });

    it('removes its paste listeners when the core is cleaned up', async () => {
        core = new AgentletCore();
        await core.init();
        const handler = jest.fn();
        window.agentlet.records.onPaste(handler, { scope: document.body });
        await core.cleanup();
        document.body.dispatchEvent(pasteEvent(withRecord()));
        expect(handler).not.toHaveBeenCalled();
    });
});
