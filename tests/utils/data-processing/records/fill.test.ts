/**
 * Tests for `records.fill()` (with and without the preview, cancelled
 * previews, the sensitive-data rule on fill), mapping memory, and
 * `pasteFromClipboard()`.
 */
import type { StorageManagerAPI } from '../../../../src/types/public-api';
import { MAPPING_STORAGE_KEY } from '../../../../src/utils/data-processing/records/mappingMemory.js';
import {
    byId, clickDialogButton, fieldsRecord, FakeClipboardItem, installClipboard, installRealDom, makeManager, removeClipboard,
    setPage, uninstallLayout
} from './helpers.js';
import { toBase64Url } from '../../../../src/utils/data-processing/records/text.js';

beforeAll(installRealDom);
afterAll(uninstallLayout);
beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { document.body.innerHTML = ''; });

const supplierForm = `
<form id="supplier" action="/suppliers/new">
  <label for="co">Raison sociale</label><input id="co" name="f_company">
  <label for="mail">Courriel</label><input id="mail" name="f_mail" type="email">
  <label for="zip">Code postal</label><input id="zip" name="f_zip">
  <label for="country">Pays</label>
  <select id="country" name="f_country"><option value="">Choose</option><option value="FR">France</option><option value="DE">Germany</option></select>
  <label for="vat"><input id="vat" type="checkbox" name="f_vat"> Assujetti a la TVA</label>
  <input id="since" name="founded" type="date">
  <input id="staff" name="employees" type="number">
  <input type="submit" value="Save">
</form>`;

const organization = () => fieldsRecord('organization', {
    'organization': 'Example SAS',
    'email': 'contact@example.com',
    'postal-code': '75001',
    'country-name': 'France',
    'siren': '123456789'
}, { source: { url: 'https://registry.example/e/1', origin: 'https://registry.example', title: 'Example SAS', copiedAt: new Date().toISOString() } });

describe('records.fill() without preview', () => {
    it('fills the matched fields through FormFiller and reports the result', async () => {
        const form = setPage(supplierForm);
        const { manager, deps } = makeManager();
        const fillForm = jest.spyOn(deps.formFiller, 'fillForm');
        const result = await manager.fill(organization(), form, { preview: false });

        expect(result.confirmed).toBe(true);
        expect(byId('co').value).toBe('Example SAS');
        expect(byId('mail').value).toBe('contact@example.com');
        expect(byId('zip').value).toBe('75001');
        expect(byId<HTMLSelectElement>('country').value).toBe('FR');
        expect(result.total).toBe(4);
        expect(result.successful).toBe(4);
        expect(result.failed).toBe(0);
        expect(fillForm).toHaveBeenCalledTimes(1);
        expect(fillForm.mock.calls[0][0]).toBe(form);
        expect(result.mapping.entries.map(entry => entry.key)).toEqual(['organization', 'email', 'postal-code', 'country-name']);
        expect(result.mapping.unmatchedKeys).toEqual(['siren']);
    });

    it('never submits the form', async () => {
        const form = setPage(supplierForm) as HTMLElement;
        const submit = jest.fn((event: Event) => event.preventDefault());
        form.querySelector('form')?.addEventListener('submit', submit);
        const { manager } = makeManager();
        await manager.fill(organization(), form, { preview: false });
        expect(submit).not.toHaveBeenCalled();
    });

    it('converts values to what each field takes', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        await manager.fill(fieldsRecord('fields', { 'f-vat': 'oui', founded: '14/07/1990', employees: '1 234', 'country-name': 'germany' }, { labels: { 'f-vat': 'Assujetti a la TVA' } }), form, { preview: false });
        expect(byId('vat').checked).toBe(true);
        expect(byId('since').value).toBe('1990-07-14');
        expect(byId('staff').value).toBe('1234');
        expect(byId<HTMLSelectElement>('country').value).toBe('DE');
    });

    it('forwards options to forms.fill()', async () => {
        const form = setPage(supplierForm);
        const { manager, deps } = makeManager();
        const fillForm = jest.spyOn(deps.formFiller, 'fillForm');
        await manager.fill(organization(), form, { preview: false, fill: { triggerEvents: false } });
        expect(fillForm.mock.calls[0][2]).toEqual({ triggerEvents: false });
    });

    it('skips entries below minConfidence', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const result = await manager.fill(organization(), form, { preview: false, minConfidence: 0.9 });
        expect(result.total).toBe(0);
        expect(byId('co').value).toBe('');
        expect(result.mapping.unmatchedKeys).toContain('organization');
    });

    it('rejects a table record', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        await expect(manager.fill({ agentlet: 'record', version: 1, type: 'table', columns: ['a'], rows: [] }, form, { preview: false })).rejects.toThrow(/table/);
    });

    it('emits records:filled with counts and no values', async () => {
        const form = setPage(supplierForm);
        const { manager, emit } = makeManager();
        await manager.fill(organization(), form, { preview: false });
        expect(emit).toHaveBeenCalledWith('records:filled', {
            type: 'organization', fieldCount: 4, itemCount: 1, sourceOrigin: 'https://registry.example'
        });
        expect(JSON.stringify(emit.mock.calls)).not.toMatch(/Example SAS|contact@example|75001|123456789/);
    });
});

