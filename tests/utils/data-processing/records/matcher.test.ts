/**
 * Tests for `records.match()`: each signal and its confidence, the type
 * veto, selects, checkboxes, French labels, and the sensitive-field rule.
 */
import type { RecordFieldMapping } from '../../../../src/types/public-api';
import { fieldsRecord, installRealDom, makeManager, setPage, uninstallLayout } from './helpers.js';

beforeAll(installRealDom);
afterAll(uninstallLayout);
afterEach(() => { document.body.innerHTML = ''; });

const { manager } = makeManager();

function entry(mapping: RecordFieldMapping, key: string) {
    return mapping.entries.find(item => item.key === key);
}

describe('records.match() signals', () => {
    it('matches the autocomplete attribute at 0.95', () => {
        const form = setPage('<form><input id="x" name="zzz" autocomplete="organization"></form>');
        const mapping = manager.match(fieldsRecord('organization', { organization: 'Example SAS' }), form);
        expect(entry(mapping, 'organization')).toEqual({ key: 'organization', selector: '#x', confidence: 0.95, reason: 'autocomplete' });
    });

    it('matches a multi-token autocomplete attribute', () => {
        const form = setPage('<form><input id="x" name="zzz" autocomplete="section-ship shipping postal-code"></form>');
        const mapping = manager.match(fieldsRecord('address', { 'postal-code': '75001' }), form);
        expect(entry(mapping, 'postal-code')).toMatchObject({ selector: '#x', confidence: 0.95, reason: 'autocomplete' });
    });

    it('matches name or id after normalization at 0.85', () => {
        const form = setPage(`<form>
            <input id="a" name="postalCode">
            <input id="b" name="street_address">
            <input id="Given-Name">
        </form>`);
        const mapping = manager.match(fieldsRecord('address', { 'postal-code': '75001', 'street-address': '1 rue Exemple', 'given-name': 'Ada' }), form);
        expect(entry(mapping, 'postal-code')).toMatchObject({ selector: '#a', confidence: 0.85, reason: 'name' });
        expect(entry(mapping, 'street-address')).toMatchObject({ selector: '#b', confidence: 0.85, reason: 'name' });
        expect(entry(mapping, 'given-name')).toMatchObject({ selector: '#Given-Name', confidence: 0.85, reason: 'name' });
    });

    it('matches a name that is a known synonym at 0.8', () => {
        const form = setPage('<form><input id="a" name="raison_sociale"><input id="b" name="code_postal"></form>');
        const mapping = manager.match(fieldsRecord('fields', { 'organization': 'Example SAS', 'postal-code': '75001' }), form);
        expect(entry(mapping, 'organization')).toMatchObject({ selector: '#a', confidence: 0.8, reason: 'name' });
        expect(entry(mapping, 'postal-code')).toMatchObject({ selector: '#b', confidence: 0.8, reason: 'name' });
    });

    it('matches the label at 0.75, ignoring case, accents and the required marker', () => {
        const form = setPage(`<form>
            <label for="a">Company name *</label><input id="a" name="f1">
            <label for="b">PRÉNOM :</label><input id="b" name="f2">
        </form>`);
        const mapping = manager.match(fieldsRecord('contact', { organization: 'Example SAS', 'given-name': 'Ada' }), form);
        expect(entry(mapping, 'organization')).toMatchObject({ selector: '#a', confidence: 0.75, reason: 'label' });
        expect(entry(mapping, 'given-name')).toMatchObject({ selector: '#b', confidence: 0.75, reason: 'label' });
    });

    it('matches French labels', () => {
        const form = setPage(`<form>
            <label for="a">Raison sociale</label><input id="a" name="f1">
            <label for="b">Courriel</label><input id="b" name="f2" type="text">
            <label for="c">Code postal</label><input id="c" name="f3">
            <label for="d">Téléphone</label><input id="d" name="f4">
            <label for="e">Ville</label><input id="e" name="f5">
            <label for="f">Pays</label><input id="f" name="f6">
        </form>`);
        const mapping = manager.match(fieldsRecord('fields', {
            'organization': 'Example SAS', 'email': 'contact@example.com', 'postal-code': '75001',
            'tel': '+33 1 02 03 04 05', 'address-level2': 'Paris', 'country-name': 'France'
        }), form);
        expect(mapping.entries.map(item => [item.key, item.selector, item.reason])).toEqual([
            ['organization', '#a', 'label'], ['email', '#b', 'label'], ['postal-code', '#c', 'label'],
            ['tel', '#d', 'label'], ['address-level2', '#e', 'label'], ['country-name', '#f', 'label']
        ]);
    });

    it('matches the wrapping label, without the text of the control inside it', () => {
        const form = setPage('<form><label>Pays <select id="c" name="f"><option value="">-</option><option value="FR">France</option></select></label></form>');
        const mapping = manager.match(fieldsRecord('fields', { 'country-name': 'France' }), form);
        expect(entry(mapping, 'country-name')).toMatchObject({ selector: '#c', reason: 'label' });
    });

    it('matches aria-label and placeholder', () => {
        const form = setPage('<form><input id="a" name="f1" aria-label="Email address"><input id="b" name="f2" placeholder="Ville"></form>');
        const mapping = manager.match(fieldsRecord('fields', { email: 'a@b.fr', 'address-level2': 'Lyon' }), form);
        expect(entry(mapping, 'email')).toMatchObject({ selector: '#a', confidence: 0.75, reason: 'label' });
        expect(entry(mapping, 'address-level2')).toMatchObject({ selector: '#b', confidence: 0.75, reason: 'label' });
    });

    it('uses the record labels, and the labels and synonyms of a custom type', () => {
        manager.defineType({ name: 'invoice', fields: [{ key: 'invoice-number', label: 'Invoice number' }, { key: 'issue-date', kind: 'date', synonyms: ['date de facture'] }] });
        const form = setPage(`<form>
            <label for="a">N° de facture</label><input id="a" name="f1">
            <label for="b">Date de facture</label><input id="b" name="f2" type="date">
            <label for="c">SIREN</label><input id="c" name="f3">
        </form>`);
        const record = fieldsRecord('invoice', { 'invoice-number': 'F-1', 'issue-date': '2026-10-01', 'siren': '123456789' }, { labels: { 'invoice-number': 'N° de facture', siren: 'SIREN' } });
        const mapping = manager.match(record, form);
        expect(entry(mapping, 'invoice-number')).toMatchObject({ selector: '#a', reason: 'label' });
        expect(entry(mapping, 'issue-date')).toMatchObject({ selector: '#b', reason: 'label' });
        expect(entry(mapping, 'siren')).toMatchObject({ selector: '#c', reason: 'label' });
    });

    it('falls back on a lone field of the matching input type at 0.6', () => {
        const form = setPage('<form><input id="a" name="contact" type="email"><input id="b" name="other"></form>');
        const mapping = manager.match(fieldsRecord('fields', { email: 'a@b.fr' }), form);
        expect(entry(mapping, 'email')).toEqual({ key: 'email', selector: '#a', confidence: 0.6, reason: 'type' });
    });

    it('does not use the type signal when it would be ambiguous', () => {
        const form = setPage('<form><input id="a" name="p" type="email"><input id="b" name="q" type="email"></form>');
        const mapping = manager.match(fieldsRecord('fields', { email: 'a@b.fr' }), form);
        expect(mapping.entries).toEqual([]);
        expect(mapping.unmatchedKeys).toEqual(['email']);
    });

    it('ranks signals: autocomplete beats name beats label', () => {
        const form = setPage(`<form>
            <label for="l">Email</label><input id="l" name="f1" type="text">
            <input id="n" name="email" type="text">
            <input id="a" name="f3" autocomplete="email" type="text">
        </form>`);
        expect(entry(manager.match(fieldsRecord('fields', { email: 'a@b.fr' }), form), 'email')).toMatchObject({ selector: '#a', reason: 'autocomplete' });
        document.getElementById('a')?.remove();
        expect(entry(manager.match(fieldsRecord('fields', { email: 'a@b.fr' }), form), 'email')).toMatchObject({ selector: '#n', reason: 'name' });
        document.getElementById('n')?.remove();
        expect(entry(manager.match(fieldsRecord('fields', { email: 'a@b.fr' }), form), 'email')).toMatchObject({ selector: '#l', reason: 'label' });
    });

    it('gives each target field to one record field, highest score first', () => {
        const form = setPage('<form><input id="only" name="name"></form>');
        const mapping = manager.match(fieldsRecord('fields', { 'family-name': 'Lovelace', 'name': 'Ada Lovelace' }), form);
        expect(mapping.entries).toHaveLength(1);
        expect(mapping.entries[0]).toMatchObject({ key: 'name', reason: 'name', confidence: 0.85 });
        expect(mapping.unmatchedKeys).toEqual(['family-name']);
    });

    it('reports unmatched record keys and unmatched target fields', () => {
        const form = setPage('<form><input id="a" name="email"><input id="b" name="whatever"></form>');
        const mapping = manager.match(fieldsRecord('fields', { email: 'a@b.fr', siren: '123' }), form);
        expect(mapping.target).toBe(form);
        expect(mapping.unmatchedKeys).toEqual(['siren']);
        expect(mapping.unmatchedFields).toEqual(['#b']);
    });

    it('leaves empty and null values out of the mapping', () => {
        const form = setPage('<form><input id="a" name="email"><input id="b" name="tel"></form>');
        const mapping = manager.match(fieldsRecord('fields', { email: null, tel: '' }), form);
        expect(mapping.entries).toEqual([]);
        expect(mapping.unmatchedKeys).toEqual([]);
    });

    it('moves entries below minConfidence to unmatchedKeys', () => {
        const form = setPage('<form><label for="a">Ville</label><input id="a" name="x"></form>');
        const record = fieldsRecord('fields', { 'address-level2': 'Paris' });
        expect(manager.match(record, form).entries).toHaveLength(1);
        const strict = manager.match(record, form, { minConfidence: 0.9 });
        expect(strict.entries).toEqual([]);
        expect(strict.unmatchedKeys).toEqual(['address-level2']);
        expect(strict.unmatchedFields).toEqual(['#a']);
    });

    it('computes selectors on the target and never takes one from the record', () => {
        const form = setPage('<form><input id="real" name="email"></form>');
        const hostile = fieldsRecord('fields', { email: 'a@b.fr' }, { labels: { email: '#evil' } });
        (hostile as unknown as Record<string, unknown>).selector = '#evil';
        (hostile as unknown as Record<string, unknown>).selectors = { email: 'body' };
        const mapping = manager.match(hostile, form);
        expect(mapping.entries.map(item => item.selector)).toEqual(['#real']);
    });

    it('throws for a table record', () => {
        const form = setPage('<form></form>');
        expect(() => manager.match({ agentlet: 'record', version: 1, type: 'table', columns: [], rows: [] }, form)).toThrow(/table/);
    });
});

