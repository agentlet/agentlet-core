/**
 * Logger - central gate for informational console output.
 *
 * Informational output (module registration, storage/cookie/env bookkeeping,
 * module activation, ...) is gated on `debugMode`. Writing to the host page's
 * console by default would be a side effect a library should not have: a page
 * embedding agentlet-core with `debugMode: false` (the default, see
 * `AgentletCoreConfig.debugMode` in `src/types/public-api.d.ts`) sees
 * nothing in its console beyond warnings and errors.
 *
 * `AgentletCore`'s constructor calls `setDebugMode(this.config.debugMode)`
 * before constructing any other manager, so every `logger.log()`/
 * `logger.info()` call below is gated for the lifetime of that instance.
 * The flag is process-wide (not per-instance) because most classes in this
 * codebase (CookieManager, StorageManager, EnvManager, ModuleRegistry, ...)
 * are constructed without a reference to the owning `AgentletCore` or its
 * config, and threading `debugMode` through every constructor would add
 * parameters for no observable difference. Only one
 * `AgentletCore` is expected to be live on a page at a time (its own state,
 * e.g. `window.agentlet`, is a singleton already).
 *
 * `logger.warn()`/`logger.error()` are NOT gated: warnings and errors stay
 * visible regardless of `debugMode`. This module only centralizes the
 * informational (`console.log`/`console.info`) side of logging. Most call
 * sites call `console.warn`/`console.error` directly rather than through
 * `logger`, since those are never gated; `logger.warn`/`logger.error` exist
 * for the call sites that benefit from a single import alongside
 * `logger.log`.
 */

let debugMode = false;

/** Set once by `AgentletCore`'s constructor from `config.debugMode`. */
export function setDebugMode(enabled: boolean): void {
    debugMode = enabled;
}

/** Exposed for tests and for code that needs to branch on the current flag. */
export function isDebugMode(): boolean {
    return debugMode;
}

export const logger = {
    /** Gated by `debugMode`. Same call signature as `console.log`. */
    log(...args: unknown[]): void {
        if (debugMode) {
            console.log(...args);
        }
    },

    /** Gated by `debugMode`. Same call signature as `console.info`. */
    info(...args: unknown[]): void {
        if (debugMode) {
            console.info(...args);
        }
    },

    /** Not gated: warnings stay visible regardless of `debugMode`. */
    warn(...args: unknown[]): void {
        console.warn(...args);
    },

    /** Not gated: errors stay visible regardless of `debugMode`. */
    error(...args: unknown[]): void {
        console.error(...args);
    }
};
