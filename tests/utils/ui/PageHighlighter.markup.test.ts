/**
 * Markup characterization tests for PageHighlighter.
 *
 * Unlike tests/utils/ui/PageHighlighter.test.js (which mocks `document`
 * heavily and only checks that methods don't throw), this file restores a
 * real jsdom `document` and asserts the actual DOM produced: element ids,
 * classes, inline styles and text content, plus a handful of behavioural
 * quirks (some of them bugs) that must survive the upcoming split of
 * PageHighlighter.js into src/utils/ui/pageHighlighter/*.ts unchanged.
 *
 * tests/setup.js (loaded globally via setupFilesAfterEnv) replaces
 * `document.createElement` and `document.head` with plain non-DOM mock
 * objects for every test file. That's fine for the existing unit tests,
 * which only assert on mock calls, but it makes real markup impossible to
 * inspect. The `beforeAll` below restores the genuine jsdom implementations
 * for this file only.
 */

import PageHighlighterCtor from '../../../src/utils/ui/PageHighlighter.js';
import type {
    PageHighlighterAPI,
    PageHighlighterOverlayControl,
    PageHighlighterHighlightControl
} from '../../../src/types/public-api';

/**
 * PageHighlighter.js is untyped, plain JS. `tsc` (with `checkJs: false`)
 * only infers a bare `Object` shape for it, which is far too weak for this
 * test file to call real methods on. This local type describes the class's
 * actual runtime surface - `PageHighlighterAPI` (the public contract) plus
 * the extra members the implementation exposes and this suite specifically
 * exercises (`overlays`/`highlights`/`nextId`/`styleInjected`, and the
 * positioning helpers). The cast below is the "genuinely dynamic value"
 * case the team's TypeScript rules call out for an `unknown`-mediated cast.
 */
interface PageHighlighterTestInstance extends PageHighlighterAPI {
    overlays: Map<string, unknown>;
    highlights: Map<string, unknown>;
    nextId: number;
    styleInjected: boolean;
    ensureStyles(): void;
    positionArrow(arrow: HTMLElement, rect: DOMRect, scrollLeft: number, scrollTop: number, position: string): void;
    positionSticker(sticker: HTMLElement, rect: DOMRect, scrollLeft: number, scrollTop: number, position: string): void;
}

const PageHighlighter = PageHighlighterCtor as unknown as new () => PageHighlighterTestInstance;

/** Give `el` a fixed `getBoundingClientRect()` result for deterministic positioning math. */
function setRect(el: Element, rect: Partial<DOMRect>): void {
    const full = {
        x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0,
        toJSON: () => ({}),
        ...rect
    } as DOMRect;
    el.getBoundingClientRect = () => full;
}

/** Normalise the auto-incrementing `overlay_N`/`highlight_N` ids so snapshots stay stable. */
function normalise(html: string): string {
    return html
        .replace(/overlay_\d+/g, 'overlay_N')
        .replace(/highlight_\d+/g, 'highlight_N');
}

