/**
 * Tests for the record builders: create(), fromForm(), fromTable(),
 * fromElement() (table, form, dl, label and value pairs) and pick().
 */
import type { AgentletRecord, ElementSelectorAPI, FieldsRecord, TableRecord } from '../../../../src/types/public-api';
import { byId, installRealDom, makeManager, recordOf, setPage, uninstallLayout } from './helpers.js';

beforeAll(installRealDom);
afterAll(uninstallLayout);
afterEach(() => { document.body.innerHTML = ''; });

const fieldsOf = (record: AgentletRecord | null): FieldsRecord => recordOf(record) as FieldsRecord;

describe('records.create()', () => {
    const { manager } = makeManager();

    it('builds a record and sets the source from the current page', () => {
        document.title = 'Registry';
        const record = manager.create('organization', { organization: 'Example SAS', siren: '123456789' }, { labels: { siren: 'SIREN' } });
        expect(record).toMatchObject({
            agentlet: 'record',
            version: 1,
            type: 'organization',
            fields: { organization: 'Example SAS', siren: '123456789' },
            labels: { siren: 'SIREN' }
        });
        expect(record.source?.origin).toBe(window.location.origin);
        expect(record.source?.url).toBe(window.location.href);
        expect(record.source?.title).toBe('Registry');
        expect(Number.isNaN(Date.parse(record.source?.copiedAt ?? ''))).toBe(false);
    });

    it('copies the fields instead of keeping a reference', () => {
        const fields = { a: 'x' };
        const record = manager.create('fields', fields);
        fields.a = 'changed';
        expect(record.fields.a).toBe('x');
    });

    it('rejects values that are not string, number, boolean or null', () => {
        expect(() => manager.create('fields', { a: { b: 1 } as never })).toThrow(/Field a/);
        expect(() => manager.create('fields', { a: NaN })).toThrow(/Field a/);
        expect(() => manager.create('fields', null as never)).toThrow();
    });

    it('rejects an invalid type name, the table type, and prototype keys', () => {
        expect(() => manager.create('Bad Type', {})).toThrow(/Invalid record type/);
        expect(() => manager.create('table', {})).toThrow(/fromTable/);
        expect(() => manager.create('fields', JSON.parse('{"__proto__":"x"}'))).toThrow(/not allowed/);
    });

    it('never puts a password or a card number in a record', () => {
        const record = manager.create('fields', { name: 'Ada', password: 'x', 'cc-number': '4111', 'one-time-code': '1', 'current-password': 'p' });
        expect(Object.keys(record.fields)).toEqual(['name']);
    });

    it('keeps labels only for keys that exist', () => {
        const record = manager.create('fields', { a: '1' }, { labels: { a: 'A', gone: 'Gone' } });
        expect(record.labels).toEqual({ a: 'A' });
    });
});

describe('records.fromForm()', () => {
    const { manager } = makeManager();

    it('reads autocomplete, name and label based keys with their labels', () => {
        const page = setPage(`
            <form id="f">
              <label for="a">Company</label><input id="a" autocomplete="organization" value="Example SAS">
              <label for="b">E-mail</label><input id="b" name="contactEmail" type="email" value="ada@example.com">
              <label for="c">Prénom</label><input id="c" value="Ada">
              <label for="d">Customer code</label><input id="d" name="customer_code" value="C-42">
            </form>`);
        const record = manager.fromForm(page);
        expect(record.type).toBe('fields');
        expect(record.fields).toEqual({
            'organization': 'Example SAS',
            'email': 'ada@example.com',
            'given-name': 'Ada',
            'customer-code': 'C-42'
        });
        expect(record.labels).toMatchObject({ organization: 'Company', 'customer-code': 'Customer code' });
    });

    it('reads checkboxes as booleans, numbers as numbers and selects as their text', () => {
        const page = setPage(`
            <form>
              <input id="vat" name="vat-registered" type="checkbox" checked>
              <input id="opt" name="newsletter" type="checkbox">
              <input id="n" name="employees" type="number" value="12">
              <select id="c" name="country-name"><option value="">Choose</option><option value="FR" selected>France</option><option value="DE">Germany</option></select>
              <textarea id="t" name="notes"> Hello </textarea>
            </form>`);
        const record = manager.fromForm(page, { includeEmpty: true });
        expect(record.fields['vat-registered']).toBe(true);
        expect(record.fields.newsletter).toBe(false);
        expect(record.fields.employees).toBe(12);
        expect(record.fields['country-name']).toBe('France');
        expect(record.fields.notes).toBe('Hello');
    });

    it('skips empty fields unless includeEmpty is set', () => {
        const page = setPage('<form><input name="a" value="x"><input name="b" value=""></form>');
        expect(Object.keys(manager.fromForm(page).fields)).toEqual(['a']);
        expect(manager.fromForm(page, { includeEmpty: true }).fields).toEqual({ a: 'x', b: null });
    });

    it('skips password, one-time-code and cc-* fields, whatever their name', () => {
        const page = setPage(`
            <form>
              <input name="reference" value="ada">
              <input name="pwd" type="password" value="secret">
              <input name="newpass" autocomplete="new-password" value="secret2">
              <input name="otp" autocomplete="one-time-code" value="123456">
              <input name="card" autocomplete="cc-number" value="4111111111111111">
              <input name="cvc" autocomplete="section-pay cc-csc" value="123">
              <input name="exp" autocomplete="cc-exp" value="12/30">
            </form>`);
        const record = manager.fromForm(page);
        expect(record.fields).toEqual({ reference: 'ada' });
        expect(JSON.stringify(record)).not.toMatch(/secret|123456|4111|12\/30/);
    });

    it('drops redacted keys', () => {
        const page = setPage('<form><input name="a" value="1"><input name="b" value="2"></form>');
        expect(manager.fromForm(page, { redact: ['b'] }).fields).toEqual({ a: '1' });
    });

    it('sets the type and keeps keys unique', () => {
        const page = setPage('<form><input id="x1" autocomplete="email" value="a@a.fr"><input id="x2" autocomplete="email" value="b@b.fr"></form>');
        const record = manager.fromForm(page, { type: 'contact' });
        expect(record.type).toBe('contact');
        expect(record.fields).toEqual({ 'email': 'a@a.fr', 'email-2': 'b@b.fr' });
    });

    it('reads a radio group as the checked value', () => {
        const page = setPage('<form><input type="radio" name="size" value="s"><input type="radio" name="size" value="m" checked></form>');
        expect(manager.fromForm(page).fields.size).toBe('m');
    });

    it('ignores buttons, hidden and file inputs', () => {
        const page = setPage('<form><input type="hidden" name="h" value="1"><input type="submit" value="Go"><input type="file" name="f"><input name="a" value="1"></form>');
        expect(manager.fromForm(page).fields).toEqual({ a: '1' });
    });

    it('sets the source', () => {
        const page = setPage('<form><input name="a" value="1"></form>');
        expect(manager.fromForm(page).source?.origin).toBe(window.location.origin);
    });
});