describe('type veto', () => {
    it('never puts a number into an email input', () => {
        const form = setPage('<form><input id="a" name="email" type="email"></form>');
        const mapping = manager.match(fieldsRecord('fields', { email: 42 }), form);
        expect(mapping.entries).toEqual([]);
        expect(mapping.unmatchedKeys).toEqual(['email']);
    });

    it('rejects text that is not an email, a url, a phone number, a number or a date for those inputs', () => {
        const form = setPage(`<form>
            <input id="e" name="email" type="email"><input id="u" name="url" type="url"><input id="t" name="tel" type="tel">
            <input id="n" name="amount" type="number"><input id="d" name="birthday" type="date">
        </form>`);
        const bad = manager.match(fieldsRecord('fields', { email: 'not an email', url: 'nope', tel: 'abc', amount: 'many', birthday: 'soon' }), form);
        expect(bad.entries).toEqual([]);
        const good = manager.match(fieldsRecord('fields', { email: 'a@b.fr', url: 'https://example.com', tel: '+33 1 02 03 04 05', amount: '1 234,50', birthday: '14/07/1990' }), form);
        expect(good.entries.map(item => item.key)).toEqual(['email', 'url', 'tel', 'amount', 'birthday']);
    });

    it('lets a value that fails the veto take the next best field', () => {
        const form = setPage('<form><input id="m" name="email" type="email"><input id="t" name="email_note" type="text" autocomplete="email"></form>');
        const mapping = manager.match(fieldsRecord('fields', { email: 'not an email' }), form);
        expect(mapping.entries).toEqual([expect.objectContaining({ selector: '#t', reason: 'autocomplete' })]);
    });
});

