/**
 * Characterization tests for FormExtractor.
 *
 * These tests pin down the CURRENT behaviour of
 * `src/utils/data-processing/FormExtractor.js` before it is converted to
 * `FormExtractor.ts`. Nothing here should change when the conversion
 * lands - if an assertion needs to change, the conversion changed
 * behaviour and that is a bug in the conversion, not in this file.
 *
 * Important jsdom quirk pinned throughout this file: `offsetWidth`/
 * `offsetHeight` are always `0` in jsdom unless explicitly overridden, so
 * `isVisible()`/`isInteractable()` are `false` for every element by
 * default. Tests that need a "visible" element call `markVisible()` to
 * define non-zero `offsetWidth`/`offsetHeight` on it, mirroring what a
 * real browser layout would report.
 */

import FormExtractor from '../../../src/utils/data-processing/FormExtractor.js';

/** The instance surface this file needs, including internal helpers under test. */
interface FormExtractorInstance {
    extractFormStructure(rootElement: Element, options?: Record<string, unknown>): {
        metadata: { tagName: string; id: string | null; className: string | null; url: string; title: string };
        forms: Array<{
            type: string;
            element: Record<string, unknown>;
            elements: Array<Record<string, unknown>>;
        }>;
        elements: Array<Record<string, unknown>>;
        extractedAt: string;
    };
    exportForAI(rootElement: Element, options?: Record<string, unknown>): {
        metadata: { url: string; title: string; extractedAt: string; totalForms: number; totalElements: number };
        forms: Array<{
            id: string | null;
            name: string | null;
            action: string | undefined;
            method: string | undefined;
            selector: string;
            elements: Array<Record<string, unknown>>;
        }>;
        standaloneElements: Array<Record<string, unknown>>;
    };
    quickExport(element: Element): Array<Record<string, unknown>>;
    getElementType(element: Element): string;
    getSelector(element: Element): string;
    generateCSSSelector(element: Element): string;
    getBasicAttributes(element: Element): Record<string, string>;
    getElementValue(element: Element): unknown;
    getLabel(element: Element, rootElement: Element | Document): string | null;
    getOptions(element: Element): unknown;
    isHidden(element: HTMLElement): boolean;
    isVisible(element: HTMLElement): boolean;
    isInteractable(element: HTMLElement): boolean;
    cleanElementForAI(element: Record<string, unknown>): Record<string, unknown>;
}

const TypedFormExtractor = FormExtractor as unknown as { new (): FormExtractorInstance };

function makeExtractor(): FormExtractorInstance {
    return new TypedFormExtractor();
}

/** Defines non-zero offsetWidth/offsetHeight so isVisible()/isInteractable() report true, as a real browser layout would. */
function markVisible(element: HTMLElement): void {
    Object.defineProperty(element, 'offsetWidth', { value: 100, configurable: true });
    Object.defineProperty(element, 'offsetHeight', { value: 20, configurable: true });
}

function markAllVisible(root: ParentNode): void {
    root.querySelectorAll('input, select, textarea, button, form').forEach((el) => markVisible(el as HTMLElement));
}

