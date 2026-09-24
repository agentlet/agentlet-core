/**
 * Characterization tests for AuthManager.
 *
 * These tests pin down the CURRENT behaviour of
 * `src/utils/system/AuthManager.js` (config defaults/merging, the login
 * button, the popup-based authentication flow, the `message` listener and
 * its default/custom handling, popup-closure polling, success/error/cancel
 * handling, cleanup, config updates, button-content/initials rendering,
 * logout with its confirmation dialog, and the `createProxy()` shape)
 * before it is converted to `AuthManager.ts`. Nothing here should change
 * when the conversion lands - if an assertion needs to change, the
 * conversion changed behaviour and that is a bug in the conversion, not in
 * this file.
 *
 * Quirks pinned down deliberately (not "fixed"):
 * - `isEnabled()` returns `this.config.enabled && this.config.loginUrl`,
 *   i.e. the *loginUrl string* (or `''`) when `enabled` is true, not a
 *   strict boolean `true`. See the `toBe(...)` assertions below rather
 *   than `toBe(true)`.
 * - `getState().enabled` and `createProxy().isEnabled()` both surface this
 *   same non-boolean value, since they delegate straight to `isEnabled()`.
 * - `getState().popupOpen` is `null` (not `false`) when there is no popup
 *   at all, since it comes from `this.authPopup && !this.authPopup.closed`.
 */

import AuthManager from '../../../src/utils/system/AuthManager.js';
import type { AuthManagerConfig } from '../../../src/types/public-api';

/** The full instance surface this file needs, including internal fields under test. */
interface AuthManagerInstance {
    config: Record<string, unknown>;
    isAuthenticating: boolean;
    authPopup: Window | null;
    messageListener: ((event: MessageEvent) => void) | null;
    loginButton: HTMLButtonElement | null;
    authenticatedUser: Record<string, unknown> | null;

    isEnabled(): boolean | string;
    createLoginButton(onClick?: () => void): HTMLButtonElement | null;
    startAuthentication(): Promise<void>;
    openAuthPopup(): Window;
    setupMessageListener(): void;
    handleAuthMessage(data: unknown): void;
    monitorPopupClosure(): void;
    handleSuccess(token: string, additionalData?: Record<string, unknown>): void;
    handleError(error: Error): void;
    handleCancel(): void;
    cleanup(): void;
    updateConfig(newConfig: Partial<AuthManagerConfig>): void;
    getState(): { enabled: boolean | string; authenticating: boolean; popupOpen: boolean | null };
    handleButtonClick(): Promise<void>;
    updateButtonContent(): void;
    getUserInitials(userInfo: Record<string, unknown> | null): string;
    logout(): Promise<void>;
    showLogoutConfirmation(userName: string): Promise<boolean>;
    createProxy(): {
        isEnabled(): boolean | string;
        startAuthentication(): Promise<void>;
        logout(): Promise<void>;
        getState(): { enabled: boolean | string; authenticating: boolean; popupOpen: boolean | null };
        getAuthenticatedUser(): Record<string, unknown> | null;
        updateConfig(config: Partial<AuthManagerConfig>): void;
    };
}

interface AuthManagerClassShape {
    new (config?: Partial<AuthManagerConfig>): AuthManagerInstance;
}

const TypedAuthManager = AuthManager as unknown as AuthManagerClassShape;

/** Minimal shape of the `window.agentlet` surface AuthManager reads. */
interface AgentletGlobalMock {
    eventBus?: { emit: jest.Mock };
    utils?: { Dialog?: { confirm: jest.Mock } };
}

function setAgentletGlobal(agentlet: AgentletGlobalMock | undefined): void {
    (window as unknown as { agentlet?: AgentletGlobalMock }).agentlet = agentlet;
}