describe('selects', () => {
    const select = `<form><select id="c" name="country"><option value="">Choose</option><option value="FR">France</option><option value="DE">Germany</option><option value="IT" disabled>Italy</option></select></form>`;

    it('matches an option by value first', () => {
        const form = setPage(select);
        const mapping = manager.match(fieldsRecord('fields', { 'country-name': 'DE' }), form);
        expect(entry(mapping, 'country-name')).toMatchObject({ selector: '#c', reason: 'name' });
    });

    it('matches an option by text, ignoring case and accents', () => {
        const form = setPage(select);
        expect(entry(manager.match(fieldsRecord('fields', { 'country-name': 'FRANCE' }), form), 'country-name')).toBeDefined();
        setPage(select.replace('France', 'Éire'));
        expect(entry(manager.match(fieldsRecord('fields', { 'country-name': 'eire' }), document.body), 'country-name')).toBeDefined();
    });

    it('does not match a value that is not an option, or a disabled option', () => {
        const form = setPage(select);
        expect(manager.match(fieldsRecord('fields', { 'country-name': 'Spain' }), form).entries).toEqual([]);
        expect(manager.match(fieldsRecord('fields', { 'country-name': 'Italy' }), form).entries).toEqual([]);
    });
});

describe('checkboxes', () => {
    const page = '<form><input id="c" type="checkbox" name="vat-registered"></form>';

    it.each([true, 1, 'yes', 'true', '1', 'oui', 'Oui', false, 0, 'no', 'non'])('takes the value %p', (value) => {
        const form = setPage(page);
        expect(entry(manager.match(fieldsRecord('fields', { 'vat-registered': value }), form), 'vat-registered')).toMatchObject({ selector: '#c' });
    });

    it.each(['maybe', 'perhaps', 7])('refuses the value %p', (value) => {
        const form = setPage(page);
        expect(manager.match(fieldsRecord('fields', { 'vat-registered': value }), form).entries).toEqual([]);
    });
});

