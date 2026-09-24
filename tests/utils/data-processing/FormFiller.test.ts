/**
 * Characterization tests for FormFiller.
 *
 * These tests pin down the CURRENT behaviour of
 * `src/utils/data-processing/FormFiller.js` before it is converted to
 * `FormFiller.ts`. Nothing here should change when the conversion lands -
 * if an assertion needs to change, the conversion changed behaviour and
 * that is a bug in the conversion, not in this file.
 *
 * jsdom quirk pinned throughout: `FormFiller.isHidden()` treats an element
 * as hidden when `offsetWidth === 0 || offsetHeight === 0`, and both are
 * always `0` in jsdom unless explicitly overridden. Since `fillForm`'s
 * `skipHidden` option defaults to `true`, EVERY element is skipped by
 * default unless either `markVisible()` is used to fake a non-zero layout
 * size, or `skipHidden: false` is passed explicitly. Both styles are
 * exercised below because both are real, current behaviour.
 */

import FormFiller from '../../../src/utils/data-processing/FormFiller.js';

interface FillDetail {
    selector: string;
    status: 'success' | 'skipped' | 'error';
    value?: unknown;
    reason?: string;
    error?: string;
    element: { tagName: string; type: string; id: string | null; name: string | null; visible: boolean; enabled: boolean } | null;
}

interface FillResult {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    details: FillDetail[];
    errors: string[];
}

interface AIFormElement {
    name: string | null;
    id: string | null;
    selector: string;
    type: string;
    interactable: boolean;
}

interface AIFormExportLike {
    forms?: Array<{ elements: AIFormElement[] }>;
    standaloneElements?: AIFormElement[];
}

interface FormFillerInstance {
    fillForm(parentElement: Element, selectorValues: unknown, options?: Record<string, unknown>): FillResult;
    fillFromAIData(
        parentElement: Element,
        aiFormData: AIFormExportLike,
        userValues: Record<string, unknown>,
        options?: Record<string, unknown>
    ): FillResult;
    fillMultipleForms(
        parentElement: Element,
        formDataArray: Array<{ selectors: unknown; retryAttempts?: number }>,
        options?: Record<string, unknown>
    ): Promise<FillResult[]>;
    parseBoolean(value: unknown): boolean;
    isHidden(element: HTMLElement): boolean;
    getElementType(element: Element): string;
    getElementInfo(element: Element): { tagName: string; type: string; id: string | null; name: string | null; visible: boolean; enabled: boolean };
}

const TypedFormFiller = FormFiller as unknown as { new (): FormFillerInstance };

function makeFiller(): FormFillerInstance {
    return new TypedFormFiller();
}

/** Fakes a non-zero layout size so FormFiller.isHidden() reports false, as a real browser would for a rendered element. */
function markVisible(element: HTMLElement): void {
    Object.defineProperty(element, 'offsetWidth', { value: 100, configurable: true });
    Object.defineProperty(element, 'offsetHeight', { value: 20, configurable: true });
}

function markAllVisible(root: ParentNode): void {
    root.querySelectorAll('input, select, textarea, button, form').forEach((el) => markVisible(el as HTMLElement));
}