describe('sensitive data on fill', () => {
    it('never fills a password, one-time-code or cc-* field', async () => {
        const form = setPage(`<form>
            <input id="pw" name="password" type="password">
            <input id="otp" name="otp" autocomplete="one-time-code">
            <input id="card" name="card" autocomplete="cc-number">
            <input id="csc" name="cvc" autocomplete="cc-csc">
            <input id="who" name="reference">
        </form>`);
        const { manager } = makeManager();
        const result = await manager.fill(fieldsRecord('fields', {
            'password': 'secret', 'one-time-code': '123456', 'cc-number': '4111111111111111', 'cc-csc': '123', 'otp': '654321', 'card': '4242', 'cvc': '999', 'reference': 'R-1'
        }), form, { preview: false });
        expect(byId('pw').value).toBe('');
        expect(byId('otp').value).toBe('');
        expect(byId('card').value).toBe('');
        expect(byId('csc').value).toBe('');
        expect(byId('who').value).toBe('R-1');
        expect(result.successful).toBe(1);
        expect(result.mapping.entries.map(entry => entry.key)).toEqual(['reference']);
    });

    it('does not offer a sensitive field in the preview either', async () => {
        const form = setPage('<form><input id="pw" name="password" type="password"><input id="a" name="reference"></form>');
        const { manager } = makeManager();
        const pending = manager.fill(fieldsRecord('fields', { reference: 'R-1' }), form);
        const options = Array.from(document.querySelectorAll('.agentlet-records-preview option')).map(option => option.textContent);
        expect(options).toContain('reference');
        expect(options).not.toContain('password');
        clickDialogButton('Cancel');
        await pending;
    });
});