describe('sensitive fields on the target', () => {
    it('never offers a password, one-time-code or cc-* field, whatever the record says', () => {
        const form = setPage(`<form>
            <input id="p" name="password" type="password">
            <input id="o" name="code" autocomplete="one-time-code">
            <input id="c" name="card" autocomplete="cc-number">
            <input id="x" name="cvc" autocomplete="section-b cc-csc">
            <input id="ok" name="login">
        </form>`);
        const mapping = manager.match(fieldsRecord('fields', {
            'password': 'p', 'one-time-code': '1', 'cc-number': '4111', 'code': '1', 'card': '4111', 'cvc': '123', 'login': 'ada'
        }), form);
        expect(mapping.entries.map(item => item.selector)).toEqual(['#ok']);
        expect(mapping.unmatchedFields).toEqual([]);
        expect(mapping.unmatchedKeys).toEqual(['code', 'card', 'cvc']);
    });

    it('does not offer a record key that is sensitive', () => {
        const form = setPage('<form><input id="a" name="password" type="text"></form>');
        const mapping = manager.match(fieldsRecord('fields', { password: 'secret', 'cc-number': '4111' }), form);
        expect(mapping.entries).toEqual([]);
        expect(mapping.unmatchedKeys).toEqual([]);
    });
});

describe('fields that cannot be addressed', () => {
    it('skips buttons, hidden inputs, radios and fields with an ambiguous selector', () => {
        const form = setPage(`<form>
            <input type="hidden" name="email" value="x"><input type="submit" name="tel" value="Go">
            <input type="radio" name="name" value="a">
            <input type="text" class="dup"><input type="text" class="dup">
        </form>`);
        const mapping = manager.match(fieldsRecord('fields', { email: 'a@b.fr', tel: '+33 1 02 03 04 05', name: 'Ada' }), form);
        expect(mapping.entries).toEqual([]);
        expect(mapping.unmatchedFields).toEqual([]);
    });

    it('works when the target is a single input', () => {
        setPage('<input id="solo" name="email">');
        const mapping = manager.match(fieldsRecord('fields', { email: 'a@b.fr' }), document.getElementById('solo') as HTMLElement);
        expect(mapping.entries).toHaveLength(1);
    });
});
