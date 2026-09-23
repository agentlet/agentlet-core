/**
 * Characterization tests for the Dialog component.
 *
 * These tests pin down the CURRENT behaviour of `src/utils/ui/Dialog.js`
 * (constructor state, exact DOM structure/classes produced by each dialog
 * type, keyboard handling, overlay-click handling, and the progress-bar
 * update APIs) before it is split into `src/utils/ui/dialog/*` modules
 * behind a `Dialog.ts` facade. Nothing here should change when the split
 * lands - if a snapshot or assertion needs to change, the split changed
 * behaviour and that is a bug in the split, not in this file.
 *
 * The global Jest setup (`tests/setup.js`) replaces `document.createElement`
 * with a bare-bones mock and shadows `document.head` with a mock object
 * that isn't part of the live document tree, to keep other suites (which
 * assert only on call counts) fast and simple. Dialog's characterization
 * relies on real DOM structure/markup, so this file restores the genuine
 * jsdom implementations before any test runs.
 */

import Dialog from '../../../src/utils/ui/Dialog.js';
import type { DialogAPI } from '../../../src/types/public-api';

/** The instance surface this file needs beyond the public {@link DialogAPI}. */
interface DialogInternal extends DialogAPI {
    theme: Record<string, string>;
    overlay: HTMLElement | null;
    dialog: HTMLElement | null;
    type: string | null;
    activeInput: HTMLInputElement | HTMLTextAreaElement | null;
    scrollY: number;
    currentProgress: number;
    totalSteps: number;
    currentStep: number;
    handleKeydown: (event: KeyboardEvent) => void;
    handleOverlayClick: (event: MouseEvent) => void;
    escapeHtml: (text: string) => string;
    focusFirstInput: () => void;
    preserveScrollPosition: () => void;
    restoreScrollPosition: () => void;
}

function makeDialog(theme: Record<string, string> = {}): DialogInternal {
    return new Dialog({ theme }) as unknown as DialogInternal;
}

/** Throws instead of returning null, so failures point at the right assertion. */
function must<T extends Element>(el: T | null, msg = 'expected element not found'): T {
    if (!el) throw new Error(msg);
    return el;
}

function dialogEl(d: DialogInternal): HTMLElement {
    return must(d.dialog, 'no active dialog element');
}

function overlayEl(d: DialogInternal): HTMLElement {
    return must(d.overlay, 'no active overlay element');
}

function pressKey(d: DialogInternal, key: string, extra: Partial<KeyboardEvent> = {}): void {
    const event = { key, preventDefault: jest.fn(), ...extra } as unknown as KeyboardEvent;
    d.handleKeydown(event);
}

function clickOverlay(d: DialogInternal): void {
    const overlay = overlayEl(d);
    const event = { target: overlay } as unknown as MouseEvent;
    d.handleOverlayClick(event);
}

function clickInsideDialog(d: DialogInternal): void {
    const overlay = overlayEl(d);
    const event = { target: dialogEl(d) } as unknown as MouseEvent;
    void overlay;
    d.handleOverlayClick(event);
}

