/**
 * Tests for the argument checks at the records API boundary: a missing or
 * wrong element gets a clear TypeError that names the method, never a
 * "Cannot read properties of undefined" from deep inside.
 */
import type { AgentletRecord } from '../../../../src/types/public-api';
import { fieldsRecord, installClipboard, installRealDom, makeManager, removeClipboard, setPage, uninstallLayout } from './helpers.js';

beforeAll(installRealDom);
afterAll(uninstallLayout);

const bad: Array<[string, unknown]> = [
    ['undefined', undefined],
    ['null', null],
    ['a string', '#form'],
    ['a plain object', { tagName: 'FORM' }],
    ['a text node', document.createTextNode('x')],
    ['the document', document]
];

describe('records element arguments', () => {
    const { manager } = makeManager();
    const record: AgentletRecord = fieldsRecord('organization', { organization: 'Example SAS' });

    describe.each(bad)('with %s', (_label, value) => {
        const element = value as Element;

        it('fromElement() throws a clear TypeError', () => {
            expect(() => manager.fromElement(element)).toThrow(TypeError);
            expect(() => manager.fromElement(element)).toThrow('records.fromElement() expects an Element');
        });

        it('fromForm() throws a clear TypeError', () => {
            expect(() => manager.fromForm(element)).toThrow(TypeError);
            expect(() => manager.fromForm(element)).toThrow(/^records\.fromForm\(\) expects an Element/);
        });

        it('fromTable() throws a clear TypeError', () => {
            expect(() => manager.fromTable(element as HTMLTableElement)).toThrow(TypeError);
            expect(() => manager.fromTable(element as HTMLTableElement)).toThrow('records.fromTable() expects a table element');
        });

        it('match() throws a clear TypeError', () => {
            expect(() => manager.match(record, element)).toThrow(TypeError);
            expect(() => manager.match(record, element)).toThrow(/^records\.match\(\) expects an Element/);
        });

        it('fill() rejects with a clear TypeError', async () => {
            await expect(manager.fill(record, element)).rejects.toThrow(TypeError);
            await expect(manager.fill(record, element)).rejects.toThrow(/^records\.fill\(\) expects an Element/);
        });

        it('pasteFromClipboard() rejects with a clear TypeError before reading the clipboard', async () => {
            const clipboard = installClipboard();
            try {
                await expect(manager.pasteFromClipboard(element)).rejects.toThrow(TypeError);
                await expect(manager.pasteFromClipboard(element)).rejects.toThrow(/^records\.pasteFromClipboard\(\) expects an Element/);
                expect(clipboard.read).not.toHaveBeenCalled();
            } finally {
                removeClipboard();
            }
        });
    });

    it('fromTable() rejects an element that is not a table', () => {
        setPage('<div id="d"></div>');
        expect(() => manager.fromTable(document.getElementById('d') as unknown as HTMLTableElement)).toThrow('records.fromTable() expects a table element');
    });

    it('still accepts a real element, including one from another frame', () => {
        setPage('<form id="f"><input name="email" value="a@example.com"></form>');
        const form = document.getElementById('f') as HTMLFormElement;
        expect(manager.fromForm(form).fields).toMatchObject({ email: 'a@example.com' });
        expect(manager.fromElement(form)).not.toBeNull();
        const frame = document.createElement('iframe');
        document.body.appendChild(frame);
        const foreign = frame.contentDocument?.createElement('form') as HTMLFormElement;
        expect(() => manager.match(record, foreign)).not.toThrow(TypeError);
    });

    it('keeps the onPaste scope check', () => {
        expect(() => manager.onPaste(jest.fn(), {} as never)).toThrow(TypeError);
        expect(() => manager.onPaste(jest.fn(), { scope: undefined } as never)).toThrow(/needs options\.scope/);
    });

    it('goes through window.agentlet.records too (the proxy)', () => {
        expect(() => manager.createProxy().fromElement(undefined as unknown as Element)).toThrow('records.fromElement() expects an Element');
    });
});
