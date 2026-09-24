/**
 * ShortcutManager - Keyboard shortcuts management using hotkeys-js
 * Provides easy registration and management of keyboard shortcuts for Agentlet
 */
import type { ShortcutInfo, ShortcutManagerAPI, ShortcutRegisterOptions, ShortcutsAPI } from '../../types/public-api';

// Modifiers whose combinations never produce ordinary typed text. Shift is
// deliberately excluded: shift+s is how a user types an uppercase S.
const SUPPRESSIBLE_MODIFIERS = /(^|\+)\s*(ctrl|control|cmd|command|alt|option|meta)\s*\+/i;

/**
 * Minimal shape of the object hotkeys-js passes as the second argument to a
 * bound callback. Only the member this file reads (`shortcut`) is modeled -
 * not the package's own richer `HotkeysEvent` type - and the index
 * signature keeps it structurally assignable to the broader
 * `Record<string, unknown>` handler type the public callback signature
 * uses (see `ShortcutRegisterOptions`/`ShortcutsAPI` in public-api.d.ts).
 */
interface HotkeysHandler {
    shortcut?: string;
    // hotkeys-js does not export a stable handler contract; other fields are
    // genuinely dynamic, hence `unknown` rather than a fuller shape.
    [key: string]: unknown;
}

/**
 * Minimal shape of the `hotkeys-js` library this file actually uses (a
 * global exposed via `window.hotkeys`, or handed to init() once
 * LibrarySetup lazily loads it) - not the whole surface the package's own
 * bundled types describe, mirroring how other converted utilities (e.g.
 * ScreenCapture.ts's `Html2CanvasFn`) type third-party globals locally.
 */
interface HotkeysLike {
    (keys: string, scope: string, callback: (event: KeyboardEvent, handler: HotkeysHandler) => void): void;
    filter: (event: KeyboardEvent) => boolean;
    unbind(keys?: string, scope?: string): void;
}

/**
 * Minimal shape of `src/libraries/LibrarySetup.js` this file actually uses -
 * deliberately not the whole class, just the one method `ensureHotkeys()`
 * calls. `LibrarySetup.js` is untyped plain JS, so callers (GlobalAPI.js)
 * pass a real `LibrarySetup` instance duck-typed against this interface.
 */
interface LibrarySetupLike {
    ensureLibrary(name: string): Promise<boolean>;
}

/**
 * Accessed through this helper (via `window`) rather than a bare
 * `window.hotkeys` property read scattered through the file, since there is
 * no ambient type declaration for it under strict tsc.
 */
function getWindowHotkeys(): HotkeysLike | undefined {
    return (window as unknown as { hotkeys?: HotkeysLike }).hotkeys;
}

/** Best-effort extraction of a `.message` string from an unknown error-like value. */
function extractMessage(error: unknown): unknown {
    return (error && typeof error === 'object' && 'message' in error)
        ? (error as { message?: unknown }).message
        : undefined;
}

/**
 * Whether a matched shortcut carries a modifier that makes suppressing the
 * browser default safe inside an input field.
 * @param handler - hotkeys-js handler for the matched combination
 * @param registeredKeys - Combinations the shortcut was registered with
 */
function hasSuppressibleModifier(handler: HotkeysHandler | null | undefined, registeredKeys: string): boolean {
    // handler.shortcut is the single combination that actually matched, which
    // is more precise than the registered string when several were given at
    // once (for example 'ctrl+;,cmd+;'). Fall back to the registered string.
    const matched = handler && typeof handler.shortcut === 'string' ? handler.shortcut : null;
    const candidate = matched || registeredKeys || '';
    return candidate.split(',').some(combination => SUPPRESSIBLE_MODIFIERS.test(combination.trim()));
}

/**
 * Resolve the element an event actually originated from, undoing shadow DOM
 * retargeting. hotkeys-js binds its listener on `document`, so for an event
 * dispatched inside an open shadow root (for example an input field in the
 * agentlet panel, which lives under `#agentlet-host`), `event.target` as
 * observed from `document` is the shadow host itself, not the focused
 * element inside it. `composedPath()[0]` returns the innermost original
 * target regardless of shadow boundaries, so it is preferred whenever it is
 * available.
 * @param event - The event to resolve the real target for
 */
