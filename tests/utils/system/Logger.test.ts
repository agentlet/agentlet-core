/**
 * Tests for the shared `logger` gate (src/utils/system/Logger.ts).
 *
 * `debugMode` is a module-level flag (not per-instance) - see the doc
 * comment on Logger.ts for why - so every test here resets it in
 * `afterEach()` to avoid leaking into other test files that import the
 * same module instance within a Jest worker.
 */

import { logger, setDebugMode, isDebugMode } from '../../../src/utils/system/Logger.js';

describe('Logger', () => {
    afterEach(() => {
        setDebugMode(false);
    });

    describe('isDebugMode()/setDebugMode()', () => {
        test('defaults to false', () => {
            expect(isDebugMode()).toBe(false);
        });

        test('reflects the last value passed to setDebugMode()', () => {
            setDebugMode(true);
            expect(isDebugMode()).toBe(true);

            setDebugMode(false);
            expect(isDebugMode()).toBe(false);
        });
    });

    describe('logger.log()', () => {
        test('does not call console.log when debugMode is off', () => {
            setDebugMode(false);
            logger.log('hello', { a: 1 });
            expect(console.log).not.toHaveBeenCalled();
        });

        test('calls console.log with the same arguments when debugMode is on', () => {
            setDebugMode(true);
            logger.log('hello', { a: 1 });
            expect(console.log).toHaveBeenCalledWith('hello', { a: 1 });
        });
    });

    describe('logger.info()', () => {
        test('does not call console.info when debugMode is off', () => {
            setDebugMode(false);
            logger.info('hello');
            expect(console.info).not.toHaveBeenCalled();
        });

        test('calls console.info with the same arguments when debugMode is on', () => {
            setDebugMode(true);
            logger.info('hello');
            expect(console.info).toHaveBeenCalledWith('hello');
        });
    });

    describe('logger.warn()/logger.error()', () => {
        test('logger.warn() always calls console.warn, regardless of debugMode', () => {
            setDebugMode(false);
            logger.warn('careful');
            expect(console.warn).toHaveBeenCalledWith('careful');
        });

        test('logger.error() always calls console.error, regardless of debugMode', () => {
            setDebugMode(false);
            logger.error('boom');
            expect(console.error).toHaveBeenCalledWith('boom');
        });
    });
});