describe('FormExtractor', () => {
    let extractor: FormExtractorInstance;

    beforeEach(() => {
        extractor = makeExtractor();
        document.body.innerHTML = '';
    });

    describe('extractMetadata / extractFormStructure top level', () => {
        it('extracts document metadata (tagName, id, className, url, title)', () => {
            document.body.innerHTML = '<div id="root" class="container"><form></form></div>';
            const root = document.getElementById('root') as HTMLElement;
            const result = extractor.extractFormStructure(root);

            expect(result.metadata).toEqual({
                tagName: 'div',
                id: 'root',
                className: 'container',
                url: window.location.href,
                title: document.title
            });
            expect(typeof result.extractedAt).toBe('string');
            expect(() => new Date(result.extractedAt).toISOString()).not.toThrow();
        });

        it('reports null id/className when absent', () => {
            document.body.innerHTML = '<section></section>';
            const root = document.querySelector('section') as HTMLElement;
            const result = extractor.extractFormStructure(root);
            expect(result.metadata.id).toBeNull();
            expect(result.metadata.className).toBeNull();
        });
    });

    describe('findFormElements / groupElementsByForm / processForm', () => {
        it('groups elements inside a <form> under a form entry, separate from standalone elements', () => {
            document.body.innerHTML = `
                <div id="root">
                    <form id="f1"><input id="in1" name="in1"></form>
                    <input id="standalone" name="standalone">
                </div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = extractor.extractFormStructure(root);

            expect(result.forms).toHaveLength(1);
            expect(result.forms[0].type).toBe('form');
            expect(result.forms[0].element.id).toBe('f1');
            expect(result.forms[0].elements).toHaveLength(1);
            expect(result.forms[0].elements[0].id).toBe('in1');

            expect(result.elements).toHaveLength(1);
            expect(result.elements[0].id).toBe('standalone');
        });

        it('excludes the <form> element itself from its own elements list', () => {
            document.body.innerHTML = '<form id="f1"><input id="in1" name="in1"></form>';
            const root = document.getElementById('f1') as HTMLElement;
            markAllVisible(root);
            const result = extractor.extractFormStructure(root);
            const ids = result.forms[0].elements.map((el) => el.id);
            expect(ids).not.toContain('f1');
            expect(ids).toEqual(['in1']);
        });

        it('supports multiple separate forms on the same page', () => {
            document.body.innerHTML = `
                <div id="root">
                    <form id="f1"><input id="a" name="a"></form>
                    <form id="f2"><input id="b" name="b"></form>
                </div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = extractor.extractFormStructure(root);
            expect(result.forms).toHaveLength(2);
            expect(result.forms.map((f) => f.element.id).sort()).toEqual(['f1', 'f2']);
        });

        it('treats the root element itself as a form element when it is an input/select/textarea/button', () => {
            document.body.innerHTML = '<input id="lone" name="lone">';
            const root = document.getElementById('lone') as HTMLElement;
            markVisible(root);
            const result = extractor.extractFormStructure(root);
            expect(result.elements).toHaveLength(1);
            expect(result.elements[0].id).toBe('lone');
        });

        it('finds fieldset-nested elements via querySelectorAll regardless of the fieldset wrapper', () => {
            document.body.innerHTML = `
                <form id="f1">
                    <fieldset><legend>G</legend><input id="nested" name="nested"></fieldset>
                </form>
            `;
            const root = document.getElementById('f1') as HTMLElement;
            markAllVisible(root);
            const result = extractor.extractFormStructure(root);
            expect(result.forms[0].elements.map((e) => e.id)).toEqual(['nested']);
        });
    });

    describe('filtering config (includeHidden / includeDisabled / includeReadOnly)', () => {
        it('excludes hidden, disabled elements by default but includes readonly by default', () => {
            document.body.innerHTML = `
                <div id="root">
                    <input id="hiddenInput" type="hidden" name="h" value="x">
                    <input id="disabledInput" name="d" disabled>
                    <input id="readonlyInput" name="r" readonly value="y">
                    <input id="normalInput" name="n" value="z">
                </div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = extractor.extractFormStructure(root);
            const ids = result.elements.map((e) => e.id);
            expect(ids).not.toContain('hiddenInput');
            expect(ids).not.toContain('disabledInput');
            expect(ids).toContain('readonlyInput');
            expect(ids).toContain('normalInput');
        });

        it('includes hidden elements when includeHidden is true', () => {
            document.body.innerHTML = '<div id="root"><input id="h" type="hidden" name="h" value="x"></div>';
            const root = document.getElementById('root') as HTMLElement;
            const result = extractor.extractFormStructure(root, { includeHidden: true });
            expect(result.elements.map((e) => e.id)).toContain('h');
        });

        it('includes disabled elements when includeDisabled is true', () => {
            document.body.innerHTML = '<div id="root"><input id="d" name="d" disabled></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = extractor.extractFormStructure(root, { includeDisabled: true });
            expect(result.elements.map((e) => e.id)).toContain('d');
        });

        it('excludes readonly elements when includeReadOnly is false', () => {
            document.body.innerHTML = '<div id="root"><input id="r" name="r" readonly value="y"></div>';
            const root = document.getElementById('root') as HTMLElement;
            const result = extractor.extractFormStructure(root, { includeReadOnly: false });
            expect(result.elements.map((e) => e.id)).not.toContain('r');
        });
    });

    describe('getElementType', () => {
        it('returns the input type attribute for <input> elements, defaulting to "text"', () => {
            document.body.innerHTML = '<input id="a" type="email"><input id="b">';
            expect(extractor.getElementType(document.getElementById('a') as Element)).toBe('email');
            expect(extractor.getElementType(document.getElementById('b') as Element)).toBe('text');
        });

        it('returns the lowercased tag name for non-input elements', () => {
            document.body.innerHTML = '<textarea id="t"></textarea><select id="s"></select><button id="btn"></button>';
            expect(extractor.getElementType(document.getElementById('t') as Element)).toBe('textarea');
            expect(extractor.getElementType(document.getElementById('s') as Element)).toBe('select');
            expect(extractor.getElementType(document.getElementById('btn') as Element)).toBe('button');
        });
    });

    describe('getSelector / generateCSSSelector', () => {
        it('prefers #id when present', () => {
            document.body.innerHTML = '<input id="myId" name="myName">';
            expect(extractor.getSelector(document.getElementById('myId') as Element)).toBe('#myId');
        });

        it('falls back to [name="..."] when no id is present', () => {
            document.body.innerHTML = '<input name="myName">';
            const el = document.querySelector('input') as Element;
            expect(extractor.getSelector(el)).toBe('[name="myName"]');
        });

        it('falls back to a generated CSS selector (tag + type + up to 2 non-agentlet classes) when no id or name', () => {
            document.body.innerHTML = '<input type="text" class="agentlet-ignored foo bar baz">';
            const el = document.querySelector('input') as Element;
            expect(extractor.getSelector(el)).toBe('input[type="text"].foo.bar');
        });

        it('generateCSSSelector omits the class segment when only agentlet- classes are present', () => {
            document.body.innerHTML = '<input type="text" class="agentlet-only">';
            const el = document.querySelector('input') as Element;
            expect(extractor.generateCSSSelector(el)).toBe('input[type="text"]');
        });
    });

    describe('getBasicAttributes', () => {
        it('only includes relevant attributes that are actually present', () => {
            document.body.innerHTML = '<input id="a" name="a" type="number" min="0" max="10" placeholder="p" required>';
            const el = document.getElementById('a') as Element;
            const attrs = extractor.getBasicAttributes(el);
            expect(attrs).toEqual({
                type: 'number',
                name: 'a',
                placeholder: 'p',
                required: '',
                min: '0',
                max: '10'
            });
            expect(attrs).not.toHaveProperty('value');
            expect(attrs).not.toHaveProperty('step');
        });
    });

    describe('getElementValue', () => {
        it('returns the raw value for a text input, or null when empty', () => {
            document.body.innerHTML = '<input id="a" value="hello"><input id="b">';
            expect(extractor.getElementValue(document.getElementById('a') as Element)).toBe('hello');
            expect(extractor.getElementValue(document.getElementById('b') as Element)).toBeNull();
        });

        it('returns {checked, value} for checkbox/radio', () => {
            document.body.innerHTML = '<input id="c" type="checkbox" value="yes" checked>';
            expect(extractor.getElementValue(document.getElementById('c') as Element)).toEqual({ checked: true, value: 'yes' });
        });

        it('returns {selectedValue, selectedOptions} for select', () => {
            document.body.innerHTML = `
                <select id="s">
                    <option value="1">One</option>
                    <option value="2" selected>Two</option>
                </select>
            `;
            const value = extractor.getElementValue(document.getElementById('s') as Element);
            expect(value).toEqual({
                selectedValue: '2',
                selectedOptions: [{ value: '2', text: 'Two' }]
            });
        });

        it('returns {files, accept} for file inputs', () => {
            document.body.innerHTML = '<input id="f" type="file" accept=".pdf">';
            const value = extractor.getElementValue(document.getElementById('f') as Element);
            expect(value).toEqual({ files: [], accept: '.pdf' });
        });
    });

    describe('getLabel', () => {
        it('reads an explicit label[for] within rootElement', () => {
            document.body.innerHTML = '<div id="root"><label for="a">First name</label><input id="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            const el = document.getElementById('a') as Element;
            expect(extractor.getLabel(el, root)).toBe('First name');
        });

        it('reads a wrapping (implicit) label', () => {
            document.body.innerHTML = '<div id="root"><label>Email <input id="e"></label></div>';
            const root = document.getElementById('root') as HTMLElement;
            const el = document.getElementById('e') as Element;
            expect(extractor.getLabel(el, root)).toBe('Email');
        });

        it('reads an aria-label attribute', () => {
            document.body.innerHTML = '<div id="root"><input id="a" aria-label="Search box"></div>';
            const root = document.getElementById('root') as HTMLElement;
            const el = document.getElementById('a') as Element;
            expect(extractor.getLabel(el, root)).toBe('Search box');
        });

        it('joins multiple label sources with " | "', () => {
            document.body.innerHTML = '<div id="root"><label for="a">Explicit</label><label>Wrap <input id="a" aria-label="Aria"></label></div>';
            const root = document.getElementById('root') as HTMLElement;
            const el = document.getElementById('a') as Element;
            expect(extractor.getLabel(el, root)).toBe('Explicit | Wrap | Aria');
        });

        it('returns null when no label source is present', () => {
            document.body.innerHTML = '<div id="root"><input id="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            const el = document.getElementById('a') as Element;
            expect(extractor.getLabel(el, root)).toBeNull();
        });
    });

    describe('getOptions', () => {
        it('returns {multiple, options[]} for <select>', () => {
            document.body.innerHTML = `
                <select id="s" multiple>
                    <option value="1">One</option>
                    <option value="2" selected disabled>Two</option>
                </select>
            `;
            const options = extractor.getOptions(document.getElementById('s') as Element) as {
                multiple: boolean;
                options: Array<{ index: number; value: string; text: string; selected: boolean; disabled: boolean }>;
            };
            expect(options.multiple).toBe(true);
            expect(options.options).toEqual([
                { index: 0, value: '1', text: 'One', selected: false, disabled: false },
                { index: 1, value: '2', text: 'Two', selected: true, disabled: true }
            ]);
        });

        it('returns {group, groupSize} for a named radio group, reading document-wide (not scoped to rootElement)', () => {
            document.body.innerHTML = `
                <div id="root"><input type="radio" id="r1" name="grp" value="a" checked></div>
                <div id="outside"><input type="radio" id="r2" name="grp" value="b"></div>
            `;
            const el = document.getElementById('r1') as Element;
            const options = extractor.getOptions(el) as { group: Array<Record<string, unknown>>; groupSize: number };
            // Quirk: getOptions() always queries the global `document`, not the
            // rootElement passed to extractFormStructure, so a radio outside
            // the extraction root is still counted here.
            expect(options.groupSize).toBe(2);
            expect(options.group.map((g) => g.value)).toEqual(['a', 'b']);
        });

        it('returns null for elements with no options (e.g. a text input)', () => {
            document.body.innerHTML = '<input id="a" type="text">';
            expect(extractor.getOptions(document.getElementById('a') as Element)).toBeNull();
        });

        it('returns null for a radio/checkbox with no name attribute', () => {
            document.body.innerHTML = '<input id="a" type="checkbox">';
            expect(extractor.getOptions(document.getElementById('a') as Element)).toBeNull();
        });
    });

    describe('isHidden / isVisible / isInteractable', () => {
        it('isHidden detects type=hidden, display:none, visibility:hidden, and the hidden attribute', () => {
            document.body.innerHTML = `
                <input id="a" type="hidden">
                <input id="b" style="display:none">
                <input id="c" style="visibility:hidden">
                <input id="d" hidden>
                <input id="e">
            `;
            expect(extractor.isHidden(document.getElementById('a') as HTMLElement)).toBe(true);
            expect(extractor.isHidden(document.getElementById('b') as HTMLElement)).toBe(true);
            expect(extractor.isHidden(document.getElementById('c') as HTMLElement)).toBe(true);
            expect(extractor.isHidden(document.getElementById('d') as HTMLElement)).toBe(true);
            expect(extractor.isHidden(document.getElementById('e') as HTMLElement)).toBe(false);
        });

        it('isVisible is false in jsdom unless offsetWidth/offsetHeight are non-zero', () => {
            document.body.innerHTML = '<input id="a">';
            const el = document.getElementById('a') as HTMLElement;
            expect(extractor.isVisible(el)).toBe(false);
            markVisible(el);
            expect(extractor.isVisible(el)).toBe(true);
        });

        it('isInteractable requires visible, non-disabled and non-readonly', () => {
            document.body.innerHTML = '<input id="a" disabled><input id="b" readonly><input id="c">';
            const a = document.getElementById('a') as HTMLElement;
            const b = document.getElementById('b') as HTMLElement;
            const c = document.getElementById('c') as HTMLElement;
            markVisible(a);
            markVisible(b);
            markVisible(c);
            expect(extractor.isInteractable(a)).toBe(false);
            expect(extractor.isInteractable(b)).toBe(false);
            expect(extractor.isInteractable(c)).toBe(true);
        });
    });

    describe('getBoundingBox (via includeBoundingBoxes option)', () => {
        it('adds a rounded boundingBox with a visible flag when requested', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            const el = document.getElementById('a') as HTMLElement;
            markVisible(root);
            markVisible(el);
            el.getBoundingClientRect = (): DOMRect => ({
                x: 10.4, y: 20.6, width: 100.2, height: 30.9,
                top: 20.6, left: 10.4, bottom: 51.5, right: 110.6,
                toJSON: () => ({})
            } as DOMRect);

            const result = extractor.extractFormStructure(root, { includeBoundingBoxes: true });
            const info = result.elements[0] as { boundingBox: { x: number; y: number; width: number; height: number; visible: boolean } };
            expect(info.boundingBox).toEqual({ x: 10, y: 21, width: 100, height: 31, visible: true });
        });

        it('omits boundingBox entirely when not requested', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = extractor.extractFormStructure(root);
            expect(result.elements[0]).not.toHaveProperty('boundingBox');
        });
    });

    describe('exportForAI', () => {
        function buildRichForm(): HTMLElement {
            document.body.innerHTML = `
                <div id="root">
                    <form id="f1" action="/submit" method="post">
                        <label for="email">Email</label>
                        <input id="email" name="email" type="email" value="a@b.com">
                        <select id="country" name="country">
                            <option value="fr">France</option>
                            <option value="us" selected>USA</option>
                        </select>
                        <input id="agree" name="agree" type="checkbox" checked>
                        <input id="hiddenTok" name="hiddenTok" type="hidden" value="tok">
                        <input id="disabledField" name="disabledField" disabled>
                    </form>
                    <input id="standaloneSearch" name="standaloneSearch" type="search" placeholder="Search">
                </div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            return root;
        }

        it('computes metadata totals across forms and standalone elements', () => {
            const root = buildRichForm();
            const result = extractor.exportForAI(root);
            // Interactable in-form fields: email, country, agree (hidden + disabled excluded by default findFormElements filtering).
            expect(result.metadata.totalForms).toBe(1);
            expect(result.metadata.totalElements).toBe(4); // 3 form fields + 1 standalone
        });

        it('builds one entry per form with id/name/action/method/selector and only interactable elements', () => {
            const root = buildRichForm();
            const result = extractor.exportForAI(root);
            const form = result.forms[0];
            expect(form.id).toBe('f1');
            expect(form.action).toBe('/submit');
            expect(form.method).toBe('post');
            expect(form.selector).toBe('#f1');
            expect(form.elements.map((e) => e.id)).toEqual(['email', 'country', 'agree']);
        });

        it('includes standalone interactable elements separately', () => {
            const root = buildRichForm();
            const result = extractor.exportForAI(root);
            expect(result.standaloneElements.map((e) => e.id)).toEqual(['standaloneSearch']);
        });

        it('matches the pinned snapshot shape', () => {
            const root = buildRichForm();
            const result = extractor.exportForAI(root);
            // extractedAt is a live `new Date().toISOString()` timestamp, so it
            // can never be pinned to a literal value - only its type is checked
            // here, via a nested property matcher.
            expect(result).toMatchSnapshot({
                metadata: { extractedAt: expect.any(String) }
            });
        });
    });

    describe('cleanElementForAI (via exportForAI output)', () => {
        it('includes an options[] array of {value,text,selected,disabled} for select elements', () => {
            document.body.innerHTML = `
                <div id="root">
                    <select id="s" name="s">
                        <option value="1">One</option>
                        <option value="2" selected>Two</option>
                    </select>
                </div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = extractor.exportForAI(root);
            expect(result.standaloneElements[0].options).toEqual([
                { value: '1', text: 'One', selected: false, disabled: false },
                { value: '2', text: 'Two', selected: true, disabled: false }
            ]);
        });

        it('includes an options[] array of {value,checked,label} for radio/checkbox elements', () => {
            document.body.innerHTML = `
                <div id="root">
                    <input type="radio" id="r1" name="grp" value="a" checked>
                    <input type="radio" id="r2" name="grp" value="b">
                </div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = extractor.exportForAI(root);
            const r1 = result.standaloneElements.find((e) => e.id === 'r1') as Record<string, unknown>;
            expect(r1.options).toEqual([
                { value: 'a', checked: true, label: null },
                { value: 'b', checked: false, label: null }
            ]);
        });

        it('omits the options key entirely for plain text-like elements', () => {
            document.body.innerHTML = '<div id="root"><input id="a" name="a" type="text" value="x"></div>';
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const result = extractor.exportForAI(root);
            expect(result.standaloneElements[0]).not.toHaveProperty('options');
        });
    });

    describe('quickExport', () => {
        it('flattens form fields and standalone fields into one array of simplified entries', () => {
            document.body.innerHTML = `
                <div id="root">
                    <form id="f1">
                        <input id="a" name="a" type="text" value="x" required>
                    </form>
                    <input id="b" name="b" type="text" value="y">
                </div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const fields = extractor.quickExport(root);
            expect(fields).toEqual([
                { selector: '#a', type: 'text', name: 'a', label: null, value: 'x', required: true, options: null },
                { selector: '#b', type: 'text', name: 'b', label: null, value: 'y', required: false, options: null }
            ]);
        });

        it('always forces includeHidden/includeDisabled/includeBoundingBoxes to false regardless of visibility mocking', () => {
            document.body.innerHTML = `
                <div id="root">
                    <input id="hiddenInput" type="hidden" name="h" value="x">
                    <input id="disabledInput" name="d" disabled>
                </div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            const fields = extractor.quickExport(root);
            expect(fields.map((f) => f.selector)).not.toContain('#hiddenInput');
            expect(fields.map((f) => f.selector)).not.toContain('#disabledInput');
        });

        it('matches the pinned snapshot shape', () => {
            document.body.innerHTML = `
                <div id="root">
                    <form id="f1">
                        <select id="s" name="s"><option value="1" selected>One</option></select>
                    </form>
                </div>
            `;
            const root = document.getElementById('root') as HTMLElement;
            markAllVisible(root);
            expect(extractor.quickExport(root)).toMatchSnapshot();
        });
    });
});