describe('the preview dialog', () => {
    it('shows the source, one row per field and the unmatched fields, and fills on Fill', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const pending = manager.fill(organization(), form);

        const preview = document.querySelector('.agentlet-records-preview') as HTMLElement;
        expect(preview).not.toBeNull();
        expect(preview.textContent).toContain('https://registry.example');
        expect(preview.textContent).toContain('Example SAS');
        expect(preview.textContent).toContain('just now');
        expect(preview.textContent).toContain('Not matched');
        expect(preview.textContent).toContain('123456789');
        expect(preview.textContent).toContain('does not submit');
        const rows = preview.querySelectorAll('select[data-agentlet-record-key]');
        expect(rows).toHaveLength(5);
        const orgSelect = preview.querySelector('select[data-agentlet-record-key="organization"]') as HTMLSelectElement;
        expect(orgSelect.value).toBe('#co');
        expect(preview.textContent).toContain('By label, 75%');
        // Nothing is filled before the user confirms.
        expect(byId('co').value).toBe('');

        clickDialogButton('Fill');
        const result = await pending;
        expect(result.confirmed).toBe(true);
        expect(byId('co').value).toBe('Example SAS');
        expect(result.successful).toBe(4);
    });

    it('fills nothing when the preview is cancelled', async () => {
        const form = setPage(supplierForm);
        const { manager, deps, emit } = makeManager();
        const fillForm = jest.spyOn(deps.formFiller, 'fillForm');
        const pending = manager.fill(organization(), form);
        clickDialogButton('Cancel');
        const result = await pending;
        expect(result.confirmed).toBe(false);
        expect(result.total).toBe(0);
        expect(result.successful).toBe(0);
        expect(fillForm).not.toHaveBeenCalled();
        expect(byId('co').value).toBe('');
        expect(emit).not.toHaveBeenCalledWith('records:filled', expect.anything());
        expect(window.localStorage.getItem(MAPPING_STORAGE_KEY)).toBeNull();
    });

    it('treats closing the dialog as cancel', async () => {
        const form = setPage(supplierForm);
        const { manager, dialog } = makeManager();
        const pending = manager.fill(organization(), form);
        dialog.hide(null);
        expect((await pending).confirmed).toBe(false);
    });

    it('lets the user change a mapping, and fills the field they chose', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const pending = manager.fill(fieldsRecord('fields', { siren: '123456789' }), form);
        const select = document.querySelector('select[data-agentlet-record-key="siren"]') as HTMLSelectElement;
        expect(select.value).toBe('');
        select.value = '#zip';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        clickDialogButton('Fill');
        const result = await pending;
        expect(byId('zip').value).toBe('123456789');
        expect(result.mapping.entries).toEqual([{ key: 'siren', selector: '#zip', confidence: 1, reason: 'manual' }]);
    });

    it('lets the user unmap a field', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const pending = manager.fill(organization(), form);
        const select = document.querySelector('select[data-agentlet-record-key="postal-code"]') as HTMLSelectElement;
        select.value = '';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        clickDialogButton('Fill');
        await pending;
        expect(byId('zip').value).toBe('');
        expect(byId('co').value).toBe('Example SAS');
    });

    it('releases a target field that the user gives to another record field', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const pending = manager.fill(fieldsRecord('fields', { 'postal-code': '75001', 'siren': '123456789' }), form);
        const siren = document.querySelector('select[data-agentlet-record-key="siren"]') as HTMLSelectElement;
        siren.value = '#zip';
        siren.dispatchEvent(new Event('change', { bubbles: true }));
        const postal = document.querySelector('select[data-agentlet-record-key="postal-code"]') as HTMLSelectElement;
        expect(postal.value).toBe('');
        clickDialogButton('Fill');
        const result = await pending;
        expect(byId('zip').value).toBe('123456789');
        expect(result.mapping.entries.map(entry => entry.key)).toEqual(['siren']);
    });

    it('only offers target fields the value can go into', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const pending = manager.fill(fieldsRecord('fields', { siren: 'not-an-email' }), form);
        const options = Array.from(document.querySelectorAll('select[data-agentlet-record-key="siren"] option')).map(option => option.getAttribute('value'));
        expect(options).toContain('#zip');
        expect(options).not.toContain('#mail');
        expect(options).not.toContain('#staff');
        clickDialogButton('Cancel');
        await pending;
    });

    it('treats record data as text, never as markup', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const hostile = '<img src=x onerror="window.pwned=1"><script>window.pwned=1</script>';
        const pending = manager.fill(fieldsRecord('fields', { 'organization': hostile, '<b>x</b>': hostile }, {
            labels: { '<b>x</b>': '<i>label</i>' },
            source: { url: hostile, origin: hostile, title: hostile, copiedAt: 'x' }
        }), form);
        const preview = document.querySelector('.agentlet-records-preview') as HTMLElement;
        expect(preview.querySelector('img')).toBeNull();
        expect(preview.querySelector('script')).toBeNull();
        expect(preview.querySelector('i')).toBeNull();
        expect(preview.querySelector('b')).toBeNull();
        expect(preview.textContent).toContain(hostile.slice(0, 40));
        clickDialogButton('Cancel');
        await pending;
    });

    it('says so when the source is not stated', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const pending = manager.fill(fieldsRecord('fields', { organization: 'X' }), form);
        expect(document.querySelector('.agentlet-records-preview')?.textContent).toContain('not stated');
        clickDialogButton('Cancel');
        await pending;
    });

    it('rejects when another dialog is open, and when there is no Dialog', async () => {
        const form = setPage(supplierForm);
        const { manager, dialog } = makeManager();
        dialog.showInfo({ message: 'busy' }, jest.fn());
        await expect(manager.fill(organization(), form)).rejects.toThrow(/already open/);
        dialog.hide();
        const noDialog = makeManager({ getUtils: () => null }).manager;
        await expect(noDialog.fill(organization(), form)).rejects.toThrow(/Dialog is not available/);
    });

    it('leaves low-confidence suggestions for the user', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const pending = manager.fill(fieldsRecord('fields', { organization: 'Example SAS' }), form, { minConfidence: 0.9 });
        const select = document.querySelector('select[data-agentlet-record-key="organization"]') as HTMLSelectElement;
        expect(select.value).toBe('');
        expect(document.querySelector('.agentlet-records-preview')?.textContent).toContain('Suggested:');
        clickDialogButton('Fill');
        const result = await pending;
        expect(result.total).toBe(0);
        expect(byId('co').value).toBe('');
    });
});