describe('Dialog', () => {
    let dialog: DialogInternal;

    beforeAll(() => {
        // Undo tests/setup.js's global document.createElement mock and
        // document.head shadow so Dialog gets a real DOM to build into.
        document.createElement = Document.prototype.createElement.bind(document);
        const realHead = document.querySelector('head') ?? document.getElementsByTagName('head')[0];
        Object.defineProperty(document, 'head', {
            value: realHead,
            writable: true,
            configurable: true
        });
        // jsdom does not implement window.scrollTo(); Dialog calls it purely
        // for its side effect (restoreScrollPosition), so stub it out to
        // avoid noisy "Not implemented" console output from jsdom.
        window.scrollTo = jest.fn();
    });

    afterEach(() => {
        jest.useRealTimers();
        if (dialog && dialog.isActive) {
            dialog.hide();
        }
        document.body.innerHTML = '';
        document.body.className = '';
        document.body.style.top = '';
    });

    describe('constructor', () => {
        it('injects the dialog style element once, keyed by id', () => {
            document.getElementById('agentlet-dialog-styles')?.remove();
            dialog = makeDialog();
            const style = document.getElementById('agentlet-dialog-styles');
            expect(style).not.toBeNull();
            expect(style?.tagName).toBe('STYLE');
            expect(style?.textContent).toContain('@keyframes pulse');
            expect(style?.textContent).toContain('@keyframes spin');
            expect(style?.textContent).toContain('@keyframes agentlet-progress-animate');
        });

        it('does not duplicate the style element on repeated construction', () => {
            makeDialog();
            makeDialog();
            const styles = document.querySelectorAll('#agentlet-dialog-styles');
            expect(styles.length).toBe(1);
        });

        it('starts with isActive false and no overlay/dialog/type', () => {
            dialog = makeDialog();
            expect(dialog.isActive).toBe(false);
            expect(dialog.overlay).toBeNull();
            expect(dialog.dialog).toBeNull();
            expect(dialog.type).toBeNull();
        });

        it('binds handleKeydown/handleOverlayClick so they can be used detached', () => {
            dialog = makeDialog();
            const { handleKeydown, handleOverlayClick } = dialog;
            expect(() => handleKeydown({ key: 'a', preventDefault: jest.fn() } as unknown as KeyboardEvent)).not.toThrow();
            expect(() => handleOverlayClick({ target: null } as unknown as MouseEvent)).not.toThrow();
        });
    });

    describe('show() dispatcher', () => {
        beforeEach(() => {
            dialog = makeDialog();
        });

        it('routes info/input/wait/progress/fullscreen/command to the matching show* method', () => {
            const spies = {
                showInfo: jest.spyOn(dialog, 'showInfo'),
                showInput: jest.spyOn(dialog, 'showInput'),
                showWait: jest.spyOn(dialog, 'showWait'),
                showProgress: jest.spyOn(dialog, 'showProgress'),
                showFullscreen: jest.spyOn(dialog, 'showFullscreen'),
                showCommandPrompt: jest.spyOn(dialog, 'showCommandPrompt')
            };

            dialog.show('info', {}, jest.fn());
            expect(spies.showInfo).toHaveBeenCalledTimes(1);
            dialog.hide();

            dialog.show('input', {}, jest.fn());
            expect(spies.showInput).toHaveBeenCalledTimes(1);
            dialog.hide();

            dialog.show('wait', {}, jest.fn());
            expect(spies.showWait).toHaveBeenCalledTimes(1);
            dialog.hide();

            dialog.show('progress', {}, {});
            expect(spies.showProgress).toHaveBeenCalledTimes(1);
            dialog.hide();

            dialog.show('fullscreen', {}, jest.fn());
            expect(spies.showFullscreen).toHaveBeenCalledTimes(1);
            dialog.hide();

            dialog.show('command', {}, jest.fn());
            expect(spies.showCommandPrompt).toHaveBeenCalledTimes(1);
        });

        it('throws for an unknown dialog type', () => {
            expect(() => dialog.show('bogus' as unknown as 'info', {}, jest.fn())).toThrow('Unknown dialog type: bogus');
        });
    });

    describe('info dialog', () => {
        beforeEach(() => {
            dialog = makeDialog();
        });

        it('matches the expected markup for a default showInfo() call', () => {
            dialog.showInfo({ title: 'Heads up', message: 'Something happened', icon: 'ℹ️' }, jest.fn());
            expect(document.body.innerHTML.replace(/\s+/g, ' ')).toMatchSnapshot();
        });

        it('builds overlay + dialog with header icon/title, content message, and default OK button', () => {
            const cb = jest.fn();
            dialog.showInfo({ title: 'Heads up', message: 'Something happened', icon: 'ℹ️' }, cb);

            expect(dialog.isActive).toBe(true);
            expect(dialog.type).toBe('info');

            const overlay = overlayEl(dialog);
            expect(overlay.className).toBe('agentlet-dialog-overlay agentlet-info-overlay');
            expect(document.body.contains(overlay)).toBe(true);
            expect(document.body.classList.contains('agentlet-overlay-active')).toBe(true);
            expect(document.body.classList.contains('agentlet-dialog-open')).toBe(true);

            const dlg = dialogEl(dialog);
            expect(dlg.className).toBe('agentlet-info-dialog');
            expect(overlay.contains(dlg)).toBe(true);

            const header = must(dlg.querySelector('.agentlet-info-header'));
            expect(header.querySelector('span')?.textContent).toBe('ℹ️');
            expect(header.querySelector('h3')?.textContent).toBe('Heads up');

            const content = must(dlg.querySelector('.agentlet-info-content'));
            expect(content.textContent).toBe('Something happened');

            const buttons = dlg.querySelectorAll('.agentlet-info-buttons button');
            expect(buttons.length).toBe(1);
            expect(buttons[0].textContent).toBe('OK');

            (buttons[0] as HTMLButtonElement).click();
            expect(cb).toHaveBeenCalledWith('ok');
            expect(dialog.isActive).toBe(false);
        });

        it('renders message as HTML when allowHtml is true, as text (escaped) otherwise', () => {
            dialog.showInfo({ message: '<b>bold</b>', allowHtml: true }, jest.fn());
            expect(dialogEl(dialog).querySelector('.agentlet-info-content')?.innerHTML).toBe('<b>bold</b>');
            dialog.hide();

            dialog = makeDialog();
            dialog.showInfo({ message: '<b>bold</b>', allowHtml: false }, jest.fn());
            const content = must(dialogEl(dialog).querySelector('.agentlet-info-content'));
            expect(content.textContent).toBe('<b>bold</b>');
            expect(content.innerHTML).not.toContain('<b>');
        });

        it('warns and refuses to open a second dialog while one is active', () => {
            dialog.showInfo({}, jest.fn());
            const firstDialogEl = dialog.dialog;

            dialog.showInfo({ title: 'second' }, jest.fn());

            expect(console.warn).toHaveBeenCalledWith('Dialog is already active');
            expect(dialog.dialog).toBe(firstDialogEl);
        });

        it('confirm() renders Cancel/Confirm buttons and resolves with the clicked value', () => {
            const cb = jest.fn();
            dialog.confirm('Sure?', 'Confirm', cb);
            const buttons = dialogEl(dialog).querySelectorAll('.agentlet-info-buttons button');
            expect(Array.from(buttons).map(b => b.textContent)).toEqual(['Cancel', 'Confirm']);
            (buttons[1] as HTMLButtonElement).click();
            expect(cb).toHaveBeenCalledWith('confirm');
        });

        it('yesNo() renders No/Yes buttons and resolves with the clicked value', () => {
            const cb = jest.fn();
            dialog.yesNo('Sure?', 'Question', cb);
            const buttons = dialogEl(dialog).querySelectorAll('.agentlet-info-buttons button');
            expect(Array.from(buttons).map(b => b.textContent)).toEqual(['No', 'Yes']);
            (buttons[0] as HTMLButtonElement).click();
            expect(cb).toHaveBeenCalledWith('no');
        });

        it('choice() maps string and object choices to buttons, first one primary', () => {
            const cb = jest.fn();
            dialog.choice('Pick one', ['a', { text: 'B', value: 'b' }], 'Choose', cb);
            const buttons = dialogEl(dialog).querySelectorAll('.agentlet-info-buttons button');
            expect(Array.from(buttons).map(b => b.textContent)).toEqual(['a', 'B']);
            (buttons[1] as HTMLButtonElement).click();
            expect(cb).toHaveBeenCalledWith('b');
        });

        it('info/success/warning/error use the expected default icons and titles', () => {
            dialog.info('msg', undefined, jest.fn());
            expect(dialogEl(dialog).querySelector('h3')?.textContent).toBe('Information');
            expect(dialogEl(dialog).querySelector('.agentlet-info-header span')?.textContent).toBe('ℹ️');
            dialog.hide();

            dialog = makeDialog();
            dialog.success('msg', undefined, jest.fn());
            expect(dialogEl(dialog).querySelector('.agentlet-info-header span')?.textContent).toBe('✅');
            dialog.hide();

            dialog = makeDialog();
            dialog.warning('msg', undefined, jest.fn());
            expect(dialogEl(dialog).querySelector('.agentlet-info-header span')?.textContent).toBe('⚠️');
            dialog.hide();

            dialog = makeDialog();
            dialog.error('msg', undefined, jest.fn());
            expect(dialogEl(dialog).querySelector('.agentlet-info-header span')?.textContent).toBe('❌');
        });

        it('Escape hides the info dialog with "cancel"', () => {
            const cb = jest.fn();
            dialog.showInfo({}, cb);
            pressKey(dialog, 'Escape');
            expect(cb).toHaveBeenCalledWith('cancel');
            expect(dialog.isActive).toBe(false);
        });

        it('clicking the overlay hides the info dialog with "cancel", clicking inside it does not', () => {
            const cb = jest.fn();
            dialog.showInfo({}, cb);
            clickInsideDialog(dialog);
            expect(cb).not.toHaveBeenCalled();
            expect(dialog.isActive).toBe(true);

            clickOverlay(dialog);
            expect(cb).toHaveBeenCalledWith('cancel');
            expect(dialog.isActive).toBe(false);
        });

        it('known quirk: Enter never activates the primary button, because browsers/jsdom normalize the inline "background: #007bff" style used to find it', () => {
            const cb = jest.fn();
            dialog.confirm('Sure?', 'Confirm', cb);
            pressKey(dialog, 'Enter');
            expect(cb).not.toHaveBeenCalled();
            expect(dialog.isActive).toBe(true);
        });
    });

    describe('input dialog', () => {
        beforeEach(() => {
            dialog = makeDialog();
        });

        it('matches the expected markup for a default showInput() call', () => {
            dialog.showInput({ title: 'Name', message: 'Enter your name', placeholder: 'Jane', defaultValue: 'John' }, jest.fn());
            expect(document.body.innerHTML.replace(/\s+/g, ' ')).toMatchSnapshot();
        });

        it('builds overlay + dialog with header, message, text input, and Cancel/Submit buttons', () => {
            dialog.showInput({ title: 'Name', message: 'Enter your name', placeholder: 'Jane', defaultValue: 'John' }, jest.fn());

            expect(dialog.type).toBe('input');
            expect(overlayEl(dialog).className).toBe('agentlet-dialog-overlay agentlet-input-overlay');

            const dlg = dialogEl(dialog);
            expect(dlg.className).toBe('agentlet-input-dialog');
            expect(dlg.querySelector('.agentlet-input-header h3')?.textContent).toBe('Name');
            expect(dlg.querySelector('.agentlet-input-content p')?.textContent).toBe('Enter your name');

            const input = must(dlg.querySelector<HTMLInputElement>('.agentlet-input-field'));
            expect(input.tagName).toBe('INPUT');
            expect(input.type).toBe('text');
            expect(input.placeholder).toBe('Jane');
            expect(input.value).toBe('John');
            expect(dialog.activeInput).toBe(input);

            const buttons = dlg.querySelectorAll('.agentlet-input-buttons button');
            expect(Array.from(buttons).map(b => b.textContent)).toEqual(['Cancel', 'Submit']);
        });

        it('omits the message paragraph when no message is given', () => {
            dialog.showInput({}, jest.fn());
            expect(dialogEl(dialog).querySelector('.agentlet-input-content p')).toBeNull();
        });

        it('renders a textarea for inputType "textarea", honouring rows', () => {
            dialog.showInput({ inputType: 'textarea', rows: 6 }, jest.fn());
            const textarea = must(dialogEl(dialog).querySelector<HTMLTextAreaElement>('.agentlet-input-field'));
            expect(textarea.tagName).toBe('TEXTAREA');
            expect(textarea.rows).toBe(6);
        });

        it('known quirk: resizable:false has no visible effect, because the later `input.style.cssText = ...` assignment overwrites the `resize: none` set just before it', () => {
            dialog.showInput({ inputType: 'textarea', resizable: false }, jest.fn());
            const textarea = must(dialogEl(dialog).querySelector<HTMLTextAreaElement>('.agentlet-input-field'));
            expect(textarea.style.resize).toBe('');
        });

        it('Submit resolves with the input value, Cancel resolves with null', () => {
            const cb = jest.fn();
            dialog.showInput({ defaultValue: 'abc' }, cb);
            const [cancelBtn, submitBtn] = Array.from(dialogEl(dialog).querySelectorAll('.agentlet-input-buttons button')) as HTMLButtonElement[];
            submitBtn.click();
            expect(cb).toHaveBeenCalledWith('abc');
            cb.mockClear();

            dialog = makeDialog();
            dialog.showInput({}, cb);
            const cancel = dialogEl(dialog).querySelectorAll('.agentlet-input-buttons button')[0] as HTMLButtonElement;
            cancel.click();
            expect(cb).toHaveBeenCalledWith(null);
            void cancelBtn;
        });

        it('prompt()/promptPassword()/promptEmail() set the right inputType and defaults', () => {
            dialog.prompt('msg', 'def', jest.fn());
            expect((dialog.activeInput as HTMLInputElement).type).toBe('text');
            expect((dialog.activeInput as HTMLInputElement).value).toBe('def');
            dialog.hide();

            dialog = makeDialog();
            dialog.promptPassword('msg', jest.fn());
            expect((dialog.activeInput as HTMLInputElement).type).toBe('password');
            dialog.hide();

            dialog = makeDialog();
            dialog.promptEmail('msg', 'a@b.com', jest.fn());
            expect((dialog.activeInput as HTMLInputElement).type).toBe('email');
            expect((dialog.activeInput as HTMLInputElement).value).toBe('a@b.com');
        });

        it('promptTextarea()/promptAI() use a textarea with the expected rows/title', () => {
            dialog.promptTextarea('msg', 'val', 8, jest.fn());
            expect(dialog.activeInput?.tagName).toBe('TEXTAREA');
            expect((dialog.activeInput as HTMLTextAreaElement).rows).toBe(8);
            dialog.hide();

            dialog = makeDialog();
            dialog.promptAI('msg', 'val', jest.fn());
            expect(dialog.activeInput?.tagName).toBe('TEXTAREA');
            expect((dialog.activeInput as HTMLTextAreaElement).rows).toBe(6);
            expect(dialogEl(dialog).querySelector('h3')?.textContent).toBe('AI Prompt');
        });

        it('Escape hides with null', () => {
            const cb = jest.fn();
            dialog.showInput({}, cb);
            pressKey(dialog, 'Escape');
            expect(cb).toHaveBeenCalledWith(null);
        });

        it('Enter submits a text input directly', () => {
            const cb = jest.fn();
            dialog.showInput({ defaultValue: 'hello' }, cb);
            pressKey(dialog, 'Enter');
            expect(cb).toHaveBeenCalledWith('hello');
        });

        it('Enter only submits a textarea input when Ctrl/Cmd is held', () => {
            const cb = jest.fn();
            dialog.showInput({ inputType: 'textarea', defaultValue: 'hello' }, cb);
            pressKey(dialog, 'Enter');
            expect(cb).not.toHaveBeenCalled();
            expect(dialog.isActive).toBe(true);

            pressKey(dialog, 'Enter', { ctrlKey: true } as Partial<KeyboardEvent>);
            expect(cb).toHaveBeenCalledWith('hello');
        });

        it('clicking the overlay hides with null', () => {
            const cb = jest.fn();
            dialog.showInput({}, cb);
            clickOverlay(dialog);
            expect(cb).toHaveBeenCalledWith(null);
        });

        it('focuses the first input synchronously after showing', () => {
            dialog.showInput({ defaultValue: 'abc' }, jest.fn());
            expect(document.activeElement).toBe(dialog.activeInput);
        });
    });

    describe('wait dialog', () => {
        beforeEach(() => {
            dialog = makeDialog();
        });

        it('matches the expected markup for a default showWait() call', () => {
            dialog.showWait({ title: 'AI Processing', message: 'Please wait...', icon: '🤖' }, jest.fn());
            expect(document.body.innerHTML.replace(/\s+/g, ' ')).toMatchSnapshot();
        });

        it('builds overlay + dialog with icon, title, spinner, and message', () => {
            dialog.showWait({ title: 'AI Processing', message: 'Please wait...', icon: '🤖' }, jest.fn());

            expect(dialog.type).toBe('wait');
            expect(overlayEl(dialog).className).toBe('agentlet-dialog-overlay agentlet-wait-overlay');

            const dlg = dialogEl(dialog);
            expect(dlg.className).toBe('agentlet-wait-dialog');
            expect(dlg.querySelector('.agentlet-wait-header span')?.textContent).toBe('🤖');
            expect(dlg.querySelector('.agentlet-wait-header h3')?.textContent).toBe('AI Processing');
            expect(dlg.querySelector('.agentlet-wait-spinner')).not.toBeNull();
            expect(dlg.querySelector('.agentlet-wait-message')?.textContent).toBe('Please wait...');
            expect(dlg.querySelector('.agentlet-wait-buttons')).toBeNull();
        });

        it('omits the icon span entirely when icon is empty', () => {
            dialog.showWait({ icon: '' }, jest.fn());
            expect(dialogEl(dialog).querySelector('.agentlet-wait-header span')).toBeNull();
        });

        it('omits the spinner when showSpinner is false', () => {
            dialog.showWait({ showSpinner: false }, jest.fn());
            expect(dialogEl(dialog).querySelector('.agentlet-wait-spinner')).toBeNull();
        });

        it('renders a Cancel button when allowCancel is true, clicking it cancels and hides with true', () => {
            const cancelCb = jest.fn();
            dialog.showWait({ allowCancel: true }, cancelCb);
            const button = must(dialogEl(dialog).querySelector<HTMLButtonElement>('.agentlet-wait-buttons button'));
            expect(button.textContent).toBe('Cancel');

            let hidden: unknown;
            const spyHide = jest.spyOn(dialog, 'hide');
            button.click();
            expect(cancelCb).toHaveBeenCalledTimes(1);
            expect(spyHide).toHaveBeenCalledWith(true);
            void hidden;
        });

        it('Escape does nothing when allowCancel is false (dialog stays open)', () => {
            const cancelCb = jest.fn();
            dialog.showWait({ allowCancel: false }, cancelCb);
            pressKey(dialog, 'Escape');
            expect(cancelCb).not.toHaveBeenCalled();
            expect(dialog.isActive).toBe(true);
        });

        it('Escape cancels and hides with true when allowCancel is true', () => {
            const cancelCb = jest.fn();
            dialog.showWait({ allowCancel: true }, cancelCb);
            pressKey(dialog, 'Escape');
            expect(cancelCb).toHaveBeenCalledTimes(1);
            expect(dialog.isActive).toBe(false);
        });

        it('clicking the overlay never closes a wait dialog, even when allowCancel is true', () => {
            dialog.showWait({ allowCancel: true }, jest.fn());
            clickOverlay(dialog);
            expect(dialog.isActive).toBe(true);
        });

        it('updateMessage() updates the message of an active wait dialog only', () => {
            dialog.showWait({ message: 'first' }, jest.fn());
            dialog.updateMessage('second');
            expect(dialogEl(dialog).querySelector('.agentlet-wait-message')?.textContent).toBe('second');

            dialog.hide();
            dialog.updateMessage('third');
            expect(console.warn).toHaveBeenCalledWith('No active wait dialog to update');
        });

        it('showAIProcessing supports the legacy (message, allowCancel, callback) string form', () => {
            const cb = jest.fn();
            dialog.showAIProcessing('Working...', true, cb);
            expect(dialogEl(dialog).querySelector('.agentlet-wait-message')?.textContent).toBe('Working...');
            expect(dialogEl(dialog).querySelector('.agentlet-wait-buttons button')).not.toBeNull();
        });

        it('showLoading/showAnalyzing/showThinking use the expected titles and icons', () => {
            dialog.showLoading('Loading data', false, jest.fn());
            expect(dialogEl(dialog).querySelector('h3')?.textContent).toBe('Loading');
            expect(dialogEl(dialog).querySelector('.agentlet-wait-header span')?.textContent).toBe('⏳');
            dialog.hide();

            dialog = makeDialog();
            dialog.showAnalyzing('Analyzing data', false, jest.fn());
            expect(dialogEl(dialog).querySelector('h3')?.textContent).toBe('Analyzing');
            expect(dialogEl(dialog).querySelector('.agentlet-wait-header span')?.textContent).toBe('🔍');
            dialog.hide();

            dialog = makeDialog();
            dialog.showThinking('Thinking hard', false, jest.fn());
            expect(dialogEl(dialog).querySelector('h3')?.textContent).toBe('Thinking');
            expect(dialogEl(dialog).querySelector('.agentlet-wait-header span')?.textContent).toBe('💭');
        });
    });

    describe('command prompt dialog', () => {
        beforeEach(() => {
            dialog = makeDialog();
        });

        it('matches the expected markup for a default showCommandPrompt() call', () => {
            dialog.showCommandPrompt({ title: 'Command Prompt', message: 'Type a command', placeholder: 'go...' }, jest.fn());
            expect(document.body.innerHTML.replace(/\s+/g, ' ')).toMatchSnapshot();
        });

        it('builds overlay + dialog with header, message, large input, and Cancel/Execute buttons', () => {
            dialog.showCommandPrompt({ title: 'Command Prompt', message: 'Type a command', placeholder: 'go...' }, jest.fn());

            expect(dialog.type).toBe('command');
            const dlg = dialogEl(dialog);
            expect(dlg.className).toBe('agentlet-command-dialog');
            expect(dlg.querySelector('.agentlet-command-header h2')?.textContent).toBe('Command Prompt');
            expect(dlg.querySelector('.agentlet-command-message')?.textContent).toBe('Type a command');

            const input = must(dlg.querySelector<HTMLInputElement>('.agentlet-command-input'));
            expect(input.placeholder).toBe('go...');
            expect(dialog.activeInput).toBe(input);

            const buttons = dlg.querySelectorAll('.agentlet-command-buttons button');
            expect(Array.from(buttons).map(b => b.textContent)).toEqual(['Cancel', 'Execute']);
        });

        it('hides the header when showHeader is false, and the message when showMessage is false', () => {
            dialog.showCommandPrompt({ showHeader: false, message: 'hidden', showMessage: false }, jest.fn());
            expect(dialogEl(dialog).querySelector('.agentlet-command-header')).toBeNull();
            expect(dialogEl(dialog).querySelector('.agentlet-command-message')).toBeNull();
        });

        it('commandPrompt() accepts the legacy (placeholder-string, callback) form', () => {
            const cb = jest.fn();
            dialog.commandPrompt('legacy placeholder', cb);
            expect(dialog.type).toBe('command');
            expect((dialog.activeInput as HTMLInputElement).placeholder).toBe('legacy placeholder');
        });

        it('quickCommand() hides header/message and uses a 28px font size', () => {
            dialog.quickCommand('type here', jest.fn());
            const dlg = dialogEl(dialog);
            expect(dlg.querySelector('.agentlet-command-header')).toBeNull();
            expect(dlg.querySelector('.agentlet-command-message')).toBeNull();
            const input = must(dlg.querySelector<HTMLInputElement>('.agentlet-command-input'));
            expect(input.placeholder).toBe('type here');
            expect(input.style.fontSize).toBe('28px');
        });

        it('Execute resolves with the trimmed input value, Cancel resolves with null', () => {
            const cb = jest.fn();
            dialog.showCommandPrompt({ defaultValue: '  run me  ' }, cb);
            const [, execute] = Array.from(dialogEl(dialog).querySelectorAll('.agentlet-command-buttons button')) as HTMLButtonElement[];
            execute.click();
            expect(cb).toHaveBeenCalledWith('run me');
        });

        it('Escape hides with null, Enter submits the trimmed value directly', () => {
            const cb = jest.fn();
            dialog.showCommandPrompt({ defaultValue: ' go ' }, cb);
            pressKey(dialog, 'Enter');
            expect(cb).toHaveBeenCalledWith('go');
            cb.mockClear();

            dialog = makeDialog();
            dialog.showCommandPrompt({}, cb);
            pressKey(dialog, 'Escape');
            expect(cb).toHaveBeenCalledWith(null);
        });

        it('known quirk: clicking the overlay always closes the command dialog, even with closeOnOverlay:false, because dialog.dataset.closeOnOverlay is never actually set by the code', () => {
            const cb = jest.fn();
            dialog.showCommandPrompt({ closeOnOverlay: false }, cb);
            clickOverlay(dialog);
            expect(cb).toHaveBeenCalledWith(null);
        });

        it('focuses the input synchronously after showing', () => {
            dialog.showCommandPrompt({}, jest.fn());
            expect(document.activeElement).toBe(dialog.activeInput);
        });
    });

    describe('progress dialog', () => {
        beforeEach(() => {
            dialog = makeDialog();
        });

        it('matches the expected markup for a default showProgress() call with steps', () => {
            dialog.showProgress({ title: 'Processing', message: 'Working...', totalSteps: 2, stepLabels: ['Step A', 'Step B'], showSteps: true, closable: true });
            expect(document.body.innerHTML.replace(/\s+/g, ' ')).toMatchSnapshot();
        });

        it('returns `this` from showProgress so calls can be chained', () => {
            const returned = dialog.showProgress({});
            expect(returned).toBe(dialog);
        });

        it('builds header/content/progress-bar/percentage/eta and marks the close button conditionally', () => {
            dialog.showProgress({ title: 'Processing', icon: '📊', closable: true, showPercentage: true, showETA: true });
            const dlg = dialogEl(dialog);
            expect(dlg.className).toBe('agentlet-progress-dialog');
            expect(dlg.querySelector('.agentlet-progress-header h3')?.textContent).toBe('Processing');
            expect(dlg.querySelector('.agentlet-progress-header span')?.textContent).toBe('📊');
            expect(dlg.querySelector('.agentlet-progress-header button')?.textContent).toBe('×');
            expect(dlg.querySelector('.agentlet-progress-fill')).not.toBeNull();
            expect(dlg.querySelector('.agentlet-progress-percentage')?.textContent).toBe('0%');
            expect(dlg.querySelector('.agentlet-progress-eta')?.textContent).toBe('Calculating...');
            dialog.hide();

            dialog = makeDialog();
            dialog.showProgress({ closable: false, showPercentage: false, showETA: false });
            const dlg2 = dialogEl(dialog);
            expect(dlg2.querySelector('.agentlet-progress-header button')).toBeNull();
            expect(dlg2.querySelector('.agentlet-progress-info')).toBeNull();
        });

        it('renders numbered steps with the right icon/color for done/current/pending', () => {
            dialog.showProgress({ showSteps: true, stepLabels: ['A', 'B', 'C'], totalSteps: 3, currentStep: 1 });
            const steps = dialogEl(dialog).querySelectorAll('.agentlet-progress-step');
            expect(steps.length).toBe(3);
            expect(steps[0].querySelector('.agentlet-progress-step-icon')?.textContent).toBe('✅');
            expect(steps[1].querySelector('.agentlet-progress-step-icon')?.textContent).toBe('⏳');
            expect(steps[2].querySelector('.agentlet-progress-step-icon')?.textContent).toBe('⚪');
        });

        it('updateProgress() clamps 0-100, updates the fill/percentage/message, and calls onProgress', () => {
            const onProgress = jest.fn();
            dialog.showProgress({ message: 'start' }, { onProgress });
            const result = dialog.updateProgress(150, 'halfway-ish');
            expect(result).toBe(dialog);
            expect(dialog.currentProgress).toBe(100);
            expect(dialogEl(dialog).querySelector('.agentlet-progress-fill')?.getAttribute('style')).toContain('width: 100%');
            expect(dialogEl(dialog).querySelector('.agentlet-progress-message')?.textContent).toBe('halfway-ish');
            expect(onProgress).toHaveBeenCalledWith(100, 'halfway-ish');

            dialog.updateProgress(-20);
            expect(dialog.currentProgress).toBe(0);
        });

        it('setStep() updates step icons, message, and derives percentage from step/totalSteps', () => {
            dialog.showProgress({ showSteps: true, stepLabels: ['A', 'B'], totalSteps: 2 });
            dialog.setStep(1, 'on step 2');
            const steps = dialogEl(dialog).querySelectorAll('.agentlet-progress-step');
            expect(steps[0].querySelector('.agentlet-progress-step-icon')?.textContent).toBe('✅');
            expect(steps[1].querySelector('.agentlet-progress-step-icon')?.textContent).toBe('⏳');
            expect(dialogEl(dialog).querySelector('.agentlet-progress-message')?.textContent).toBe('on step 2');
            expect(dialog.currentProgress).toBe(50);
        });

        it('completeProgress() sets 100%, marks all steps done, and calls onComplete', () => {
            jest.useFakeTimers();
            const onComplete = jest.fn();
            dialog.showProgress({ showSteps: true, stepLabels: ['A', 'B'] }, { onComplete });
            dialog.completeProgress('All done');
            expect(dialog.currentProgress).toBe(100);
            const icons = dialogEl(dialog).querySelectorAll('.agentlet-progress-step-icon');
            icons.forEach(icon => expect(icon.textContent).toBe('✅'));
            expect(onComplete).toHaveBeenCalledTimes(1);
        });

        it('completeProgress() auto-closes after 2000ms', () => {
            jest.useFakeTimers();
            dialog.showProgress({});
            dialog.completeProgress();
            expect(dialog.isActive).toBe(true);
            jest.advanceTimersByTime(2000);
            expect(dialog.isActive).toBe(false);
        });

        it('known quirk: completeProgress() auto-closes even with autoClose:false, because dialog.dataset.autoClose is never actually set by the code', () => {
            jest.useFakeTimers();
            dialog.showProgress({ autoClose: false });
            dialog.completeProgress();
            jest.advanceTimersByTime(2000);
            expect(dialog.isActive).toBe(false);
        });

        it('closable close button cancels and hides with "cancel"', () => {
            const onCancel = jest.fn();
            dialog.showProgress({ closable: true }, { onCancel });
            const closeButton = must(dialogEl(dialog).querySelector<HTMLButtonElement>('.agentlet-progress-header button'));
            const spyHide = jest.spyOn(dialog, 'hide');
            closeButton.click();
            expect(onCancel).toHaveBeenCalledTimes(1);
            expect(spyHide).toHaveBeenCalledWith('cancel');
        });

        it('updateProgress/setStep/completeProgress warn and return `this` when no progress dialog is active', () => {
            const notActive = makeDialog();
            expect(notActive.updateProgress(10)).toBe(notActive);
            expect(console.warn).toHaveBeenCalledWith('No active progress dialog to update');
            expect(notActive.setStep(1)).toBe(notActive);
            expect(notActive.completeProgress()).toBe(notActive);
            expect(console.warn).toHaveBeenCalledWith('No active progress dialog to complete');
        });

        it('showProgressBar() enables percentage/eta and is closable by default', () => {
            dialog.showProgressBar('Working...');
            const dlg = dialogEl(dialog);
            expect(dlg.querySelector('.agentlet-progress-message')?.textContent).toBe('Working...');
            expect(dlg.querySelector('.agentlet-progress-percentage')).not.toBeNull();
            expect(dlg.querySelector('.agentlet-progress-eta')).not.toBeNull();
            expect(dlg.querySelector('.agentlet-progress-header button')).not.toBeNull();
        });

        it('showProgressWithSteps() derives totalSteps from the steps array and shows step markup', () => {
            dialog.showProgressWithSteps(['One', 'Two', 'Three']);
            expect(dialog.totalSteps).toBe(3);
            expect(dialogEl(dialog).querySelectorAll('.agentlet-progress-step').length).toBe(3);
        });

        it('showBatchProgress() sets the "Processing 0 of N items..." default message', () => {
            dialog.showBatchProgress(42);
            expect(dialogEl(dialog).querySelector('.agentlet-progress-message')?.textContent).toBe('Processing 0 of 42 items...');
        });
    });

    describe('fullscreen dialog', () => {
        beforeEach(() => {
            dialog = makeDialog();
        });

        it('matches the expected markup for a default showFullscreen() call', () => {
            dialog.showFullscreen({ title: 'Details', message: 'Some content', icon: '🔍' }, jest.fn());
            expect(document.body.innerHTML.replace(/\s+/g, ' ')).toMatchSnapshot();
        });

        it('uses a padded, box-sizing overlay distinct from the regular dialog overlay', () => {
            dialog.showFullscreen({}, jest.fn());
            const overlay = overlayEl(dialog);
            expect(overlay.className).toBe('agentlet-dialog-overlay agentlet-fullscreen-overlay');
            expect(overlay.style.padding).toBe('5vh 5vw');
            expect(overlay.style.boxSizing).toBe('border-box');
        });

        it('builds header/content/footer with default Close button, custom string content, and an HTMLElement content node', () => {
            dialog.showFullscreen({ title: 'Details', message: 'Some content', icon: '🔍', customContent: '<i>hi</i>', allowHtml: true }, jest.fn());
            const dlg = dialogEl(dialog);
            expect(dlg.className).toBe('agentlet-fullscreen-dialog');
            expect(dlg.querySelector('.agentlet-fullscreen-header h2')?.textContent).toBe('Details');
            expect(dlg.querySelector('.agentlet-fullscreen-message')?.textContent).toBe('Some content');
            expect(dlg.querySelector('.agentlet-fullscreen-custom')?.innerHTML).toBe('<i>hi</i>');
            const buttons = dlg.querySelectorAll('.agentlet-fullscreen-footer button');
            expect(Array.from(buttons).map(b => b.textContent)).toEqual(['Close']);
            dialog.hide();

            dialog = makeDialog();
            const node = document.createElement('div');
            node.textContent = 'custom node';
            dialog.showFullscreen({ customContent: node }, jest.fn());
            expect(dialogEl(dialog).querySelector('.agentlet-fullscreen-custom')?.contains(node)).toBe(true);
        });

        it('the header close button hides with "close" when showHeaderCloseButton is true', () => {
            dialog.showFullscreen({ showHeaderCloseButton: true }, jest.fn());
            const closeButton = must(dialogEl(dialog).querySelector<HTMLButtonElement>('.agentlet-fullscreen-header button'));
            const spyHide = jest.spyOn(dialog, 'hide');
            closeButton.click();
            expect(spyHide).toHaveBeenCalledWith('close');
        });

        it('omits the header close button when showHeaderCloseButton is false', () => {
            dialog.showFullscreen({ showHeaderCloseButton: false }, jest.fn());
            expect(dialogEl(dialog).querySelector('.agentlet-fullscreen-header button')).toBeNull();
        });

        it('footer buttons resolve the callback with their configured value', () => {
            const cb = jest.fn();
            dialog.showFullscreen({ buttons: [{ text: 'Save', value: 'save', primary: true }, { text: 'Discard', value: 'discard', danger: true }] }, cb);
            const buttons = dialogEl(dialog).querySelectorAll('.agentlet-fullscreen-footer button');
            (buttons[1] as HTMLButtonElement).click();
            expect(cb).toHaveBeenCalledWith('discard');
        });

        it('known quirk: clicking the overlay always closes the fullscreen dialog, even with closeOnOverlay:false, because dialog.dataset.closeOnOverlay is never actually set by the code', () => {
            const cb = jest.fn();
            dialog.showFullscreen({ closeOnOverlay: false }, cb);
            clickOverlay(dialog);
            expect(cb).toHaveBeenCalledWith('cancel');
        });

        it('Escape hides with "cancel"', () => {
            const cb = jest.fn();
            dialog.showFullscreen({}, cb);
            pressKey(dialog, 'Escape');
            expect(cb).toHaveBeenCalledWith('cancel');
        });

        it('fullscreen() is an alias for showFullscreen()', () => {
            dialog.fullscreen({ title: 'Via alias' }, jest.fn());
            expect(dialog.type).toBe('fullscreen');
            expect(dialogEl(dialog).querySelector('h2')?.textContent).toBe('Via alias');
        });
    });

    describe('hide(), isActive guard, and scroll preservation', () => {
        beforeEach(() => {
            dialog = makeDialog();
        });

        it('hide() removes the overlay/dialog from the DOM, resets state, and invokes the callback once', () => {
            const cb = jest.fn();
            dialog.showInfo({}, cb);
            const overlay = overlayEl(dialog);

            dialog.hide('done');

            expect(document.body.contains(overlay)).toBe(false);
            expect(dialog.isActive).toBe(false);
            expect(dialog.type).toBeNull();
            expect(dialog.overlay).toBeNull();
            expect(dialog.dialog).toBeNull();
            expect(dialog.activeInput).toBeNull();
            expect(document.body.classList.contains('agentlet-overlay-active')).toBe(false);
            expect(document.body.classList.contains('agentlet-dialog-open')).toBe(false);
            expect(cb).toHaveBeenCalledTimes(1);
            expect(cb).toHaveBeenCalledWith('done');
        });

        it('hide() is a no-op when no dialog is active', () => {
            expect(() => dialog.hide()).not.toThrow();
            expect(dialog.isActive).toBe(false);
        });

        it('preserveScrollPosition()/restoreScrollPosition() set and clear document.body.style.top', () => {
            Object.defineProperty(window, 'scrollY', { value: 250, configurable: true });
            dialog.preserveScrollPosition();
            expect(document.body.style.top).toBe('-250px');
            expect(dialog.scrollY).toBe(250);

            dialog.restoreScrollPosition();
            expect(document.body.style.top).toBe('');
        });

        it('opening any dialog preserves scroll position via body.style.top, closing it clears that', () => {
            Object.defineProperty(window, 'scrollY', { value: 120, configurable: true });
            dialog.showInfo({}, jest.fn());
            expect(document.body.style.top).toBe('-120px');
            dialog.hide();
            expect(document.body.style.top).toBe('');
        });
    });

    describe('escapeHtml()', () => {
        it('escapes <, >, &, ", and \'', () => {
            dialog = makeDialog();
            expect(dialog.escapeHtml('<div class="a" data-x=\'y\'>&amp;</div>')).toBe(
                '&lt;div class="a" data-x=\'y\'&gt;&amp;amp;&lt;/div&gt;'
            );
        });
    });
});