describe('FormFiller', () => {
    let filler: FormFillerInstance;

    beforeEach(() => {
        filler = makeFiller();
        document.body.innerHTML = '';
    });

    describe('normalizeSelectorValues (via fillForm input handling)', () => {
        it('accepts a plain object map of selector -> value', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, { '#a': 'hello' });
            expect(result.total).toBe(1);
            expect(result.successful).toBe(1);
        });

        it('accepts an array of {selector, value, type}', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, [{ selector: '#a', value: 'hello', type: 'text' }]);
            expect(result.total).toBe(1);
            expect(result.successful).toBe(1);
        });

        it('throws when selectorValues is neither an array nor an object', () => {
            document.body.innerHTML = '<div id="root"></div>';
            const root = document.getElementById('root') as HTMLElement;
            expect(() => filler.fillForm(root, 42)).toThrow('selectorValues must be an array or object');
        });
    });

    describe('parentElement validation', () => {
        it('throws "Invalid parent element provided" when parentElement has no querySelector', () => {
            expect(() => filler.fillForm({} as Element, {})).toThrow('Invalid parent element provided');
        });
    });

    describe('fillSingleElement error handling', () => {
        it('records an error detail when the selector matches nothing', () => {
            document.body.innerHTML = '<div id="root"></div>';
            const root = document.getElementById('root') as HTMLElement;
            const result = filler.fillForm(root, { '#missing': 'x' });
            expect(result.failed).toBe(1);
            expect(result.details[0]).toMatchObject({ selector: '#missing', status: 'error' });
            expect(result.errors[0]).toBe('Element not found with selector: #missing');
        });

        it('wraps a native selector syntax error as "Invalid selector: ..."', () => {
            document.body.innerHTML = '<div id="root"></div>';
            const root = document.getElementById('root') as HTMLElement;
            const result = filler.fillForm(root, { '[': 'x' });
            expect(result.failed).toBe(1);
            expect(result.errors[0]).toMatch(/^Invalid selector: \[/);
        });
    });

    describe('skip behaviour (shouldSkipElement)', () => {
        it('skips disabled elements by default with reason "Element is disabled"', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" disabled></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, { '#a': 'x' });
            expect(result.skipped).toBe(1);
            expect(result.details[0]).toMatchObject({ status: 'skipped', reason: 'Element is disabled' });
        });

        it('skips readonly elements by default with reason "Element is readonly"', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" readonly></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, { '#a': 'x' });
            expect(result.skipped).toBe(1);
            expect(result.details[0]).toMatchObject({ status: 'skipped', reason: 'Element is readonly' });
        });

        it('QUIRK: skips every element by default because jsdom reports offsetWidth/offsetHeight as 0 (treated as hidden)', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            // Intentionally NOT calling markAllVisible/markVisible here.
            const result = filler.fillForm(root, { '#a': 'x' });
            expect(result.skipped).toBe(1);
            expect(result.details[0]).toMatchObject({ status: 'skipped', reason: 'Element is hidden' });
        });

        it('actually fills once the element is marked visible (non-zero offsetWidth/offsetHeight)', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, { '#a': 'x' });
            expect(result.successful).toBe(1);
        });

        it('fills a jsdom-"hidden" element when skipHidden: false is passed explicitly', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            const result = filler.fillForm(root, { '#a': 'x' }, { skipHidden: false });
            expect(result.successful).toBe(1);
        });

        it('respects skipDisabled: false to fill a disabled element anyway', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" disabled></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, { '#a': 'x' }, { skipDisabled: false });
            expect(result.successful).toBe(1);
        });
    });

    describe('performFill: text-like inputs', () => {
        it.each(['text', 'password', 'email', 'url', 'tel', 'search', 'number', 'date', 'color'])(
            'sets .value and fires input+change for type=%s',
            (type) => {
                document.body.innerHTML = `<div id="root"><input id="a" name="a" type="${type}"></div>`;
                const root = document.getElementById('root') as HTMLElement;
                markAllVisible(root);
                const el = document.getElementById('a') as HTMLInputElement;
                const events: string[] = [];
                el.addEventListener('input', () => events.push('input'));
                el.addEventListener('change', () => events.push('change'));

                const fillValue = type === 'number' ? '42' : type === 'date' ? '2024-01-01' : type === 'color' ? '#ff0000' : 'hello';
                const result = filler.fillForm(root, { '#a': fillValue });
                expect(result.successful).toBe(1);
                expect(el.value).toBe(fillValue);
                expect(events).toEqual(['input', 'change']);
            }
        );

        it('fills a <textarea> the same way as text inputs', () => {
            document.body.innerHTML = '<div id="root"><textarea id="a" name="a"></textarea></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const el = document.getElementById('a') as HTMLTextAreaElement;
            const result = filler.fillForm(root, { '#a': 'multi\nline' });
            expect(result.successful).toBe(1);
            expect(el.value).toBe('multi\nline');
        });

        it('does not dispatch events when triggerEvents: false', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const el = document.getElementById('a') as HTMLInputElement;
            const handler = jest.fn();
            el.addEventListener('input', handler);
            el.addEventListener('change', handler);
            filler.fillForm(root, { '#a': 'x' }, { triggerEvents: false });
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('performFill: select', () => {
        it('sets .value and fires only "change" (not "input")', () => {
            document.body.innerHTML = `
                <div id="root">
                    <select id="s" name="s"><option value="1">One</option><option value="2">Two</option></select>
                </div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const el = document.getElementById('s') as HTMLSelectElement;
            const events: string[] = [];
            el.addEventListener('input', () => events.push('input'));
            el.addEventListener('change', () => events.push('change'));
            const result = filler.fillForm(root, { '#s': '2' });
            expect(result.successful).toBe(1);
            expect(el.value).toBe('2');
            expect(events).toEqual(['change']);
        });
    });

    describe('performFill: checkbox', () => {
        it('checks the box for truthy-ish string values (true/yes/1/on, case-insensitive)', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" type="checkbox"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const el = document.getElementById('a') as HTMLInputElement;
            const result = filler.fillForm(root, { '#a': 'YES' });
            expect(result.successful).toBe(1);
            expect(el.checked).toBe(true);
            expect(result.details[0].value).toBe(true);
        });

        it('unchecks the box for other string values', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" type="checkbox" checked></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const el = document.getElementById('a') as HTMLInputElement;
            filler.fillForm(root, { '#a': 'nope' });
            expect(el.checked).toBe(false);
        });

        it('fires only "change" when toggled', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" type="checkbox"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const el = document.getElementById('a') as HTMLInputElement;
            const events: string[] = [];
            el.addEventListener('input', () => events.push('input'));
            el.addEventListener('change', () => events.push('change'));
            filler.fillForm(root, { '#a': true });
            expect(events).toEqual(['change']);
        });
    });

    describe('performFill: radio', () => {
        it('checks the radio whose value matches exactly', () => {
            document.body.innerHTML = `
                <div id="root">
                    <input type="radio" id="r1" name="grp" value="a">
                    <input type="radio" id="r2" name="grp" value="b">
                </div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, { '#r2': 'b' });
            expect(result.successful).toBe(1);
            expect((document.getElementById('r2') as HTMLInputElement).checked).toBe(true);
        });

        it('QUIRK: also checks the radio when the fill value parses as boolean-true, even if it does not match element.value', () => {
            document.body.innerHTML = '<div id="root"><input type="radio" id="r1" name="grp" value="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, { '#r1': 'true' });
            expect(result.successful).toBe(1);
            expect((document.getElementById('r1') as HTMLInputElement).checked).toBe(true);
            expect(result.details[0].value).toBe('a'); // finalValue becomes element.value, not the input 'true'
        });

        it('leaves the radio unchecked (finalValue null, no event) when neither value matches nor parses as boolean-true', () => {
            document.body.innerHTML = '<div id="root"><input type="radio" id="r1" name="grp" value="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const el = document.getElementById('r1') as HTMLInputElement;
            const handler = jest.fn();
            el.addEventListener('change', handler);
            const result = filler.fillForm(root, { '#r1': 'zzz' });
            expect(result.successful).toBe(1);
            expect(el.checked).toBe(false);
            expect(result.details[0].value).toBeNull();
            expect(handler).not.toHaveBeenCalled();
        });
    });

    describe('performFill: file inputs', () => {
        it('fails with a security-related error message and is recorded as an error, not success', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" type="file"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, { '#a': 'x' });
            expect(result.failed).toBe(1);
            expect(result.errors[0]).toBe('File inputs cannot be filled programmatically for security reasons');
        });
    });

    describe('performFill: unknown element type fallback', () => {
        it('falls back to setting .value and firing only "change" for an unrecognised type (e.g. a <button>)', () => {
            document.body.innerHTML = '<div id="root"><button id="a" name="a"></button></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const el = document.getElementById('a') as HTMLButtonElement;
            const events: string[] = [];
            el.addEventListener('input', () => events.push('input'));
            el.addEventListener('change', () => events.push('change'));
            const result = filler.fillForm(root, { '#a': 'clickme' });
            expect(result.successful).toBe(1);
            expect(el.value).toBe('clickme');
            expect(events).toEqual(['change']);
        });
    });

    describe('validateFields (validateValue)', () => {
        it('rejects an invalid email and throws, recorded as failed', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" type="email"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, { '#a': 'not-an-email' }, { validateFields: true });
            expect(result.failed).toBe(1);
            expect(result.errors[0]).toBe('Invalid value for email element: not-an-email');
        });

        it('accepts a valid email', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" type="email"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, { '#a': 'user@example.com' }, { validateFields: true });
            expect(result.successful).toBe(1);
        });

        it('enforces min/max for a number input', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" type="number" min="0" max="10"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const tooHigh = filler.fillForm(root, { '#a': '99' }, { validateFields: true });
            expect(tooHigh.failed).toBe(1);
        });

        it('validates a select value exists as an <option>', () => {
            document.body.innerHTML = `
                <div id="root"><select id="s" name="s"><option value="1">One</option></select></div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillForm(root, { '#s': '999' }, { validateFields: true });
            expect(result.failed).toBe(1);
            expect(result.errors[0]).toBe('Invalid value for select element: 999');
        });
    });

    describe('getElementInfo', () => {
        it('reports tagName, type, id, name, visible and enabled', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" type="email"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const info = filler.getElementInfo(document.getElementById('a') as Element);
            expect(info).toEqual({ tagName: 'input', type: 'email', id: 'a', name: 'a', visible: true, enabled: true });
        });

        it('reports enabled: false for a disabled element', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" disabled></div>';
            const info = filler.getElementInfo(document.getElementById('a') as Element);
            expect(info.enabled).toBe(false);
        });
    });

    describe('parseBoolean', () => {
        it.each([
            [true, true],
            [false, false],
            ['true', true],
            ['TRUE', true],
            ['yes', true],
            ['1', true],
            ['on', true],
            ['false', false],
            ['no', false],
            ['0', false],
            [1, true],
            [0, false]
        ])('parseBoolean(%p) === %p', (input, expected) => {
            expect(filler.parseBoolean(input)).toBe(expected);
        });

        it('falls back to Boolean() coercion for other types', () => {
            expect(filler.parseBoolean({})).toBe(true);
            expect(filler.parseBoolean(null)).toBe(false);
            expect(filler.parseBoolean(undefined)).toBe(false);
        });
    });

    describe('fillFromAIData', () => {
        function aiFormData(): AIFormExportLike {
            return {
                forms: [
                    {
                        elements: [
                            { name: 'email', id: 'email', selector: '#email', type: 'email', interactable: true },
                            { name: 'noop', id: 'noop', selector: '#noop', type: 'text', interactable: false }
                        ]
                    }
                ],
                standaloneElements: [
                    { name: 'search', id: 'search', selector: '#search', type: 'search', interactable: true }
                ]
            };
        }

        it('maps userValues by name (or id) into selector/value pairs and fills only interactable elements', () => {
            document.body.innerHTML = '<div id="root"><input id="email" name="email" type="email"><input id="search" name="search" type="search"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillFromAIData(root, aiFormData(), { email: 'user@example.com', search: 'query' });
            expect(result.total).toBe(2);
            expect(result.successful).toBe(2);
            expect((document.getElementById('email') as HTMLInputElement).value).toBe('user@example.com');
        });

        it('skips elements whose interactable flag is false, even if a userValue is provided', () => {
            document.body.innerHTML = '<div id="root"><input id="noop" name="noop"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = filler.fillFromAIData(root, aiFormData(), { noop: 'ignored', email: 'x@y.com', search: 'q' });
            const selectors = result.details.map((d) => d.selector);
            expect(selectors).not.toContain('#noop');
        });

        it('skips elements with no matching userValue key at all', () => {
            const data: AIFormExportLike = { standaloneElements: [{ name: 'missing', id: 'missing', selector: '#missing', type: 'text', interactable: true }] };
            document.body.innerHTML = '<div id="root"></div>';
            const root = document.getElementById('root') as HTMLElement;
            const result = filler.fillFromAIData(root, data, {});
            expect(result.total).toBe(0);
        });

        it('QUIRK: `userValues[name] || userValues[id]` means a falsy name-keyed value (e.g. "") is silently replaced by the id-keyed value', () => {
            const data: AIFormExportLike = {
                standaloneElements: [{ name: 'field', id: 'fieldId', selector: '#fieldId', type: 'text', interactable: true }]
            };
            document.body.innerHTML = '<div id="root"><input id="fieldId" name="field"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            // userValues.field === '' is falsy, so `||` moves on to userValues.fieldId even though
            // the caller explicitly provided a (falsy) value for the name key.
            const result = filler.fillFromAIData(root, data, { field: '', fieldId: 'idValue' });
            expect(result.total).toBe(1);
            expect((document.getElementById('fieldId') as HTMLInputElement).value).toBe('idValue');
        });

        it('QUIRK: an explicit empty-string value is dropped entirely (treated as "no value") when no id-keyed fallback exists', () => {
            const data: AIFormExportLike = {
                standaloneElements: [{ name: 'field', id: 'fieldId', selector: '#fieldId', type: 'text', interactable: true }]
            };
            document.body.innerHTML = '<div id="root"><input id="fieldId" name="field"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            // '' || undefined === undefined -> value !== undefined is false -> entry dropped, despite
            // the caller explicitly passing an empty string for the field.
            const result = filler.fillFromAIData(root, data, { field: '' });
            expect(result.total).toBe(0);
        });
    });

    describe('fillMultipleForms', () => {
        it('fills each form data entry once by default (retryAttempts defaults to 1)', async () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const results = await filler.fillMultipleForms(root, [{ selectors: { '#a': 'x' } }]);
            expect(results).toHaveLength(1);
            expect(results[0].successful).toBe(1);
        });

        it('retries with a 500ms delay until failed === 0, using fake timers', async () => {
            jest.useFakeTimers();
            try {
                document.body.innerHTML = '<div id="root"><input id="a" name="a"></div>';
                const root = document.getElementById('root') as HTMLElement;
                // Deliberately NOT visible on the first attempt-independent state: fillForm's
                // outcome depends only on selector/options each attempt, not prior attempts,
                // so to exercise the retry loop we make the FIRST call fail by targeting a
                // missing selector, matching real "flaky DOM" retry usage.
                const promise = filler.fillMultipleForms(
                    root,
                    [{ selectors: { '#missing': 'x' }, retryAttempts: 2 }]
                );
                await jest.advanceTimersByTimeAsync(500);
                const results = await promise;
                expect(results).toHaveLength(1);
                expect(results[0].failed).toBe(1);
            } finally {
                jest.useRealTimers();
            }
        });

        it('stops retrying early once an attempt succeeds (failed === 0)', async () => {
            jest.useFakeTimers();
            try {
                document.body.innerHTML = '<div id="root"><input id="a" name="a"></div>';
                const root = document.getElementById('root') as HTMLElement;
                markAllVisible(root);
                const promise = filler.fillMultipleForms(root, [{ selectors: { '#a': 'x' }, retryAttempts: 3 }]);
                const results = await promise;
                expect(results[0].successful).toBe(1);
            } finally {
                jest.useRealTimers();
            }
        });

        it('catches a thrown error from fillForm and produces a synthetic all-failed result', async () => {
            // No querySelector at all -> fillForm's own parentElement validation throws synchronously.
            const badParent = {} as unknown as Element;
            const results = await filler.fillMultipleForms(badParent, [{ selectors: { '#a': 'x' } }]);
            expect(results[0]).toEqual({
                total: 0,
                successful: 0,
                failed: 1,
                skipped: 0,
                details: [],
                errors: ['Invalid parent element provided']
            });
        });
    });
});