describe('mapping memory', () => {
    const stored = () => JSON.parse(window.localStorage.getItem(MAPPING_STORAGE_KEY) ?? 'null');

    async function correct(manager: ReturnType<typeof makeManager>['manager'], key: string, selector: string) {
        const form = setPage(supplierForm);
        const pending = manager.fill(fieldsRecord('organization', { [key]: 'Value 1' }), form);
        const select = document.querySelector(`select[data-agentlet-record-key="${key}"]`) as HTMLSelectElement;
        select.value = selector;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        clickDialogButton('Fill');
        await pending;
        return form;
    }

    it('saves a correction on the target origin and applies it the next time at confidence 1', async () => {
        const { manager } = makeManager();
        const form = await correct(manager, 'siren', '#zip');
        const saved = stored();
        const [entry] = Object.values(saved) as Array<{ map: Record<string, string> }>;
        expect(entry.map).toEqual({ siren: '#zip' });
        expect(Object.keys(saved)[0].startsWith('organization:')).toBe(true);

        const mapping = manager.match(fieldsRecord('organization', { siren: '987654321' }), form);
        expect(mapping.entries).toEqual([{ key: 'siren', selector: '#zip', confidence: 1, reason: 'remembered' }]);
    });

    it('applies it when filling without a preview', async () => {
        const { manager } = makeManager();
        const form = await correct(manager, 'siren', '#zip');
        byId('zip').value = '';
        await manager.fill(fieldsRecord('organization', { siren: '555' }), form, { preview: false });
        expect(byId('zip').value).toBe('555');
    });

    it('keys memory by record type', async () => {
        const { manager } = makeManager();
        const form = await correct(manager, 'siren', '#zip');
        const other = manager.match(fieldsRecord('contact', { siren: '1' }), form);
        expect(other.entries).toEqual([]);
    });

    it('keys memory by form signature', async () => {
        const { manager } = makeManager();
        await correct(manager, 'siren', '#zip');
        const otherForm = setPage(supplierForm.replace('action="/suppliers/new"', 'action="/customers/new"'));
        expect(manager.match(fieldsRecord('organization', { siren: '1' }), otherForm).entries).toEqual([]);
        const changedFields = setPage(supplierForm.replace('name="f_zip"', 'name="f_zip2"'));
        expect(manager.match(fieldsRecord('organization', { siren: '1' }), changedFields).entries).toEqual([]);
    });

    it('does not save when nothing was corrected', async () => {
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const pending = manager.fill(organization(), form);
        clickDialogButton('Fill');
        await pending;
        expect(stored()).toBeNull();
    });

    it('does not read or write memory with remember: false', async () => {
        const { manager } = makeManager();
        const form = setPage(supplierForm);
        const pending = manager.fill(fieldsRecord('organization', { siren: 'v' }), form, { remember: false });
        const select = document.querySelector('select[data-agentlet-record-key="siren"]') as HTMLSelectElement;
        select.value = '#zip';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        clickDialogButton('Fill');
        await pending;
        expect(stored()).toBeNull();

        await correct(manager, 'siren', '#zip');
        expect(manager.match(fieldsRecord('organization', { siren: '1' }), form, { remember: false }).entries).toEqual([]);
    });

    it('ignores a remembered selector the form does not have', async () => {
        const { manager } = makeManager();
        const form = await correct(manager, 'siren', '#zip');
        byId('zip').remove();
        expect(manager.match(fieldsRecord('organization', { siren: '1' }), form).entries).toEqual([]);
    });

    it('never lets a remembered selector reach a sensitive field', async () => {
        const { manager } = makeManager();
        const form = setPage('<form action="/x"><input id="pw" type="password" name="pw"><input id="a" name="a"></form>');
        const probe = manager.match(fieldsRecord('organization', { siren: '1' }), form);
        expect(probe.entries).toEqual([]);
        // Learn the real signature through a correction, then plant a hostile entry that points at the password field.
        const pending = manager.fill(fieldsRecord('organization', { siren: '1' }), form);
        const select = document.querySelector('select[data-agentlet-record-key="siren"]') as HTMLSelectElement;
        select.value = '#a';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        clickDialogButton('Fill');
        await pending;
        const saved = stored();
        const key = Object.keys(saved)[0];
        saved[key].map.siren = '#pw';
        window.localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(saved));
        const mapping = manager.match(fieldsRecord('organization', { siren: '1' }), form);
        expect(mapping.entries.map(entry => entry.selector)).not.toContain('#pw');
    });

    describe('when storage fails', () => {
        const brokenStorage = (overrides: Partial<StorageManagerAPI>): StorageManagerAPI => ({
            getJSON: () => { throw new Error('storage blocked'); },
            setJSON: () => { throw new Error('quota exceeded'); },
            ...overrides
        } as unknown as StorageManagerAPI);

        it('still matches and fills when reading throws', async () => {
            const form = setPage(supplierForm);
            const { manager } = makeManager({ storageManager: brokenStorage({}) });
            expect(manager.match(organization(), form).entries.length).toBeGreaterThan(0);
            const result = await manager.fill(organization(), form, { preview: false });
            expect(result.successful).toBe(4);
        });

        it('still fills when writing throws, after a correction', async () => {
            const form = setPage(supplierForm);
            const { manager } = makeManager({ storageManager: brokenStorage({ getJSON: () => null }) });
            const pending = manager.fill(fieldsRecord('organization', { siren: 'v' }), form);
            const select = document.querySelector('select[data-agentlet-record-key="siren"]') as HTMLSelectElement;
            select.value = '#zip';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            clickDialogButton('Fill');
            const result = await pending;
            expect(result.confirmed).toBe(true);
            expect(byId('zip').value).toBe('v');
        });

        it('works without any storage manager', async () => {
            const form = setPage(supplierForm);
            const { manager } = makeManager({ storageManager: null });
            const result = await manager.fill(organization(), form, { preview: false });
            expect(result.successful).toBe(4);
        });

        it.each([
            ['not an object', 'text'],
            ['an array', []],
            ['an entry without a map', { 'organization:x': { updatedAt: 1 } }],
            ['selectors that are not strings', { 'organization:x': { map: { siren: 5 }, updatedAt: 1 } }]
        ])('ignores garbage in storage: %s', async (_name, garbage) => {
            const form = setPage(supplierForm);
            const { manager } = makeManager({ storageManager: brokenStorage({ getJSON: (() => garbage) as never }) });
            expect(manager.match(organization(), form).entries.length).toBeGreaterThan(0);
        });

        it('survives unparsable JSON in the real storage', async () => {
            window.localStorage.setItem(MAPPING_STORAGE_KEY, '{broken');
            const form = setPage(supplierForm);
            const { manager } = makeManager();
            const result = await manager.fill(organization(), form, { preview: false });
            expect(result.successful).toBe(4);
        });

        it('survives localStorage itself throwing', async () => {
            const form = setPage(supplierForm);
            const { manager } = makeManager();
            const getItem = window.localStorage.getItem as jest.Mock;
            const original = getItem.getMockImplementation();
            getItem.mockImplementation(() => { throw new Error('SecurityError'); });
            try {
                const result = await manager.fill(organization(), form, { preview: false });
                expect(result.successful).toBe(4);
            } finally {
                getItem.mockImplementation(original);
            }
        });
    });

    it('keeps the memory bounded', async () => {
        const entries: Record<string, unknown> = {};
        for (let index = 0; index < 250; index++) entries[`t:${index}`] = { map: { a: '#a' }, updatedAt: index };
        window.localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(entries));
        const { manager } = makeManager();
        await correct(manager, 'siren', '#zip');
        const saved = stored();
        expect(Object.keys(saved).length).toBeLessThanOrEqual(200);
        expect(saved['t:0']).toBeUndefined();
        expect(saved['t:249']).toBeDefined();
    });
});

