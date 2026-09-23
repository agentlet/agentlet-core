import React from 'react';
import { createRoot } from 'react-dom/client';

(function() {
    'use strict';

    // Small React panel component. Application state lives on the module
    // instance (via the `moduleInstance` prop below), not only in this
    // component's own state, so it survives a re-render triggered by a URL
    // change or a manual refresh - see "state retention across refreshes"
    // in docs/module-mount-api.md.
    function PanelApp({ moduleInstance }) {
        const [count, setCount] = React.useState(moduleInstance.count);

        React.useEffect(() => {
            moduleInstance.count = count;
        }, [count]);

        return (
            <div className="agentlet-{{kebabCase name}}-content">
                <h2>Welcome to {{titleCase name}}!</h2>
                <p>This panel is a React 18 component, mounted through <code>Module.mount()</code>.</p>
                <p>Edit <code>PanelApp</code> in this file to customize your agentlet.</p>
                <hr />
                <p>Count: <strong>{count}</strong></p>
                <button onClick={() => setCount(count + 1)}>+1</button>
            </div>
        );
    }

    // Define the module class
    class {{pascalCase name}}Agentlet extends window.agentlet.Module {
        constructor() {
            super({
                name: '{{kebabCase name}}',
                patterns: ['localhost', '127.0.0.1', 'file://'],
                matchMode: 'includes',
                description: 'A sample React agentlet for {{name}}',
                version: '1.0.0'
            });

            // Module-instance state, read by PanelApp on mount and written
            // back on every change so it survives across mount()/unmount()
            // cycles (see docs/module-mount-api.md).
            this.count = 0;
            this._root = null;
        }

        // Override simplified lifecycle hooks to customize behavior

        async initModule() {
            console.log(`Initializing {{name}} agentlet`);

            // Custom initialization logic goes here
            // Example: Setup event listeners, configure settings, etc.
        }

        async activateModule(context = {}) {
            console.log(`Activating {{name}} agentlet`, context);

            // Custom activation logic goes here
            // Example: Respond to URL changes, handle page navigation, etc.
            if (context.trigger === 'urlChange') {
                console.log(`URL changed from ${context.oldUrl} to ${context.newUrl}`);
            }
        }

        // Mount a React 18 root into the panel container instead of
        // rendering an HTML string from getContent(). Called by the core
        // on every content update (init, module/URL change, refresh) - see
        // context.trigger and docs/module-mount-api.md.
        async mount(container) {
            this._root = createRoot(container);
            this._root.render(<PanelApp moduleInstance={this} />);
        }

        // Tear down the React root created in mount(). The core clears the
        // container's own content afterwards, so nothing else is needed here.
        async unmount() {
            this._root?.unmount();
            this._root = null;
        }

        async cleanupModule(context = {}) {
            console.log(`Cleaning up {{name}} agentlet`, context);

            // Custom cleanup logic goes here
            // Example: Remove event listeners, save state, cleanup resources, etc.
        }
    }

    // Make the module class available globally for registry to instantiate
    window.{{camelCase name}}AgentletModule = {{pascalCase name}}Agentlet;

    // Return the module class for ScriptInjector
    return {{pascalCase name}}Agentlet;
})();