describe('records.fromTable()', () => {
    const { manager } = makeManager();

    it('builds a table record from headers and rows', () => {
        const page = setPage(`
            <table id="t"><thead><tr><th>Name</th><th>Qty</th></tr></thead>
            <tbody><tr><td>Bolt</td><td>10</td></tr><tr><td>Nut</td><td>20</td></tr></tbody></table>`);
        const record = manager.fromTable(byId<HTMLTableElement>('t'));
        expect(record).toMatchObject({ agentlet: 'record', version: 1, type: 'table', columns: ['Name', 'Qty'], rows: [['Bolt', '10'], ['Nut', '20']] });
        expect(record.source?.origin).toBe(window.location.origin);
        expect(page).toBeTruthy();
    });

    it('forwards table options such as excludeColumns', () => {
        setPage('<table id="t"><thead><tr><th>A</th><th>Actions</th></tr></thead><tbody><tr><td>1</td><td>edit</td></tr></tbody></table>');
        const record = manager.fromTable(byId<HTMLTableElement>('t'), { excludeColumns: ['Actions'] });
        expect(record.columns).toEqual(['A']);
        expect(record.rows).toEqual([['1']]);
    });

    it('names the columns when the table has no header row', () => {
        setPage('<table id="t"><tbody><tr><td>1</td><td>2</td></tr></tbody></table>');
        const record = manager.fromTable(byId<HTMLTableElement>('t'), { includeHeaderRow: false });
        expect(record.columns).toEqual(['Column 1', 'Column 2']);
    });

    it('throws for something that is not a table', () => {
        setPage('<div id="d"></div>');
        expect(() => manager.fromTable(byId<HTMLTableElement>('d'))).toThrow();
    });
});