function getEventTarget(event: Event): EventTarget | null {
    if (event && typeof event.composedPath === 'function') {
        const path = event.composedPath();
        if (path && path.length > 0) {
            return path[0];
        }
    }
    return event ? (event.target || event.srcElement) : null;
}

/**
 * Whether a target behaves like a text-editable field for the purposes of
 * `allowInInputs`.
 *
 * SELECT is deliberately excluded, matching the behavior before this
 * refactor: a <select> does not accept typed text, so a bare-letter
 * shortcut has never been blocked while one is focused (browsers already
 * use letter keys to jump to a matching option there). Keep it that way
 * unless a concrete regression shows otherwise.
 * @param target - The candidate target element
 */
function isEditableTarget(target: EventTarget | null): boolean {
    if (!target || typeof target !== 'object') {
        return false;
    }
    // EventTarget doesn't expose `tagName`/`isContentEditable` itself - duck
    // type the two members read below, exactly as the pre-conversion code
    // accessed them without a static type.
    const candidate = target as { tagName?: unknown; isContentEditable?: unknown };
    const tagName = candidate.tagName;
    return tagName === 'INPUT' || tagName === 'TEXTAREA' || !!candidate.isContentEditable;
}

/** Registered shortcut config with every `ShortcutRegisterOptions` default filled in. */
type ShortcutConfig = Required<ShortcutRegisterOptions>;

interface ShortcutRegistryEntry {
    callback: (event: KeyboardEvent, handler: HotkeysHandler) => void;
    config: ShortcutConfig;
    registered: Date;
}

class ShortcutManager implements ShortcutManagerAPI {
    librarySetup: LibrarySetupLike | null;
    shortcuts: Map<string, ShortcutRegistryEntry>;
    enabled: boolean;
    hotkeys: HotkeysLike | null; // Will be set when hotkeys-js is available

    constructor(librarySetup: LibrarySetupLike | null = null) {
        this.librarySetup = librarySetup;
        this.shortcuts = new Map();
        this.enabled = true;
        this.hotkeys = null;

        console.log('⌨️ ShortcutManager initialized');
    }

    /**
     * Check if hotkeys-js is available
     */
    isHotkeysAvailable(): boolean {
        return typeof getWindowHotkeys() !== 'undefined' || this.hotkeys !== null;
    }

    /**
     * Ensure hotkeys-js library is loaded
     */
    async ensureHotkeys(): Promise<boolean> {
        if (this.isHotkeysAvailable()) {
            return true;
        }

        if (this.librarySetup) {
            try {
                console.log('⌨️ Loading hotkeys-js library for keyboard shortcuts...');
                const success = await this.librarySetup.ensureLibrary('hotkeys');
                const windowHotkeys = getWindowHotkeys();
                if (success && windowHotkeys) {
                    this.init(windowHotkeys);
                }
                return success;
            } catch (error) {
                console.warn('⌨️ Failed to load hotkeys-js library:', extractMessage(error));
                return false;
            }
        }

        return false;
    }

    /**
     * Initialize with hotkeys-js library
     * @param hotkeysLib - The hotkeys-js library instance
     */
    init(hotkeysLib: HotkeysLike): void {
        this.hotkeys = hotkeysLib;

        // Configure hotkeys-js
        this.hotkeys.filter = (_event: KeyboardEvent): boolean => {
            // Allow shortcuts to work even in input fields if explicitly configured
            return true;
        };

        console.log('⌨️ ShortcutManager initialized with hotkeys-js');
    }

