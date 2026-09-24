/**
 * Tests for the module mount/unmount API as driven by AgentletCore
 * (src/index.js `updateModuleContent()` / `onModuleChange()`).
 *
 * tests/setup.js globally replaces document.createElement and document.head
 * with lightweight mocks (plain objects, no attachShadow/querySelector) so
 * other suites don't need a full DOM. These tests need the real thing - a
 * real shadow root, real style/content elements - so each test restores
 * jsdom's native implementations first, the same pattern used by
 * tests/ui/UIManager.test.js.
 */

import AgentletCore from '../../src/index.js';
import Module from '../../src/core/Module.js';

describe('Module mount API - core integration', () => {
    let agentlet;

    beforeEach(() => {
        // Restore jsdom's real Document.prototype implementations by removing
        // the own-property mocks installed by tests/setup.js.
        delete document.createElement;
        delete document.head;

        document.body.innerHTML = '';
        delete window.agentlet;
    });

    afterEach(async () => {
        if (agentlet && agentlet.initialized) {
            await agentlet.cleanup();
        }
        document.body.innerHTML = '';
        delete window.agentlet;
    });

    test('updateModuleContent() mounts the active module with a full context', async () => {
        agentlet = new AgentletCore();
        await agentlet.init();

        const testModule = new Module({ name: 'mount-test', patterns: ['never-matches.example'] });
        const mountSpy = jest.spyOn(testModule, 'mount');
        agentlet.moduleRegistry.register(testModule);
        agentlet.moduleRegistry.activeModule = testModule;

        await agentlet.updateModuleContent('refresh');

        expect(mountSpy).toHaveBeenCalledTimes(1);
        const [container, context] = mountSpy.mock.calls[0];
        expect(container).toBe(agentlet.ui.content);
        expect(context.root).toBe(agentlet.ui.root);
        expect(context.root).toBeInstanceOf(ShadowRoot);
        expect(context.theme).toEqual(agentlet.themeManager.getTheme());
        expect(context.eventBus).toBe(agentlet.eventBus);
        expect(context.api).toBe(window.agentlet);
        expect(context.trigger).toBe('refresh');

        expect(agentlet.mountedModule).toBe(testModule);
        expect(testModule.mounted).toBe(true);
        expect(container.innerHTML).toContain('mount-test');
    });

    test('onModuleChange() derives trigger "urlChange" from context.trigger, "moduleChange" otherwise', async () => {
        agentlet = new AgentletCore();
        await agentlet.init();

        const urlModule = new Module({ name: 'url-module', patterns: ['never-matches.example'] });
        const urlMountSpy = jest.spyOn(urlModule, 'mount');
        agentlet.moduleRegistry.activeModule = urlModule;

        await agentlet.onModuleChange(urlModule, { trigger: 'urlChange', oldUrl: 'a', newUrl: 'b' });

        expect(urlMountSpy).toHaveBeenCalledTimes(1);
        expect(urlMountSpy.mock.calls[0][1].trigger).toBe('urlChange');

        const otherModule = new Module({ name: 'other-module', patterns: ['never-matches.example'] });
        const otherMountSpy = jest.spyOn(otherModule, 'mount');
        agentlet.moduleRegistry.activeModule = otherModule;

        await agentlet.onModuleChange(otherModule, { trigger: 'moduleRegistration' });

        expect(otherMountSpy).toHaveBeenCalledTimes(1);
        expect(otherMountSpy.mock.calls[0][1].trigger).toBe('moduleChange');
    });

    test('switching the active module unmounts the previous one before mounting the next', async () => {
        agentlet = new AgentletCore();
        await agentlet.init();

        const moduleA = new Module({ name: 'module-a', patterns: ['never-matches.example'] });
        const moduleB = new Module({ name: 'module-b', patterns: ['never-matches.example'] });
        const unmountASpy = jest.spyOn(moduleA, 'unmount');
        const mountBSpy = jest.spyOn(moduleB, 'mount');

        agentlet.moduleRegistry.activeModule = moduleA;
        await agentlet.updateModuleContent('moduleChange');
        expect(agentlet.mountedModule).toBe(moduleA);
        expect(moduleA.mounted).toBe(true);

        agentlet.moduleRegistry.activeModule = moduleB;
        await agentlet.updateModuleContent('moduleChange');

        expect(unmountASpy).toHaveBeenCalledTimes(1);
        expect(mountBSpy).toHaveBeenCalledTimes(1);
        expect(unmountASpy.mock.invocationCallOrder[0]).toBeLessThan(mountBSpy.mock.invocationCallOrder[0]);

        expect(moduleA.mounted).toBe(false);
        expect(agentlet.mountedModule).toBe(moduleB);

        // A module unmounted by updateModuleContent() must not be unmounted
        // again by its own cleanup() later (the mount-state guard).
        await moduleA.cleanup();
        expect(unmountASpy).toHaveBeenCalledTimes(1);
    });

    test('a mount() that throws shows the content-error markup and logs a console.error', async () => {
        agentlet = new AgentletCore();
        await agentlet.init();

        const brokenModule = new Module({ name: 'broken-module', patterns: ['never-matches.example'] });
        brokenModule.mount = jest.fn().mockRejectedValue(new Error('mount boom'));
        agentlet.moduleRegistry.activeModule = brokenModule;

        await agentlet.updateModuleContent('refresh');

        expect(agentlet.ui.content.innerHTML).toContain('agentlet-error');
        expect(console.error).toHaveBeenCalledWith('Error rendering module content:', expect.any(Error));
        // A failed mount is never recorded as the mounted module.
        expect(agentlet.mountedModule).toBe(null);
    });

    test('a duck-typed module without mount()/unmount() still renders via getContent()', async () => {
        agentlet = new AgentletCore();
        await agentlet.init();

        const legacyModule = {
            name: 'legacy-module',
            getContent: () => '<div class="legacy-content">legacy</div>',
            cleanup: jest.fn().mockResolvedValue(undefined)
        };
        agentlet.moduleRegistry.activeModule = legacyModule;

        await agentlet.updateModuleContent('refresh');

        expect(agentlet.ui.content.innerHTML).toContain('legacy-content');
        // No mount/unmount API on this module, so it is never tracked as mounted.
        expect(agentlet.mountedModule).toBe(null);
    });

    test('shadowDom: false gives context.root === document.body', async () => {
        agentlet = new AgentletCore({ shadowDom: false });
        await agentlet.init();

        const testModule = new Module({ name: 'legacy-ui-module', patterns: ['never-matches.example'] });
        const mountSpy = jest.spyOn(testModule, 'mount');
        agentlet.moduleRegistry.activeModule = testModule;

        await agentlet.updateModuleContent('refresh');

        expect(mountSpy).toHaveBeenCalledTimes(1);
        expect(mountSpy.mock.calls[0][1].root).toBe(document.body);
    });

    test('cleanup() unmounts the mounted module and clears mountedModule', async () => {
        agentlet = new AgentletCore();
        await agentlet.init();

        const testModule = new Module({ name: 'cleanup-module', patterns: ['never-matches.example'] });
        const unmountSpy = jest.spyOn(testModule, 'unmount');
        agentlet.moduleRegistry.register(testModule);
        agentlet.moduleRegistry.activeModule = testModule;

        await agentlet.updateModuleContent('refresh');
        expect(agentlet.mountedModule).toBe(testModule);

        await agentlet.cleanup();

        expect(unmountSpy).toHaveBeenCalledTimes(1);
        expect(agentlet.mountedModule).toBe(null);
    });
});