describe('AuthManager', () => {
    afterEach(() => {
        setAgentletGlobal(undefined);
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('constructor defaults and config merging', () => {
        test('applies documented defaults when constructed with no config', () => {
            const manager = new TypedAuthManager();

            expect(manager.config).toEqual({
                enabled: false,
                buttonText: 'Login',
                buttonIcon: '🔐',
                loginUrl: '',
                popupWidth: 400,
                popupHeight: 600,
                popupFeatures: 'scrollbars=yes,resizable=yes,status=no,location=no,toolbar=no,menubar=no',
                tokenExtractor: null,
                messageHandler: null,
                onSuccess: null,
                onError: null,
                onCancel: null,
                allowedOrigins: []
            });
        });

        test('initializes instance state fields', () => {
            const manager = new TypedAuthManager();

            expect(manager.isAuthenticating).toBe(false);
            expect(manager.authPopup).toBeNull();
            expect(manager.messageListener).toBeNull();
            expect(manager.loginButton).toBeNull();
            expect(manager.authenticatedUser).toBeNull();
        });

        test('merges partial config over the defaults, leaving the rest untouched', () => {
            const manager = new TypedAuthManager({
                enabled: true,
                loginUrl: 'https://idp.example.com/auth'
            });

            expect(manager.config.enabled).toBe(true);
            expect(manager.config.loginUrl).toBe('https://idp.example.com/auth');
            expect(manager.config.buttonText).toBe('Login');
            expect(manager.config.popupWidth).toBe(400);
        });

        test('stores caller-supplied callbacks and allowedOrigins as-is', () => {
            const onSuccess = jest.fn();
            const allowedOrigins = ['https://idp.example.com'];
            const manager = new TypedAuthManager({ onSuccess, allowedOrigins });

            expect(manager.config.onSuccess).toBe(onSuccess);
            expect(manager.config.allowedOrigins).toBe(allowedOrigins);
        });
    });

    describe('isEnabled()', () => {
        test('is falsy when enabled is false', () => {
            const manager = new TypedAuthManager({ enabled: false, loginUrl: 'https://idp.example.com' });
            expect(manager.isEnabled()).toBe(false);
        });

        test('current behaviour: returns the loginUrl string (not strict `true`) when enabled', () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });
            expect(manager.isEnabled()).toBe('https://idp.example.com');
        });

        test('current behaviour: is falsy (empty string) when enabled but loginUrl is empty', () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: '' });
            expect(manager.isEnabled()).toBe('');
        });
    });

    describe('createLoginButton()', () => {
        test('returns null when not enabled', () => {
            const manager = new TypedAuthManager({ enabled: false });
            expect(manager.createLoginButton()).toBeNull();
        });

        test('creates a button with the expected class, title and default content, and stores it', () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });
            const button = manager.createLoginButton();

            expect(button).not.toBeNull();
            expect(button?.className).toBe('agentlet-action-btn agentlet-auth-btn');
            expect(button?.title).toBe('Login');
            expect(button?.innerHTML).toBe('🔐 Login');
            expect(manager.loginButton).toBe(button);
        });

        test('wires onclick to the provided callback when given', () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });
            const onClick = jest.fn();
            const button = manager.createLoginButton(onClick);

            (button as unknown as { onclick: () => void }).onclick();
            expect(onClick).toHaveBeenCalledTimes(1);
        });

        test('wires onclick to handleButtonClick by default, which starts authentication when logged out', () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });
            const startSpy = jest.spyOn(manager, 'startAuthentication').mockResolvedValue(undefined);
            const button = manager.createLoginButton();

            (button as unknown as { onclick: () => void }).onclick();
            expect(startSpy).toHaveBeenCalledTimes(1);
        });

        test('hover handlers swap the background/border colors', () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });
            const button = manager.createLoginButton() as unknown as {
                style: { background?: string; borderColor?: string };
                onmouseenter: () => void;
                onmouseleave: () => void;
            };

            button.onmouseenter();
            expect(button.style.background).toBe('#218838');

            button.onmouseleave();
            expect(button.style.background).toBe('#28a745');
        });
    });

    describe('startAuthentication()', () => {
        test('warns and returns early when already authenticating', async () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });
            manager.isAuthenticating = true;
            const openSpy = jest.spyOn(manager, 'openAuthPopup');

            await manager.startAuthentication();

            expect(openSpy).not.toHaveBeenCalled();
            expect(console.warn).toHaveBeenCalledWith('Authentication already in progress');
        });

        test('calls handleError when loginUrl is not configured', async () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: '' });
            const errorSpy = jest.spyOn(manager, 'handleError');

            await manager.startAuthentication();

            expect(errorSpy).toHaveBeenCalledTimes(1);
            expect((errorSpy.mock.calls[0][0] as Error).message).toBe('Login URL not configured');
        });

        test('opens a centered popup with the configured URL and dimensions', async () => {
            const openMock = jest.fn().mockReturnValue({ closed: false } as unknown as Window);
            window.open = openMock;
            const manager = new TypedAuthManager({
                enabled: true,
                loginUrl: 'https://idp.example.com/auth',
                popupWidth: 400,
                popupHeight: 600
            });

            await manager.startAuthentication();

            expect(openMock).toHaveBeenCalledTimes(1);
            const [url, name, features] = openMock.mock.calls[0];
            expect(url).toBe('https://idp.example.com/auth');
            expect(name).toBe('agentlet_auth');
            expect(features).toContain('width=400');
            expect(features).toContain('height=600');
            expect(features).toContain('scrollbars=yes');
            expect(manager.isAuthenticating).toBe(true);
            expect(manager.authPopup).toBe(openMock.mock.results[0].value);
        });

        test('calls handleError and resets isAuthenticating when the popup is blocked', async () => {
            window.open = jest.fn().mockReturnValue(null);
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });

            await manager.startAuthentication();

            expect(manager.isAuthenticating).toBe(false);
            expect(console.error).toHaveBeenCalledWith(
                'Failed to start authentication:',
                expect.any(Error)
            );
        });
    });

    describe('message listener / handleAuthMessage', () => {
        test('setupMessageListener registers a "message" listener on window', () => {
            const manager = new TypedAuthManager();
            const addSpy = jest.spyOn(window, 'addEventListener');

            manager.setupMessageListener();

            expect(addSpy).toHaveBeenCalledWith('message', expect.any(Function));
            expect(manager.messageListener).not.toBeNull();
        });

        test('ignores messages from origins not in allowedOrigins', () => {
            const manager = new TypedAuthManager({ allowedOrigins: ['https://good.example.com'] });
            const authSpy = jest.spyOn(manager, 'handleAuthMessage');
            manager.setupMessageListener();

            manager.messageListener?.({ origin: 'https://evil.example.com', data: { type: 'auth_cancel' } } as MessageEvent);

            expect(authSpy).not.toHaveBeenCalled();
        });

        test('handles a message from an allowed origin', () => {
            const manager = new TypedAuthManager({ allowedOrigins: ['https://good.example.com'] });
            const cancelSpy = jest.spyOn(manager, 'handleCancel');
            manager.setupMessageListener();

            manager.messageListener?.({ origin: 'https://good.example.com', data: { type: 'auth_cancel' } } as MessageEvent);

            expect(cancelSpy).toHaveBeenCalledTimes(1);
        });

        test('default handling: auth_result success calls handleSuccess with the token', () => {
            const manager = new TypedAuthManager();
            const successSpy = jest.spyOn(manager, 'handleSuccess');
            const data = { type: 'auth_result', success: true, token: 'tok-123' };

            manager.handleAuthMessage(data);

            expect(successSpy).toHaveBeenCalledWith('tok-123', data);
        });

        test('default handling: auth_result failure calls handleError', () => {
            const manager = new TypedAuthManager();
            const errorSpy = jest.spyOn(manager, 'handleError');

            manager.handleAuthMessage({ type: 'auth_result', success: false, error: 'nope' });

            expect((errorSpy.mock.calls[0][0] as Error).message).toBe('nope');
        });

        test('default handling: auth_cancel calls handleCancel', () => {
            const manager = new TypedAuthManager();
            const cancelSpy = jest.spyOn(manager, 'handleCancel');

            manager.handleAuthMessage({ type: 'auth_cancel' });

            expect(cancelSpy).toHaveBeenCalledTimes(1);
        });

        test('string message: uses tokenExtractor when configured and extraction succeeds', () => {
            const tokenExtractor = jest.fn().mockReturnValue('extracted-token');
            const manager = new TypedAuthManager({ tokenExtractor });
            const successSpy = jest.spyOn(manager, 'handleSuccess');

            manager.handleAuthMessage('raw-payload');

            expect(tokenExtractor).toHaveBeenCalledWith('raw-payload');
            expect(successSpy).toHaveBeenCalledWith('extracted-token', { rawData: 'raw-payload' });
        });

        test('string message: falls back to the trimmed string as the token with no extractor', () => {
            const manager = new TypedAuthManager();
            const successSpy = jest.spyOn(manager, 'handleSuccess');

            manager.handleAuthMessage('  plain-token  ');

            expect(successSpy).toHaveBeenCalledWith('plain-token', { rawData: '  plain-token  ' });
        });

        test('string message: empty/whitespace-only calls handleError', () => {
            const manager = new TypedAuthManager();
            const errorSpy = jest.spyOn(manager, 'handleError');

            manager.handleAuthMessage('   ');

            expect((errorSpy.mock.calls[0][0] as Error).message).toBe('Empty authentication response');
        });

        test('custom messageHandler success result calls handleSuccess', () => {
            const messageHandler = jest.fn().mockReturnValue({ success: true, accessToken: 'abc' });
            const manager = new TypedAuthManager({ messageHandler });
            const successSpy = jest.spyOn(manager, 'handleSuccess');

            manager.setupMessageListener();
            manager.messageListener?.({ origin: 'https://any.example.com', data: 'ignored' } as MessageEvent);

            expect(successSpy).toHaveBeenCalledWith('abc', { success: true, accessToken: 'abc' });
        });

        test('custom messageHandler returning null/undefined falls back to default handling', () => {
            const messageHandler = jest.fn().mockReturnValue(null);
            const manager = new TypedAuthManager({ messageHandler });
            const authSpy = jest.spyOn(manager, 'handleAuthMessage');

            manager.setupMessageListener();
            manager.messageListener?.({ origin: 'https://any.example.com', data: { type: 'auth_cancel' } } as MessageEvent);

            expect(authSpy).toHaveBeenCalledWith({ type: 'auth_cancel' });
        });
    });

    describe('monitorPopupClosure() with fake timers', () => {
        test('calls handleCancel once the popup is detected closed', () => {
            jest.useFakeTimers();
            const manager = new TypedAuthManager();
            manager.authPopup = { closed: true } as unknown as Window;
            manager.isAuthenticating = true;
            const cancelSpy = jest.spyOn(manager, 'handleCancel');

            manager.monitorPopupClosure();
            jest.advanceTimersByTime(1000);

            expect(cancelSpy).toHaveBeenCalledTimes(1);
        });

        test('keeps polling on a fixed 1000ms interval while still authenticating and popup open', () => {
            jest.useFakeTimers();
            const manager = new TypedAuthManager();
            manager.authPopup = { closed: false } as unknown as Window;
            manager.isAuthenticating = true;
            const cancelSpy = jest.spyOn(manager, 'handleCancel');

            manager.monitorPopupClosure();
            jest.advanceTimersByTime(1000);
            jest.advanceTimersByTime(1000);

            expect(cancelSpy).not.toHaveBeenCalled();
            expect(jest.getTimerCount()).toBeGreaterThan(0);
        });

        test('stops polling once isAuthenticating is false and the popup is still open', () => {
            jest.useFakeTimers();
            const manager = new TypedAuthManager();
            manager.authPopup = { closed: false } as unknown as Window;
            manager.isAuthenticating = false;

            manager.monitorPopupClosure();
            jest.advanceTimersByTime(1000);

            expect(jest.getTimerCount()).toBe(0);
        });
    });

    describe('handleSuccess()', () => {
        test('stores authenticatedUser from userInfo/user_info, calls onSuccess, and updates the button', () => {
            const onSuccess = jest.fn();
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com', onSuccess });
            manager.createLoginButton();

            manager.handleSuccess('tok', { user_info: { name: 'Ada Lovelace' } });

            expect(manager.authenticatedUser).toEqual({ name: 'Ada Lovelace' });
            expect(onSuccess).toHaveBeenCalledTimes(1);
            const result = onSuccess.mock.calls[0][0];
            expect(result.success).toBe(true);
            expect(result.token).toBe('tok');
            expect(result.userInfo).toEqual({ name: 'Ada Lovelace' });
            expect(manager.loginButton?.innerHTML).toBe('👤 AL');
        });

        test('emits auth:success on window.agentlet.eventBus when available', () => {
            const emit = jest.fn();
            setAgentletGlobal({ eventBus: { emit } });
            const manager = new TypedAuthManager();

            manager.handleSuccess('tok', {});

            expect(emit).toHaveBeenCalledWith('auth:success', expect.objectContaining({ success: true, token: 'tok' }));
        });

        test('calls cleanup() as part of success handling', () => {
            const manager = new TypedAuthManager();
            const cleanupSpy = jest.spyOn(manager, 'cleanup');

            manager.handleSuccess('tok');

            expect(cleanupSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('handleError()', () => {
        test('calls onError with the error message and cleans up', () => {
            const onError = jest.fn();
            const manager = new TypedAuthManager({ onError });
            manager.isAuthenticating = true;

            manager.handleError(new Error('boom'));

            expect(onError).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: 'boom' }));
            expect(manager.isAuthenticating).toBe(false);
        });

        test('emits auth:error on window.agentlet.eventBus when available', () => {
            const emit = jest.fn();
            setAgentletGlobal({ eventBus: { emit } });
            const manager = new TypedAuthManager();

            manager.handleError(new Error('boom'));

            expect(emit).toHaveBeenCalledWith('auth:error', expect.objectContaining({ error: 'boom' }));
        });
    });

    describe('handleCancel()', () => {
        test('calls onCancel and cleans up', () => {
            const onCancel = jest.fn();
            const manager = new TypedAuthManager({ onCancel });
            manager.isAuthenticating = true;

            manager.handleCancel();

            expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ success: false, cancelled: true }));
            expect(manager.isAuthenticating).toBe(false);
        });
    });

    describe('cleanup()', () => {
        test('resets isAuthenticating, closes an open popup, and removes the message listener', () => {
            const manager = new TypedAuthManager();
            const close = jest.fn();
            manager.isAuthenticating = true;
            manager.authPopup = { closed: false, close } as unknown as Window;
            manager.setupMessageListener();
            const removeSpy = jest.spyOn(window, 'removeEventListener');

            manager.cleanup();

            expect(manager.isAuthenticating).toBe(false);
            expect(close).toHaveBeenCalledTimes(1);
            expect(manager.authPopup).toBeNull();
            expect(manager.messageListener).toBeNull();
            expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
        });

        test('does not call close() on an already-closed popup', () => {
            const manager = new TypedAuthManager();
            const close = jest.fn();
            manager.authPopup = { closed: true, close } as unknown as Window;

            manager.cleanup();

            expect(close).not.toHaveBeenCalled();
        });
    });

    describe('updateConfig()', () => {
        test('merges new values over the existing config', () => {
            const manager = new TypedAuthManager({ buttonText: 'Sign in' });

            manager.updateConfig({ buttonText: 'Log in', popupWidth: 500 });

            expect(manager.config.buttonText).toBe('Log in');
            expect(manager.config.popupWidth).toBe(500);
            expect(manager.config.buttonIcon).toBe('🔐');
        });
    });

    describe('getState()', () => {
        test('reflects enabled/authenticating/popupOpen, including the isEnabled() quirk', () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });
            manager.isAuthenticating = true;
            manager.authPopup = { closed: false } as unknown as Window;

            expect(manager.getState()).toEqual({
                enabled: 'https://idp.example.com',
                authenticating: true,
                popupOpen: true
            });
        });

        test('popupOpen is null (not false) when there is no popup at all', () => {
            const manager = new TypedAuthManager();
            expect(manager.getState().popupOpen).toBeNull();
        });
    });

    describe('updateButtonContent() / getUserInitials()', () => {
        test('is a no-op when there is no loginButton', () => {
            const manager = new TypedAuthManager();
            expect(() => manager.updateButtonContent()).not.toThrow();
        });

        test('renders the icon + buttonText and login styling when logged out', () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com', buttonText: 'Sign in' });
            const button = manager.createLoginButton();

            expect(button?.innerHTML).toBe('🔐 Sign in');
            expect((button as unknown as { style: { background: string } }).style.background).toBe('#28a745');
        });

        test('renders the user initials and authenticated styling when logged in', () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });
            const button = manager.createLoginButton();
            manager.authenticatedUser = { name: 'Grace Hopper' };

            manager.updateButtonContent();

            expect(button?.innerHTML).toBe('👤 GH');
            expect(button?.title).toBe('Logged in as Grace Hopper. Click to logout.');
            expect((button as unknown as { style: { background: string } }).style.background).toBe('#007bff');
        });

        test('getUserInitials: two-word name uses first+last initial', () => {
            const manager = new TypedAuthManager();
            expect(manager.getUserInitials({ name: 'Ada Lovelace' })).toBe('AL');
        });

        test('getUserInitials: single-word name uses its first two letters', () => {
            const manager = new TypedAuthManager();
            expect(manager.getUserInitials({ name: 'Cher' })).toBe('CH');
        });

        test('getUserInitials: dotted username uses initials of each part', () => {
            const manager = new TypedAuthManager();
            expect(manager.getUserInitials({ username: 'john.doe' })).toBe('JD');
        });

        test('getUserInitials: underscored username uses initials of each part', () => {
            const manager = new TypedAuthManager();
            expect(manager.getUserInitials({ username: 'jane_doe' })).toBe('JD');
        });

        test('getUserInitials: single-word username uses its first two letters', () => {
            const manager = new TypedAuthManager();
            expect(manager.getUserInitials({ username: 'admin' })).toBe('AD');
        });

        test('getUserInitials: no user info falls back to "U"', () => {
            const manager = new TypedAuthManager();
            expect(manager.getUserInitials(null)).toBe('U');
            expect(manager.getUserInitials({})).toBe('U');
        });
    });

    describe('logout() / showLogoutConfirmation()', () => {
        test('warns and does nothing when no user is authenticated', async () => {
            const manager = new TypedAuthManager();

            await manager.logout();

            expect(console.warn).toHaveBeenCalledWith('No user is currently authenticated');
        });

        test('showLogoutConfirmation resolves true immediately when Dialog utility is unavailable', async () => {
            const manager = new TypedAuthManager();
            await expect(manager.showLogoutConfirmation('Ada')).resolves.toBe(true);
            expect(console.warn).toHaveBeenCalledWith('Dialog utility not available, proceeding with logout');
        });

        test('showLogoutConfirmation resolves based on the Dialog.confirm callback value', async () => {
            const confirm = jest.fn((_msg: string, _title: string, callback: (v: string) => void) => callback('confirm'));
            setAgentletGlobal({ utils: { Dialog: { confirm } } });
            const manager = new TypedAuthManager();

            await expect(manager.showLogoutConfirmation('Ada')).resolves.toBe(true);
            expect(confirm).toHaveBeenCalledWith(
                "You're currently logged in as Ada, do you want to logout?",
                'Confirm Logout',
                expect.any(Function)
            );
        });

        test('showLogoutConfirmation resolves false when the dialog is cancelled', async () => {
            const confirm = jest.fn((_msg: string, _title: string, callback: (v: string) => void) => callback('cancel'));
            setAgentletGlobal({ utils: { Dialog: { confirm } } });
            const manager = new TypedAuthManager();

            await expect(manager.showLogoutConfirmation('Ada')).resolves.toBe(false);
        });

        test('logout() clears authenticatedUser and emits auth:logout when confirmed', async () => {
            const emit = jest.fn();
            const confirm = jest.fn((_msg: string, _title: string, callback: (v: string) => void) => callback('confirm'));
            setAgentletGlobal({ eventBus: { emit }, utils: { Dialog: { confirm } } });
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });
            manager.createLoginButton();
            manager.authenticatedUser = { name: 'Ada Lovelace' };

            await manager.logout();

            expect(manager.authenticatedUser).toBeNull();
            expect(emit).toHaveBeenCalledWith('auth:logout', expect.objectContaining({ success: true }));
        });

        test('logout() leaves authenticatedUser intact when cancelled', async () => {
            const confirm = jest.fn((_msg: string, _title: string, callback: (v: string) => void) => callback('cancel'));
            setAgentletGlobal({ utils: { Dialog: { confirm } } });
            const manager = new TypedAuthManager();
            manager.authenticatedUser = { name: 'Ada Lovelace' };

            await manager.logout();

            expect(manager.authenticatedUser).toEqual({ name: 'Ada Lovelace' });
            expect(console.log).toHaveBeenCalledWith('Logout cancelled by user');
        });
    });

    describe('createProxy()', () => {
        test('exposes a fixed set of delegating methods', () => {
            const manager = new TypedAuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });
            const proxy = manager.createProxy();

            expect(proxy.isEnabled()).toBe(manager.isEnabled());
            expect(proxy.getState()).toEqual(manager.getState());
            expect(proxy.getAuthenticatedUser()).toBe(manager.authenticatedUser);

            const startSpy = jest.spyOn(manager, 'startAuthentication').mockResolvedValue(undefined);
            void proxy.startAuthentication();
            expect(startSpy).toHaveBeenCalledTimes(1);

            const logoutSpy = jest.spyOn(manager, 'logout').mockResolvedValue(undefined);
            void proxy.logout();
            expect(logoutSpy).toHaveBeenCalledTimes(1);

            const updateSpy = jest.spyOn(manager, 'updateConfig');
            proxy.updateConfig({ buttonText: 'Log in' });
            expect(updateSpy).toHaveBeenCalledWith({ buttonText: 'Log in' });
        });
    });
});