    /**
     * Register a keyboard shortcut
     * @param keys - Key combination (e.g., 'ctrl+k', 'shift+shift', 'cmd+/')
     * @param callback - Function to call when shortcut is triggered
     * @param options - Additional options
     * @returns True if registered successfully
     */
    async register(
        keys: string,
        callback: (event: KeyboardEvent, handler: HotkeysHandler) => void,
        options: ShortcutRegisterOptions = {}
    ): Promise<boolean> {
        const hotkeysAvailable = await this.ensureHotkeys();
        if (!hotkeysAvailable) {
            console.warn('⌨️ Hotkeys library not available. Keyboard shortcuts are disabled.');
            return false;
        }

        if (!keys || typeof callback !== 'function') {
            console.error('⌨️ Invalid shortcut registration: keys and callback are required');
            return false;
        }

        const config: ShortcutConfig = {
            description: options.description || `Shortcut for ${keys}`,
            preventDefault: options.preventDefault !== false,
            stopPropagation: options.stopPropagation !== false,
            scope: options.scope || 'all',
            allowInInputs: options.allowInInputs || false,
            ...options
        };

        // Wrap callback with our logic
        const wrappedCallback = (event: KeyboardEvent, handler: HotkeysHandler): void => {
            if (!this.enabled) {
                return;
            }

            // Check if we should allow this shortcut in input fields. Resolve
            // the real target through composedPath() so an event dispatched
            // inside the agentlet panel's shadow root is not seen as the
            // opaque shadow host.
            const target = getEventTarget(event);
            const isInput = isEditableTarget(target);

            if (isInput && !config.allowInInputs) {
                // The shortcut does not fire, but hotkeys-js still matched the
                // combination, and the browser has not acted on the event yet.
                // On Firefox a combination such as alt+h otherwise still
                // inserts its letter into the focused field, so the key of a
                // shortcut the user believes is blocked leaks into the value.
                //
                // Only suppress the default for combinations carrying a
                // ctrl/cmd/alt modifier. A bare-letter shortcut must keep
                // typing that letter in a field, which is the whole point of
                // allowInInputs: false.
                if (config.preventDefault && hasSuppressibleModifier(handler, keys)) {
                    event.preventDefault();
                }
                return;
            }

            if (config.preventDefault) {
                event.preventDefault();
            }

            if (config.stopPropagation) {
                event.stopPropagation();
            }

            try {
                callback(event, handler);
            } catch (error) {
                console.error(`⌨️ Error in shortcut callback for ${keys}:`, error);
            }
        };

        // Register with hotkeys-js
        if (this.hotkeys && typeof this.hotkeys === 'function') {
            this.hotkeys(keys, config.scope, wrappedCallback);
        } else {
            console.error('⌨️ Hotkeys library not properly initialized');
            return false;
        }

        // Store in our registry
        this.shortcuts.set(keys, {
            callback,
            config,
            registered: new Date()
        });

        console.log(`⌨️ Registered shortcut: ${keys} - ${config.description}`);
        return true;
    }

    /**
     * Unregister a keyboard shortcut
     * @param keys - Key combination to unregister
     * @param scope - Scope to unregister from (default: 'all')
     * @returns True if unregistered successfully
     */
    unregister(keys: string, scope: string = 'all'): boolean {
        if (!this.hotkeys) {
            console.warn('⌨️ Hotkeys library not initialized');
            return false;
        }

        this.hotkeys.unbind(keys, scope);
        this.shortcuts.delete(keys);

        console.log(`⌨️ Unregistered shortcut: ${keys}`);
        return true;
    }

