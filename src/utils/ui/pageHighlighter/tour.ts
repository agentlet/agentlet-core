/**
 * Guided tours: a sequence of highlighted steps with next/previous/goTo
 * navigation.
 */
import type { PageHighlighterTourStep, PageHighlighterTourControl, PageHighlighterHighlightControl } from '../../../types/public-api';
import type { PageHighlighterContext } from './types.js';
import { highlight } from './highlight.js';

/**
 * BUG (preserved from PageHighlighter.js): `start`, `next`, `previous` and
 * `goTo` were written as arrow functions that call `this.showStep()`,
 * where `this` is the enclosing `createTour()` call's receiver - the
 * PageHighlighter instance - not the `tour` object that actually owns
 * `showStep`. PageHighlighter (and this module's context) has no
 * `showStep` method, so every one of those calls throws `TypeError: ...
 * showStep is not a function` whenever it would actually need to display a
 * step. Only `tour.showStep()` (called directly) and `tour.end()` (which
 * never calls showStep) work as documented.
 *
 * This helper reproduces that exact call - and therefore that exact crash
 * - instead of silently fixing it. See
 * tests/utils/ui/PageHighlighter.markup.test.ts's createTour() suite for
 * tests pinning this.
 */
interface LegacyThisWithShowStep {
    showStep(): void;
}

function callBrokenShowStep(context: PageHighlighterContext): void {
    (context as unknown as LegacyThisWithShowStep).showStep();
}

/**
 * Creates a guided tour across multiple highlighted steps. See the BUG
 * note above: `start`/`next`/`previous`/`goTo` throw once there is a real
 * step to show; only `showStep()` (called directly) and `end()` work.
 * Also note `tour.currentStep` is a plain snapshot taken at creation time,
 * not a live view of the closure's step index - it never changes.
 */
export function createTour(context: PageHighlighterContext, steps: PageHighlighterTourStep[] = []): PageHighlighterTourControl {
    let currentStep = 0;
    let currentHighlight: PageHighlighterHighlightControl | null = null;

    const tour: PageHighlighterTourControl = {
        steps,
        currentStep,

        start: () => {
            if (steps.length === 0) return;
            currentStep = 0;
            callBrokenShowStep(context);
        },

        next: () => {
            if (currentStep < steps.length - 1) {
                currentStep++;
                callBrokenShowStep(context);
                return true;
            }
            return false;
        },

        previous: () => {
            if (currentStep > 0) {
                currentStep--;
                callBrokenShowStep(context);
                return true;
            }
            return false;
        },

        goTo: (stepIndex: number) => {
            if (stepIndex >= 0 && stepIndex < steps.length) {
                currentStep = stepIndex;
                callBrokenShowStep(context);
            }
        },

        showStep: () => {
            if (currentHighlight) {
                currentHighlight.destroy();
            }

            const step = steps[currentStep];
            if (step) {
                currentHighlight = highlight(context, step.element, {
                    ...step,
                    clickable: true,
                    onClick: () => {
                        if (!tour.next()) {
                            tour.end();
                        }
                    }
                });
            }
        },

        end: () => {
            if (currentHighlight) {
                currentHighlight.destroy();
                currentHighlight = null;
            }
            currentStep = 0;
        }
    };

    return tour;
}