describe('records.pasteFromClipboard()', () => {
    const blob = (text: string) => ({ text: () => Promise.resolve(text) });
    const envelope = (type: string, fields: Record<string, string>) => ({ agentlet: 'record', version: 1, type, fields });

    afterEach(removeClipboard);

    it('reads the clipboard from a user gesture, then runs the fill flow', async () => {
        const clipboard = installClipboard();
        clipboard.read.mockResolvedValue([new FakeClipboardItem({
            'text/html': blob(`<dl data-agentlet-record="${toBase64Url(JSON.stringify(envelope('organization', { organization: 'Example SAS' })))}"></dl>`)
        })]);
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const result = await manager.pasteFromClipboard(form, { preview: false, types: ['organization'] });
        expect(result?.confirmed).toBe(true);
        expect(byId('co').value).toBe('Example SAS');
    });

    it('shows the preview by default', async () => {
        const clipboard = installClipboard();
        clipboard.read.mockResolvedValue([new FakeClipboardItem({ 'web application/vnd.agentlet.record+json': blob(JSON.stringify(envelope('organization', { organization: 'Example SAS' }))) })]);
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        const pending = manager.pasteFromClipboard(form);
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(document.querySelector('.agentlet-records-preview')).not.toBeNull();
        clickDialogButton('Fill');
        expect((await pending)?.confirmed).toBe(true);
        expect(byId('co').value).toBe('Example SAS');
    });

    it('resolves null when the clipboard holds no record, or none of an allowed type', async () => {
        const clipboard = installClipboard();
        const form = setPage(supplierForm);
        const { manager } = makeManager();
        clipboard.read.mockResolvedValue([new FakeClipboardItem({ 'text/plain': blob('hello') })]);
        expect(await manager.pasteFromClipboard(form, { preview: false })).toBeNull();
        clipboard.read.mockResolvedValue([new FakeClipboardItem({ 'web application/vnd.agentlet.record+json': blob(JSON.stringify(envelope('contact', { name: 'Ada' }))) })]);
        expect(await manager.pasteFromClipboard(form, { preview: false, types: ['organization'] })).toBeNull();
        expect(byId('co').value).toBe('');
    });

    it('skips table records and uses the first fields record', async () => {
        const clipboard = installClipboard();
        const list = {
            agentlet: 'records', version: 1, type: 'table',
            items: [{ agentlet: 'record', version: 1, type: 'table', columns: ['a'], rows: [] }]
        };
        clipboard.read.mockResolvedValue([new FakeClipboardItem({ 'web application/vnd.agentlet.record+json': blob(JSON.stringify(list)) })]);
        const form = setPage(supplierForm);
        expect(await makeManager().manager.pasteFromClipboard(form, { preview: false })).toBeNull();
    });

    it('rejects when the browser refuses to read', async () => {
        const clipboard = installClipboard();
        clipboard.read.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
        const form = setPage(supplierForm);
        await expect(makeManager().manager.pasteFromClipboard(form)).rejects.toThrow('denied');
    });
});
