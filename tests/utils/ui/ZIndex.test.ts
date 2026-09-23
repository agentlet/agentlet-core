/**
 * Tests for the Z_INDEX layering scheme.
 *
 * Guards against the class of bug this file was added to catch: a
 * consumer referencing a `Z_INDEX.<KEY>` that was never defined, which
 * silently produces `z-index: undefined` in generated CSS.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Z_INDEX } from '../../../src/utils/ui/ZIndex';

const AGENTLET_BASE = 100000;

/**
 * Recursively collect `.js`/`.ts` source files under `dir`, skipping any
 * directory listed in `skipDirs` (absolute paths).
 */
function collectSourceFiles(dir: string, skipDirs: string[]): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let files: string[] = [];

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (skipDirs.includes(fullPath)) continue;
            files = files.concat(collectSourceFiles(fullPath, skipDirs));
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
            files.push(fullPath);
        }
    }

    return files;
}

describe('Z_INDEX', () => {
    test('every value is a positive integer greater than the agentlet base', () => {
        Object.entries(Z_INDEX).forEach(([key, value]) => {
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThan(AGENTLET_BASE);
        });
    });

    describe('overlay layering', () => {
        test('SELECTION_BACKDROP and HIGHLIGHT_BACKDROP exist', () => {
            expect(Z_INDEX).toHaveProperty('SELECTION_BACKDROP');
            expect(Z_INDEX).toHaveProperty('HIGHLIGHT_BACKDROP');
        });

        test('CRITICAL_OVERLAY exists', () => {
            expect(Z_INDEX).toHaveProperty('CRITICAL_OVERLAY');
        });

        test('the selection backdrop sits below the selection highlight', () => {
            expect(Z_INDEX.SELECTION_BACKDROP).toBeLessThan(Z_INDEX.SELECTION_HIGHLIGHT);
        });

        test('the highlight backdrop sits below the highlighted element outline', () => {
            expect(Z_INDEX.HIGHLIGHT_BACKDROP).toBeLessThan(Z_INDEX.ELEMENT_HIGHLIGHT);
        });

        test('the critical overlay is the topmost layer of all', () => {
            const otherValues = Object.entries(Z_INDEX)
                .filter(([key]) => key !== 'CRITICAL_OVERLAY')
                .map(([, value]) => value);
            const maxOfOthers = Math.max(...otherValues);

            expect(Z_INDEX.CRITICAL_OVERLAY).toBeGreaterThan(maxOfOthers);
        });
    });

    describe('source usage', () => {
        const srcDir = path.join(process.cwd(), 'src');
        const typesDir = path.join(srcDir, 'types');
        const sourceFiles = collectSourceFiles(srcDir, [typesDir]);
        const zIndexReferencePattern = /\bZ_INDEX\.([A-Za-z_][A-Za-z0-9_]*)/g;
        const knownKeys = new Set(Object.keys(Z_INDEX));

        test('found at least one source file to scan', () => {
            // Sanity check: if this is ever 0, the walker is broken and the
            // usage check below would pass vacuously.
            expect(sourceFiles.length).toBeGreaterThan(0);
        });

        test('every Z_INDEX.<KEY> reference in src resolves to a defined constant', () => {
            const missingReferences: string[] = [];

            for (const filePath of sourceFiles) {
                const content = fs.readFileSync(filePath, 'utf8');
                const relativePath = path.relative(process.cwd(), filePath);

                let match: RegExpExecArray | null;
                zIndexReferencePattern.lastIndex = 0;
                while ((match = zIndexReferencePattern.exec(content)) !== null) {
                    const key = match[1];
                    if (!knownKeys.has(key)) {
                        missingReferences.push(`${relativePath}: Z_INDEX.${key}`);
                    }
                }
            }

            expect(missingReferences).toEqual([]);
        });
    });
});