describe('records.fromElement()', () => {
    const { manager } = makeManager();

    it('turns a table into a table record', () => {
        setPage('<table id="t"><tr><th>A</th></tr><tr><td>1</td></tr></table>');
        const record = recordOf(manager.fromElement(byId('t'))) as TableRecord;
        expect(record.type).toBe('table');
        expect(record.columns).toEqual(['A']);
    });

    it('finds the only table inside a wrapper', () => {
        setPage('<div id="w"><h2>Prices</h2><table><tr><th>A</th></tr><tr><td>1</td></tr></table></div>');
        expect(recordOf(manager.fromElement(byId('w'))).type).toBe('table');
    });

    it('turns a form into a fields record', () => {
        setPage('<form id="f"><input name="email" value="a@b.fr"></form>');
        const record = fieldsOf(manager.fromElement(byId('f')));
        expect(record.fields).toEqual({ email: 'a@b.fr' });
    });

    it('reads a definition list, also with wrapped pairs', () => {
        setPage(`<dl id="d"><dt>Raison sociale</dt><dd>Example SAS</dd><dt>SIREN</dt><dd>123456789</dd></dl>
                 <dl id="w"><div><dt>Courriel</dt><dd>contact@example.com</dd></div><div><dt>Ville</dt><dd>Paris</dd></div></dl>`);
        const first = fieldsOf(manager.fromElement(byId('d')));
        expect(first.fields).toEqual({ organization: 'Example SAS', siren: '123456789' });
        expect(first.labels).toEqual({ organization: 'Raison sociale', siren: 'SIREN' });
        const wrapped = fieldsOf(manager.fromElement(byId('w')));
        expect(wrapped.fields).toEqual({ email: 'contact@example.com', 'address-level2': 'Paris' });
    });

    it('reads a definition list found inside a card', () => {
        setPage('<section id="c"><h1>Example SAS</h1><dl><dt>Phone</dt><dd>+33 1 02 03 04 05</dd></dl></section>');
        expect(fieldsOf(manager.fromElement(byId('c'))).fields).toEqual({ tel: '+33 1 02 03 04 05' });
    });

    it('reads label and value pairs laid out as sibling elements', () => {
        setPage(`<div id="card">
            <div class="row"><span class="l">Company</span><span class="v">Example SAS</span></div>
            <div class="row"><span class="l">City</span><span class="v">Paris</span></div>
            <div class="row"><span class="l">SIREN</span><span class="v">123 456 789</span></div>
        </div>`);
        const record = fieldsOf(manager.fromElement(byId('card')));
        expect(record.fields).toEqual({ organization: 'Example SAS', 'address-level2': 'Paris', siren: '123 456 789' });
    });

    it('reads "Label: value" text and bold labels', () => {
        setPage(`<div id="card">
            <p><strong>Company:</strong> Example SAS</p>
            <p>City: Paris</p>
            <p>Just a sentence with no pair</p>
        </div>`);
        const record = fieldsOf(manager.fromElement(byId('card')));
        expect(record.fields).toEqual({ organization: 'Example SAS', 'address-level2': 'Paris' });
    });

    it('does not read a card with two rows as one pair', () => {
        setPage(`<div id="card">
            <div><span>Company</span><span>Example SAS</span></div>
            <div><span>City</span><span>Paris</span></div>
        </div>`);
        expect(Object.keys(fieldsOf(manager.fromElement(byId('card'))).fields)).toEqual(['organization', 'address-level2']);
    });

    it('applies the type and redact options to pairs', () => {
        setPage('<dl id="d"><dt>Name</dt><dd>Ada</dd><dt>Secret code</dt><dd>1234</dd></dl>');
        const record = fieldsOf(manager.fromElement(byId('d'), { type: 'contact', redact: ['secret-code'] }));
        expect(record.type).toBe('contact');
        expect(record.fields).toEqual({ name: 'Ada' });
    });

    it('returns null when nothing looks like a record', () => {
        setPage('<div id="x"><p>Hello</p><p>World, with a very long sentence that is not a label at all, really not one</p><p>Third</p></div>');
        expect(manager.fromElement(byId('x'))).toBeNull();
        setPage('<div id="y"></div>');
        expect(manager.fromElement(byId('y'))).toBeNull();
    });

    it('ignores script and style content', () => {
        setPage('<div id="x"><script>var a = "Key: value";</script><style>.a{color:red}</style></div>');
        expect(manager.fromElement(byId('x'))).toBeNull();
    });
});

describe('records.pick()', () => {
    function fakeSelector() {
        let callback: ((element: Element) => void) | null = null;
        const selector = {
            isActive: false,
            start: jest.fn((cb: (element: Element) => void) => { callback = cb; selector.isActive = true; }),
            stop: jest.fn()
        };
        return { selector: selector as unknown as ElementSelectorAPI, pickElement: (element: Element) => callback?.(element), start: selector.start };
    }

    it('starts click-to-select and resolves with the record of the clicked element', async () => {
        const { selector, pickElement, start } = fakeSelector();
        const { manager } = makeManager({ getUtils: () => ({ ElementSelector: selector }) });
        setPage('<dl id="d"><dt>Name</dt><dd>Ada</dd></dl>');
        const promise = manager.pick({ selector: 'dl', message: 'Pick it' });
        expect(start).toHaveBeenCalledWith(expect.any(Function), { selector: 'dl', message: 'Pick it' });
        pickElement(byId('d'));
        const record = fieldsOf(await promise);
        expect(record.fields).toEqual({ name: 'Ada' });
    });

    it('resolves null on Escape', async () => {
        const { selector } = fakeSelector();
        const { manager } = makeManager({ getUtils: () => ({ ElementSelector: selector }) });
        const promise = manager.pick();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await expect(promise).resolves.toBeNull();
    });

    it('resolves null when the clicked element holds nothing usable', async () => {
        const { selector, pickElement } = fakeSelector();
        const { manager } = makeManager({ getUtils: () => ({ ElementSelector: selector }) });
        setPage('<div id="x"></div>');
        const promise = manager.pick();
        pickElement(byId('x'));
        await expect(promise).resolves.toBeNull();
    });

    it('rejects when selection is already active or the selector is missing', async () => {
        const { selector } = fakeSelector();
        (selector as unknown as { isActive: boolean }).isActive = true;
        await expect(makeManager({ getUtils: () => ({ ElementSelector: selector }) }).manager.pick()).rejects.toThrow(/already active/);
        await expect(makeManager({ getUtils: () => null }).manager.pick()).rejects.toThrow(/not available/);
    });
});
