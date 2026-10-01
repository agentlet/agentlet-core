/**
 * Shared helpers for the records tests: a DOM that behaves like a rendered
 * page (tests/setup.js mocks `document.createElement` and jsdom reports a
 * zero layout size), a manager wired with the real extractors and filler,
 * and fakes for the clipboard and for paste events.
 */
import FormExtractor from '../../../../src/utils/data-processing/FormExtractor.js';
import FormFiller from '../../../../src/utils/data-processing/FormFiller.js';
import TableExtractor from '../../../../src/utils/data-processing/TableExtractor.js';
import RecordsManager, { type RecordsManagerDeps } from '../../../../src/utils/data-processing/RecordsManager.js';
import StorageManager from '../../../../src/utils/config-persistence/StorageManager.js';
import Dialog from '../../../../src/utils/ui/Dialog.js';
import type { AgentletRecord, DialogAPI, FieldsRecord } from '../../../../src/types/public-api';

const realCreateElement = Document.prototype.createElement.bind(document);
const widthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
const heightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');

/** Restores the real DOM and makes every element report a layout size, as in a rendered page. */
export function installRealDom(): void {
    document.createElement = realCreateElement;
    const realHead = document.querySelector('head') ?? document.getElementsByTagName('head')[0];
    Object.defineProperty(document, 'head', { value: realHead, writable: true, configurable: true });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 100 });
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 20 });
    window.scrollTo = jest.fn();
}

export function uninstallLayout(): void {
    if (widthDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', widthDescriptor);
    if (heightDescriptor) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', heightDescriptor);
}

export interface TestContext {
    manager: RecordsManager;
    emit: jest.Mock;
    dialog: Dialog;
    deps: RecordsManagerDeps;
}

export function makeManager(overrides: Partial<RecordsManagerDeps> = {}): TestContext {
    const emit = jest.fn();
    const dialog = new Dialog({ theme: {} });
    const deps: RecordsManagerDeps = {
        eventBus: { emit },
        formExtractor: new FormExtractor(),
        formFiller: new FormFiller(),
        tableExtractor: new TableExtractor(),
        storageManager: new StorageManager(),
        getUtils: () => ({ Dialog: dialog as unknown as DialogAPI }),
        ...overrides
    };
    return { manager: new RecordsManager(deps), emit, dialog, deps };
}

/** Replaces the page body and returns it. */
export function setPage(html: string): HTMLElement {
    document.body.innerHTML = html;
    return document.body;
}

export function byId<T extends HTMLElement = HTMLInputElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`#${id} not found`);
    return element as T;
}

export function fieldsRecord(type: string, fields: FieldsRecord['fields'], extra: Partial<FieldsRecord> = {}): FieldsRecord {
    return { agentlet: 'record', version: 1, type, fields, ...extra };
}

/** Reads a Blob's text (jsdom's Blob has no reliable `text()`). */
export function blobText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

type ItemData = Record<string, Blob | { text(): Promise<string> }>;

export class FakeClipboardItem {
    static supportsResult: boolean | undefined;
    readonly types: string[];
    readonly data: ItemData;

    constructor(data: ItemData) {
        this.data = data;
        this.types = Object.keys(data);
    }

    getType(type: string): Promise<{ text(): Promise<string> }> {
        const blob = this.data[type];
        return Promise.resolve({ text: () => ('text' in blob && typeof blob.text === 'function' && !(blob instanceof Blob) ? blob.text() : blobText(blob as Blob)) });
    }

    static supports(): boolean {
        return FakeClipboardItem.supportsResult ?? true;
    }
}

export interface FakeClipboard {
    write: jest.Mock<Promise<void>, [FakeClipboardItem[]]>;
    writeText: jest.Mock<Promise<void>, [string]>;
    read: jest.Mock<Promise<FakeClipboardItem[]>, []>;
}

/** Installs a fake `navigator.clipboard` and `ClipboardItem`. */
export function installClipboard(options: { withItem?: boolean } = {}): FakeClipboard {
    const clipboard: FakeClipboard = {
        write: jest.fn<Promise<void>, [FakeClipboardItem[]]>(() => Promise.resolve()),
        writeText: jest.fn<Promise<void>, [string]>(() => Promise.resolve()),
        read: jest.fn<Promise<FakeClipboardItem[]>, []>(() => Promise.resolve([]))
    };
    Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
    FakeClipboardItem.supportsResult = undefined;
    (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem = options.withItem === false ? undefined : FakeClipboardItem;
    return clipboard;
}

export function removeClipboard(): void {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    (globalThis as unknown as { ClipboardItem?: unknown }).ClipboardItem = undefined;
}

/** A `paste` event whose `clipboardData` serves `data` (type to content). */
export function pasteEvent(data: Record<string, string>, throwOn: string[] = []): Event {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
        value: {
            types: Object.keys(data),
            getData: (type: string) => {
                if (throwOn.includes(type)) throw new Error('blocked');
                return data[type] ?? '';
            }
        }
    });
    return event;
}

/** The clipboard formats `copy()` wrote, as text. */
export async function writtenFormats(clipboard: FakeClipboard, call = 0): Promise<Record<string, string>> {
    const item = clipboard.write.mock.calls[call][0][0];
    const out: Record<string, string> = {};
    for (const type of item.types) out[type] = await blobText(item.data[type] as Blob);
    return out;
}

/** Clicks a button of the open dialog by its label. */
export function clickDialogButton(label: string): void {
    const button = Array.from(document.querySelectorAll('button')).find(candidate => candidate.textContent === label);
    if (!button) throw new Error(`No dialog button "${label}"`);
    button.click();
}

export function recordOf(value: AgentletRecord | null): AgentletRecord {
    if (!value) throw new Error('expected a record');
    return value;
}