describe('PageHighlighter markup characterization', () => {
    let pageHighlighter: PageHighlighterTestInstance;
    let target: HTMLElement;

    beforeAll(() => {
        // Restore the real jsdom implementations that tests/setup.js
        // globally replaces with plain mock objects.
        document.createElement = Document.prototype.createElement.bind(document);
        delete (document as unknown as { head?: HTMLHeadElement }).head;
    });

    beforeEach(() => {
        jest.useFakeTimers();
        document.body.innerHTML = '';
        document.head.innerHTML = '';

        window.scrollTo = jest.fn();
        Element.prototype.scrollIntoView = jest.fn();

        pageHighlighter = new PageHighlighter();

        target = document.createElement('div');
        target.id = 'target';
        document.body.appendChild(target);
        setRect(target, { left: 100, top: 50, width: 200, height: 80, right: 300, bottom: 130 });
    });

    afterEach(() => {
        pageHighlighter.clearAll();
        jest.clearAllTimers();
        jest.useRealTimers();
        document.body.innerHTML = '';
        document.head.innerHTML = '';
    });

    describe('style injection', () => {
        test('injects exactly one <style> element into <head> on construction', () => {
            const styleTags = document.head.querySelectorAll('style');
            expect(styleTags.length).toBe(1);
            expect(styleTags[0].textContent).toContain('.agentlet-overlay');
            expect(styleTags[0].textContent).toContain('.agentlet-highlight-border');
        });

        test('calling ensureStyles() again does not inject a second <style> element', () => {
            pageHighlighter.ensureStyles();
            pageHighlighter.ensureStyles();
            expect(document.head.querySelectorAll('style').length).toBe(1);
            expect(pageHighlighter.styleInjected).toBe(true);
        });

        test('a second instance injects its own separate <style> element (no cross-instance dedup)', () => {
            new PageHighlighter();
            expect(document.head.querySelectorAll('style').length).toBe(2);
        });
    });

    describe('showOverlay', () => {
        test('default options render a centered message overlay with no background overlay', () => {
            const overlay = pageHighlighter.showOverlay();

            const el = document.getElementById(overlay.id) as HTMLElement;
            expect(el).not.toBeNull();
            expect(el.className).toBe('agentlet-message-overlay center');
            expect(el.querySelector('.agentlet-message-text')?.textContent).toBe('Loading...');
            expect(el.querySelector('.agentlet-message-content')?.className).toBe('agentlet-message-content info');
            expect(document.querySelectorAll('.agentlet-overlay').length).toBe(0);
            expect(overlay.backgroundOverlay).toBeNull();
        });

        test('overlay: true adds a background overlay element with id `${id}_bg`', () => {
            const overlay = pageHighlighter.showOverlay({ overlay: true, persistent: true });

            expect(overlay.backgroundOverlay).not.toBeNull();
            expect(overlay.backgroundOverlay?.id).toBe(`${overlay.id}_bg`);
            expect(overlay.backgroundOverlay?.className).toBe('agentlet-overlay fade-in');
            expect(document.getElementById(`${overlay.id}_bg`)).not.toBeNull();
        });

        test('closeable: true renders a close button that hides the overlay when clicked', () => {
            const overlay = pageHighlighter.showOverlay({ closeable: true, persistent: true });
            const closeButton = overlay.element.querySelector('.agentlet-message-close') as HTMLButtonElement;

            expect(closeButton).not.toBeNull();
            expect(closeButton.innerHTML).toBe('×');
            expect(closeButton.title).toBe('Close');

            closeButton.click();
            // hideOverlay adds fade-out and destroys 300ms later
            expect(overlay.element.classList.contains('fade-out')).toBe(true);
            expect(document.getElementById(overlay.id)).not.toBeNull();

            jest.advanceTimersByTime(300);
            expect(document.getElementById(overlay.id)).toBeNull();
        });

        test("type: 'progress' renders a progress bar reflecting the progress option", () => {
            const overlay = pageHighlighter.showOverlay({ type: 'progress', progress: 42, persistent: true });

            const fill = overlay.element.querySelector('.agentlet-progress-fill') as HTMLElement;
            const text = overlay.element.querySelector('.agentlet-progress-text') as HTMLElement;
            expect(fill.style.width).toBe('42%');
            expect(text.textContent).toBe('42%');
        });

        test('a non-persistent overlay auto-hides and is removed from the DOM after its duration', () => {
            const overlay = pageHighlighter.showOverlay({ duration: 1000 });

            expect(document.getElementById(overlay.id)).not.toBeNull();
            jest.advanceTimersByTime(1000); // triggers hideOverlay -> fade-out class
            expect(overlay.element.classList.contains('fade-out')).toBe(true);
            jest.advanceTimersByTime(300); // hideOverlay's own 300ms fade-out timer -> destroyOverlay
            expect(document.getElementById(overlay.id)).toBeNull();
        });

        test('persistent: true overlays are never auto-hidden', () => {
            const overlay = pageHighlighter.showOverlay({ persistent: true, duration: 100 });
            jest.advanceTimersByTime(100000);
            expect(document.getElementById(overlay.id)).not.toBeNull();
        });

        test('update() changes the message text', () => {
            const overlay = pageHighlighter.showOverlay({ message: 'Loading...', persistent: true });
            overlay.update({ message: 'Almost done' });
            expect(overlay.element.querySelector('.agentlet-message-text')?.textContent).toBe('Almost done');
        });

        test('BUG: update({ type }) never changes the message content class', () => {
            // showOverlay's update() does `Object.assign(config, updates)` *before*
            // comparing `updates.type !== config.type`, so that comparison is always
            // false once `updates.type` has just been written into `config.type` -
            // the className branch is dead code. This pins that current behaviour.
            const overlay = pageHighlighter.showOverlay({ type: 'info', persistent: true });
            overlay.update({ type: 'success' });
            expect(overlay.element.querySelector('.agentlet-message-content')?.className)
                .toBe('agentlet-message-content info');
        });

        test('update() updates progress bar width and text for progress overlays', () => {
            const overlay = pageHighlighter.showOverlay({ type: 'progress', progress: 10, persistent: true });
            overlay.update({ progress: 75 });

            const fill = overlay.element.querySelector('.agentlet-progress-fill') as HTMLElement;
            const text = overlay.element.querySelector('.agentlet-progress-text') as HTMLElement;
            expect(fill.style.width).toBe('75%');
            expect(text.textContent).toBe('75%');
        });

        test('destroy() removes the overlay (and background) from the DOM immediately, no fade wait', () => {
            const overlay = pageHighlighter.showOverlay({ overlay: true, persistent: true });
            const bgId = `${overlay.id}_bg`;

            overlay.destroy();

            expect(document.getElementById(overlay.id)).toBeNull();
            expect(document.getElementById(bgId)).toBeNull();
            expect(pageHighlighter.overlays.has(overlay.id)).toBe(false);
        });

        test('snapshot: overlay + closeable + warning banner markup', () => {
            pageHighlighter.showOverlay({
                type: 'warning',
                message: 'Careful now',
                overlay: true,
                closeable: true,
                persistent: true
            });
            expect(normalise(document.body.innerHTML)).toMatchSnapshot();
        });
    });

    describe('highlight() - border', () => {
        test('renders a positioned border element using rect + offset', () => {
            const control = pageHighlighter.highlight(target, { type: 'border', style: 'success' }) as PageHighlighterHighlightControl;
            const border = control.highlightElements[0] as HTMLElement;

            expect(border.className).toBe('agentlet-highlight-border success');
            expect(border.style.left).toBe('95px');
            expect(border.style.top).toBe('45px');
            expect(border.style.width).toBe('210px');
            expect(border.style.height).toBe('90px');
            expect(border.style.animation).toBe('agentletPulse 2s infinite');
        });

        test("animation: 'none' sets no inline animation style", () => {
            const control = pageHighlighter.highlight(target, { type: 'border', animation: 'none' }) as PageHighlighterHighlightControl;
            const border = control.highlightElements[0] as HTMLElement;
            expect(border.style.animation).toBe('');
        });

        test('a custom offset changes the computed left/top/width/height', () => {
            const control = pageHighlighter.highlight(target, { type: 'border', offset: 10 }) as PageHighlighterHighlightControl;
            const border = control.highlightElements[0] as HTMLElement;
            expect(border.style.left).toBe('90px');
            expect(border.style.width).toBe('220px');
        });

        test('snapshot: border highlight markup', () => {
            pageHighlighter.highlight(target, { type: 'border', style: 'danger', message: 'Fix this' });
            expect(normalise(document.body.innerHTML)).toMatchSnapshot();
        });
    });

    describe('highlight() - arrow', () => {
        test.each([
            ['top', 200, 20],
            ['bottom', 200, 144],
            ['left', 70, 90],
            ['right', 314, 90]
        ])('position %s computes the documented left/top', (position, left, top) => {
            const control = pageHighlighter.highlight(target, { type: 'arrow', position }) as PageHighlighterHighlightControl;
            const arrow = control.highlightElements[0] as HTMLElement;

            expect(arrow.className).toBe(`agentlet-arrow ${position}`);
            expect(arrow.style.left).toBe(`${left}px`);
            expect(arrow.style.top).toBe(`${top}px`);
        });

        test("a 'top-left' position is split to the 'top' class and formula", () => {
            const control = pageHighlighter.highlight(target, { type: 'arrow', position: 'top-left' }) as PageHighlighterHighlightControl;
            const arrow = control.highlightElements[0] as HTMLElement;
            expect(arrow.className).toBe('agentlet-arrow top');
            expect(arrow.style.left).toBe('200px');
            expect(arrow.style.top).toBe('20px');
        });
    });

    describe('highlight() - sticker', () => {
        test('renders a sticker with the message text and style class, positioned top-right by default', () => {
            const control = pageHighlighter.highlight(target, { type: 'sticker', style: 'warning', message: '7' }) as PageHighlighterHighlightControl;
            const sticker = control.highlightElements[0] as HTMLElement;

            expect(sticker.className).toBe('agentlet-sticker warning');
            expect(sticker.textContent).toBe('7');
            expect(sticker.style.left).toBe('284px');
            expect(sticker.style.top).toBe('34px');
        });

        test("defaults its text to '!' when no message is given", () => {
            const control = pageHighlighter.highlight(target, { type: 'sticker' }) as PageHighlighterHighlightControl;
            expect((control.highlightElements[0] as HTMLElement).textContent).toBe('!');
        });

        test("position 'bottom-left' computes the documented left/top", () => {
            const control = pageHighlighter.highlight(target, { type: 'sticker', position: 'bottom-left' }) as PageHighlighterHighlightControl;
            const sticker = control.highlightElements[0] as HTMLElement;
            expect(sticker.style.left).toBe('84px');
            expect(sticker.style.top).toBe('114px');
        });

        test('an unrecognised position falls back to top-right', () => {
            const control = pageHighlighter.highlight(target, { type: 'sticker', position: 'nowhere' }) as PageHighlighterHighlightControl;
            const sticker = control.highlightElements[0] as HTMLElement;
            expect(sticker.style.left).toBe('284px');
            expect(sticker.style.top).toBe('34px');
        });

        test('a message + sticker type does NOT also add a tooltip', () => {
            const control = pageHighlighter.highlight(target, { type: 'sticker', message: 'hi' }) as PageHighlighterHighlightControl;
            expect(control.highlightElements.length).toBe(1);
            expect(document.querySelectorAll('.agentlet-tooltip').length).toBe(0);
        });
    });

    describe('highlight() - tooltip message', () => {
        test('a border highlight with a message adds a tooltip positioned relative to the element', () => {
            const control = pageHighlighter.highlight(target, { type: 'border', message: 'Look here' }) as PageHighlighterHighlightControl;
            const tooltip = control.highlightElements.find(el => el.classList.contains('agentlet-tooltip')) as HTMLElement;

            expect(tooltip).toBeDefined();
            // default position is 'top-right' -> tooltip class uses the 'top' half
            expect(tooltip.className).toBe('agentlet-tooltip top');
            expect(tooltip.textContent).toBe('Look here');
            expect(tooltip.style.left).toBe('200px');
            expect(tooltip.style.top).toBe('40px');
        });
    });

    describe('highlight() - pulse', () => {
        test('sets an inline animation on the target element and creates no extra DOM nodes', () => {
            const control = pageHighlighter.highlight(target, { type: 'pulse' }) as PageHighlighterHighlightControl;
            expect(target.style.animation).toBe('agentletPulse 1s infinite');
            expect(control.highlightElements).toEqual([]);
        });

        test('destroy() clears the inline animation for pulse highlights', () => {
            const control = pageHighlighter.highlight(target, { type: 'pulse' }) as PageHighlighterHighlightControl;
            control.destroy();
            expect(target.style.animation).toBe('');
        });
    });

    describe('highlight() clickable behaviour', () => {
        test('clickable + onClick attaches the class and a click listener to every highlight element', () => {
            const onClick = jest.fn();
            const control = pageHighlighter.highlight(target, {
                type: 'border',
                message: 'Click me',
                clickable: true,
                onClick
            }) as PageHighlighterHighlightControl;

            control.highlightElements.forEach(el => {
                expect(el.classList.contains('agentlet-highlight-clickable')).toBe(true);
            });

            (control.highlightElements[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(onClick).toHaveBeenCalledTimes(1);
        });
    });

    describe('highlight() error handling', () => {
        test('returns null and warns when a selector matches nothing', () => {
            const warnSpy = jest.spyOn(console, 'warn');
            const result = pageHighlighter.highlight('.does-not-exist');
            expect(result).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith('PageHighlighter: Element not found', '.does-not-exist');
        });

        test('returns null and warns when a falsy element is passed directly', () => {
            const warnSpy = jest.spyOn(console, 'warn');
            const result = pageHighlighter.highlight(null as unknown as Element);
            expect(result).toBeNull();
            expect(warnSpy).toHaveBeenCalledWith('PageHighlighter: Element not found', null);
        });
    });

    describe('highlight control lifecycle', () => {
        test('update() replaces the tooltip text', () => {
            const control = pageHighlighter.highlight(target, { type: 'border', message: 'Old text' }) as PageHighlighterHighlightControl;
            control.update({ message: 'New text' });
            const tooltip = control.highlightElements.find(el => el.classList.contains('agentlet-tooltip')) as HTMLElement;
            expect(tooltip.textContent).toBe('New text');
        });

        test('destroy() removes every highlight element from the DOM and from the highlights map', () => {
            const control = pageHighlighter.highlight(target, { type: 'border', message: 'Bye' }) as PageHighlighterHighlightControl;
            const id = control.id;
            expect(document.querySelectorAll('.agentlet-highlight-border, .agentlet-tooltip').length).toBeGreaterThan(0);

            control.destroy();

            expect(document.querySelectorAll('.agentlet-highlight-border, .agentlet-tooltip').length).toBe(0);
            expect(pageHighlighter.highlights.has(id)).toBe(false);
        });

        test('the highlightControl.visible flag itself is never flipped by show()/hide() (dead field)', () => {
            // highlight()'s show/hide closures are arrow functions that read/write
            // `this.visible`, and `this` there is the PageHighlighter instance (the
            // enclosing method's `this`), not the returned control object. So the
            // control's own `visible` property - set to `true` at creation - is
            // never actually updated by calling hide()/show().
            const control = pageHighlighter.highlight(target, { type: 'border' }) as PageHighlighterHighlightControl;
            expect(control.visible).toBe(true);
            control.hide();
            expect(control.visible).toBe(true);
            control.show();
            expect(control.visible).toBe(true);
        });

        test('BUG: show()/hide() toggle a single flag shared by the whole PageHighlighter instance, not per-highlight', () => {
            const a = pageHighlighter.highlight(target, { type: 'border' }) as PageHighlighterHighlightControl;
            const target2 = document.createElement('div');
            document.body.appendChild(target2);
            setRect(target2, { left: 0, top: 0, width: 10, height: 10 });
            const b = pageHighlighter.highlight(target2, { type: 'border' }) as PageHighlighterHighlightControl;

            const aEl = a.highlightElements[0] as HTMLElement;
            const bEl = b.highlightElements[0] as HTMLElement;

            // Instance-level `visible` starts undefined => hide() no-ops (guard is `if (this.visible)`)
            a.hide();
            expect(aEl.style.display).toBe('');

            // show() flips the *shared* flag to true and shows A
            a.show();
            expect(aEl.style.display).toBe('block');

            // Calling hide() on B now hides B (because the shared flag is true) even
            // though B was never shown, and flips the shared flag back to false.
            b.hide();
            expect(bEl.style.display).toBe('none');

            // A subsequent show() on A re-shows A again because the shared flag is
            // false again - demonstrating the two controls fight over one flag.
            a.show();
            expect(aEl.style.display).toBe('block');
        });
    });

    describe('repositionHighlight()', () => {
        test('recomputes left/top/width/height for border elements from the live rect', () => {
            const control = pageHighlighter.highlight(target, { type: 'border' }) as PageHighlighterHighlightControl;
            setRect(target, { left: 500, top: 400, width: 50, height: 20 });

            pageHighlighter.repositionHighlight(control);

            const border = control.highlightElements[0] as HTMLElement;
            expect(border.style.left).toBe('495px');
            expect(border.style.top).toBe('395px');
            expect(border.style.width).toBe('60px');
            expect(border.style.height).toBe('30px');
        });

        test('does not reposition non-border elements (arrow stays put)', () => {
            const control = pageHighlighter.highlight(target, { type: 'arrow', position: 'top' }) as PageHighlighterHighlightControl;
            const arrow = control.highlightElements[0] as HTMLElement;
            const before = { left: arrow.style.left, top: arrow.style.top };

            setRect(target, { left: 999, top: 999, width: 10, height: 10 });
            pageHighlighter.repositionHighlight(control);

            expect(arrow.style.left).toBe(before.left);
            expect(arrow.style.top).toBe(before.top);
        });
    });

    describe('createTour()', () => {
        function makeSteps(): Array<{ element: HTMLElement; message: string }> {
            const el1 = document.createElement('div');
            const el2 = document.createElement('div');
            document.body.append(el1, el2);
            setRect(el1, { left: 0, top: 0, width: 10, height: 10 });
            setRect(el2, { left: 0, top: 0, width: 10, height: 10 });
            return [
                { element: el1, message: 'Step 1' },
                { element: el2, message: 'Step 2' }
            ];
        }

        // BUG (found while writing this characterization suite, not previously
        // covered by tests/utils/ui/PageHighlighter.test.js): `start`, `next`,
        // `previous` and `goTo` are arrow functions defined inside createTour(),
        // so their `this` is the enclosing method's `this` - the PageHighlighter
        // instance - not the `tour` object. They all call `this.showStep()`,
        // but `showStep` only exists on `tour`, not on PageHighlighter. So every
        // one of these calls throws `TypeError: ... .showStep is not a
        // function` whenever it would actually need to display a step. Only
        // `tour.showStep()` itself (which a caller can invoke directly) and
        // `tour.end()` (which never calls showStep) work as documented.
        // Also: `tour.currentStep` is a plain number copied onto the returned
        // object once, at creation time - it is never the closure's `let
        // currentStep` variable, so it stays frozen at its initial value (0)
        // forever, even though the closure variable it name-shadows really
        // does get mutated by next()/previous()/goTo()/end().

        test('showStep() - the only working way to display a step - highlights steps[currentStep]', () => {
            const steps = makeSteps();
            const tour = pageHighlighter.createTour(steps);
            tour.showStep();

            expect(pageHighlighter.highlights.size).toBe(1);
            expect(document.querySelectorAll('.agentlet-tooltip')[0]?.textContent).toBe('Step 1');
        });

        test('showStep() replaces the previous highlight rather than stacking them', () => {
            const steps = makeSteps();
            const tour = pageHighlighter.createTour(steps);
            tour.showStep();
            tour.showStep();
            expect(pageHighlighter.highlights.size).toBe(1);
        });

        test('BUG: start() throws once there is a step to show, because it calls this.showStep() instead of tour.showStep()', () => {
            const steps = makeSteps();
            const tour = pageHighlighter.createTour(steps);
            expect(() => tour.start()).toThrow(TypeError);
            expect(() => tour.start()).toThrow(/showStep is not a function/);
        });

        test('start() is a safe no-op for an empty tour (the steps.length guard runs before the broken call)', () => {
            const tour = pageHighlighter.createTour([]);
            expect(() => tour.start()).not.toThrow();
            expect(pageHighlighter.highlights.size).toBe(0);
        });

        test('BUG: next()/previous()/goTo() throw the same way whenever they would move to a real step', () => {
            expect(() => pageHighlighter.createTour(makeSteps()).next()).toThrow(/showStep is not a function/);
            // previous()'s own guard (currentStep > 0) is false on a freshly
            // created tour, so it short-circuits before the broken call.
            expect(() => pageHighlighter.createTour(makeSteps()).previous()).not.toThrow();
            expect(() => pageHighlighter.createTour(makeSteps()).goTo(1)).toThrow(/showStep is not a function/);
        });

        test('next() returns false without throwing once the closure step index has reached the last step', () => {
            const steps = makeSteps();
            const tour = pageHighlighter.createTour(steps);
            // Each throwing call still runs `currentStep++` (the closure
            // variable) before it throws, so two throws are enough to walk
            // the closure index from 0 to steps.length - 1 = 1.
            expect(() => tour.next()).toThrow();
            expect(() => tour.next()).not.toThrow(); // would-be step 2 doesn't exist -> guard is false
            expect(tour.next()).toBe(false);
        });

        test('BUG: tour.currentStep never reflects navigation - it is frozen at its initial value', () => {
            const steps = makeSteps();
            const tour = pageHighlighter.createTour(steps);
            expect(tour.currentStep).toBe(0);

            try { tour.next(); } catch { /* see BUG above */ }
            expect(tour.currentStep).toBe(0);

            tour.showStep(); // proves the closure's currentStep really did advance to 1
            expect(document.querySelectorAll('.agentlet-tooltip')[0]?.textContent).toBe('Step 2');
            expect(tour.currentStep).toBe(0); // ...yet the public property still says 0
        });

        test('end() works (it never calls showStep): destroys the current highlight and resets the closure step to 0', () => {
            const steps = makeSteps();
            const tour = pageHighlighter.createTour(steps);
            tour.showStep();
            expect(pageHighlighter.highlights.size).toBe(1);

            tour.end();
            expect(pageHighlighter.highlights.size).toBe(0);

            tour.showStep(); // closure currentStep was reset to 0 by end()
            expect(document.querySelectorAll('.agentlet-tooltip')[0]?.textContent).toBe('Step 1');
        });

        test("BUG: a step highlight's auto-advance onClick also throws, since it calls the broken tour.next()", () => {
            const steps = makeSteps();
            const tour = pageHighlighter.createTour(steps);
            tour.showStep();

            const clickable = document.querySelector('.agentlet-highlight-border') as HTMLElement;
            // Per spec, an exception thrown by a DOM event listener doesn't
            // propagate to the dispatchEvent()/click() caller - it's reported
            // to window as an uncaught error instead. Swallow that report so
            // it doesn't fail this test, then confirm the advance never
            // actually happened.
            const onError = (event: ErrorEvent): void => event.preventDefault();
            window.addEventListener('error', onError);
            clickable.click();
            window.removeEventListener('error', onError);

            expect(pageHighlighter.highlights.size).toBe(1);
            expect(document.querySelectorAll('.agentlet-tooltip')[0]?.textContent).toBe('Step 1');
        });
    });

    describe('clearAll()', () => {
        test('removes every overlay and highlight from the DOM and both maps', () => {
            pageHighlighter.showOverlay({ persistent: true });
            pageHighlighter.showOverlay({ persistent: true, overlay: true });
            pageHighlighter.highlight(target, { type: 'border' });

            pageHighlighter.clearAll();

            expect(pageHighlighter.overlays.size).toBe(0);
            expect(pageHighlighter.highlights.size).toBe(0);
            expect(document.querySelectorAll('.agentlet-message-overlay, .agentlet-overlay, .agentlet-highlight-border').length).toBe(0);
        });
    });

    describe('getStats()', () => {
        test('reflects live counts as overlays/highlights are added and removed', () => {
            expect(pageHighlighter.getStats()).toEqual({ overlays: 0, highlights: 0, total: 0 });

            const overlay = pageHighlighter.showOverlay({ persistent: true });
            const highlight = pageHighlighter.highlight(target, { type: 'border' }) as PageHighlighterHighlightControl;
            expect(pageHighlighter.getStats()).toEqual({ overlays: 1, highlights: 1, total: 2 });

            overlay.destroy();
            highlight.destroy();
            expect(pageHighlighter.getStats()).toEqual({ overlays: 0, highlights: 0, total: 0 });
        });
    });

    describe('scrollTo()', () => {
        test('scrolls an element into view and resolves with {element, highlight: null, rect}', async () => {
            const promise = pageHighlighter.scrollTo(target);
            await jest.advanceTimersByTimeAsync(500);
            const result = await promise as { element: Element; highlight: PageHighlighterHighlightControl | null };

            expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center', inline: 'center' });
            expect(result.element).toBe(target);
            expect(result.highlight).toBeNull();
        });

        test('resolves a CSS selector to the matching element', async () => {
            const promise = pageHighlighter.scrollTo('#target');
            await jest.advanceTimersByTimeAsync(500);
            const result = await promise as { element: Element };
            expect(result.element).toBe(target);
        });

        test('rejects and warns when the selector matches nothing', async () => {
            const warnSpy = jest.spyOn(console, 'warn');
            await expect(pageHighlighter.scrollTo('.nope')).rejects.toThrow('Element not found: .nope');
            expect(warnSpy).toHaveBeenCalledWith('PageHighlighter.scrollTo: Element not found', '.nope');
        });

        test('scrolls to raw {x, y} coordinates via window.scrollTo and resolves with them', async () => {
            const promise = pageHighlighter.scrollTo({ x: 50, y: 120 });
            await jest.advanceTimersByTimeAsync(500);
            const result = await promise;

            expect(window.scrollTo).toHaveBeenCalledWith({ left: 50, top: 120, behavior: 'smooth' });
            expect(result).toEqual({ x: 50, y: 120 });
        });

        test('applies offset + window.scrollTo instead of scrollIntoView when an offset is given', async () => {
            const promise = pageHighlighter.scrollTo(target, { offset: { x: 10, y: 20 } });
            await jest.advanceTimersByTimeAsync(500);
            await promise;

            expect(window.scrollTo).toHaveBeenCalledWith({ left: 110, top: 70, behavior: 'smooth' });
            expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
        });

        test('highlight: true creates a temporary highlight that self-destroys after highlightDuration', async () => {
            const promise = pageHighlighter.scrollTo(target, { highlight: true, highlightDuration: 2000 });
            await jest.advanceTimersByTimeAsync(500);
            const result = await promise as { highlight: PageHighlighterHighlightControl | null };

            expect(result.highlight).not.toBeNull();
            expect(pageHighlighter.highlights.size).toBe(1);

            await jest.advanceTimersByTimeAsync(2000);
            expect(pageHighlighter.highlights.size).toBe(0);
        });
    });

    describe('scrollToTop() / scrollToBottom() / scrollToAndHighlight()', () => {
        test('scrollToTop scrolls to {0, 0}', async () => {
            const promise = pageHighlighter.scrollToTop();
            await jest.advanceTimersByTimeAsync(500);
            const result = await promise;
            expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 0, behavior: 'smooth' });
            expect(result).toEqual({ x: 0, y: 0 });
        });

        test('scrollToBottom scrolls to the full document scroll height', async () => {
            Object.defineProperty(document.documentElement, 'scrollHeight', { value: 5000, configurable: true });
            const promise = pageHighlighter.scrollToBottom();
            await jest.advanceTimersByTimeAsync(500);
            await promise;
            expect(window.scrollTo).toHaveBeenCalledWith({ left: 0, top: 5000, behavior: 'smooth' });
        });

        test('scrollToAndHighlight defaults highlight: true and highlights the target', async () => {
            const promise = pageHighlighter.scrollToAndHighlight(target);
            await jest.advanceTimersByTimeAsync(500);
            const result = await promise as { highlight: PageHighlighterHighlightControl | null };
            expect(result.highlight).not.toBeNull();
            expect(pageHighlighter.highlights.size).toBe(1);
        });
    });
});