    /**
     * Enable or disable all shortcuts
     * @param enabled - Whether shortcuts should be enabled
     */
    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        console.log(`⌨️ Shortcuts ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Get all registered shortcuts
     * @returns Array of shortcut information
     */
    getShortcuts(): ShortcutInfo[] {
        return Array.from(this.shortcuts.entries()).map(([keys, data]) => ({
            keys,
            description: data.config.description,
            scope: data.config.scope,
            registered: data.registered,
            allowInInputs: data.config.allowInInputs
        }));
    }

    /**
     * Check if a shortcut is registered
     * @param keys - Key combination to check
     * @returns True if registered
     */
    isRegistered(keys: string): boolean {
        return this.shortcuts.has(keys);
    }

    /**
     * Clear all registered shortcuts
     */
    clear(): void {
        if (!this.hotkeys) {
            return;
        }

        // Unbind all shortcuts
        for (const [keys, data] of this.shortcuts) {
            this.hotkeys.unbind(keys, data.config.scope);
        }

        this.shortcuts.clear();
        console.log('⌨️ All shortcuts cleared');
    }

    /**
     * Register common Agentlet shortcuts
     * @param config - Configuration object
     */
    async registerDefaultShortcuts(config: {
        quickCommandDialogShortcut?: boolean;
        quickCommandCallback?: ((result: unknown) => void) | null;
    } = {}): Promise<void> {
        if (!window.agentlet?.utils?.Dialog) {
            console.warn('⌨️ Dialog not available, skipping default shortcuts');
            return;
        }

        // Ctrl/Cmd + ; - Quick Command (only if enabled)
        if (config.quickCommandDialogShortcut) {
            const callback = config.quickCommandCallback || ((result: unknown) => {
                if (result) {
                    console.log('⌨️ Quick command:', result);
                    // Here you could add logic to parse and execute commands
                }
            });

            await this.register('ctrl+;,cmd+;', () => {
                window.agentlet.utils.Dialog.quickCommand('Enter command...', callback);
            }, {
                description: 'Open quick command dialog',
                allowInInputs: false
            });
        }

        // Escape - Close dialogs (handled by Dialog class, but we can add global escape)
        await this.register('esc', () => {
            if (window.agentlet?.utils?.Dialog?.isActive) {
                window.agentlet.utils.Dialog.hide();
            }
        }, {
            description: 'Close active dialog',
            allowInInputs: true
        });

        console.log('⌨️ Default Agentlet shortcuts registered');
    }

    /**
     * Show help dialog with all registered shortcuts
     */
    showHelp(): void {
        if (!window.agentlet?.utils?.Dialog) {
            console.warn('⌨️ Dialog not available for shortcuts help');
            return;
        }

        const shortcuts = this.getShortcuts();
        const shortcutsList = shortcuts.map(shortcut =>
            `<tr>
                <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; background: #f8f9fa;">
                    <kbd style="background: #e9ecef; padding: 2px 6px; border-radius: 3px; font-size: 12px;">
                        ${shortcut.keys.replace(/,/g, '</kbd> or <kbd style="background: #e9ecef; padding: 2px 6px; border-radius: 3px; font-size: 12px;">')}
                    </kbd>
                </td>
                <td style="padding: 8px; border: 1px solid #ddd;">${shortcut.description}</td>
                <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px; color: #666;">
                    ${shortcut.allowInInputs ? 'Everywhere' : 'Outside inputs'}
                </td>
            </tr>`
        ).join('');

        const content = `
            <div style="max-height: 400px; overflow-y: auto;">
                <p>Currently registered keyboard shortcuts:</p>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                    <thead>
                        <tr style="background: #f8f9fa;">
                            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Shortcut</th>
                            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Description</th>
                            <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Context</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shortcutsList || '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #666;">No shortcuts registered</td></tr>'}
                    </tbody>
                </table>

                <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-left: 4px solid #007bff; border-radius: 4px;">
                    <h4 style="margin: 0 0 10px 0; color: #007bff;">💡 Tips:</h4>
                    <ul style="margin: 0; padding-left: 20px;">
                        <li><strong>esc</strong> - Close active dialog</li>
                        <li>Some shortcuts may not work in input fields for security</li>
                        <li>Quick command shortcut (ctrl+; / cmd+;) is available if enabled in config</li>
                    </ul>
                </div>
            </div>
        `;

        window.agentlet.utils.Dialog.show('info', {
            title: 'Keyboard Shortcuts',
            message: content,
            icon: '⌨️',
            allowHtml: true,
            buttons: [
                { text: 'Close', value: 'close', primary: true }
            ]
        });
    }

    /**
     * Create a proxy object for global access
     */
    createProxy(): ShortcutsAPI {
        return {
            register: (keys, callback, options) => this.register(keys, callback, options),
            unregister: (keys, scope) => this.unregister(keys, scope),
            setEnabled: (enabled) => this.setEnabled(enabled),
            getShortcuts: () => this.getShortcuts(),
            isRegistered: (keys) => this.isRegistered(keys),
            clear: () => this.clear(),
            showHelp: () => this.showHelp(),
            enabled: this.enabled
        };
    }
}

export default ShortcutManager;
