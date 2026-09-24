/**
 * Guided tours: a sequence of highlighted steps with next/previous/goTo
 * navigation.
 */
import type { PageHighlighterTourStep, PageHighlighterTourControl, PageHighlighterHighlightControl } from '../../../types/public-api';
import type { PageHighlighterContext } from './types.js';
import { highlight } from './highlight.js';

/**
 * Creates a guided tour across multiple highlighted steps. `currentStep` is
 * a live getter over the closure's step index, so it always reflects the
 * step that `start`/`next`/`previous`/`goTo` last navigated to.
 */
export function createTour(context: PageHighlighterContext, steps: PageHighlighterTourStep[] = []): PageHighlighterTourControl {
    let currentStep = 0;
    let currentHighlight: PageHighlighterHighlightControl | null = null;

    const tour: PageHighlighterTourControl = {
        steps,

        get currentStep(): number {
            return currentStep;
        },

        start: () => {
            if (steps.length === 0) return;
            currentStep = 0;
            tour.showStep();
        },

        next: () => {
            if (currentStep < steps.length - 1) {
                currentStep++;
                tour.showStep();
                return true;
            }
            return false;
        },

        previous: () => {
            if (currentStep > 0) {
                currentStep--;
                tour.showStep();
                return true;
            }
            return false;
        },

        goTo: (stepIndex: number) => {
            if (stepIndex >= 0 && stepIndex < steps.length) {
                currentStep = stepIndex;
                tour.showStep();
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
