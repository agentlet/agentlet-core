(function() {
    'use strict';

    // Define the minimal module class
    class {{pascalCase name}}Agentlet extends window.agentlet.Module {
        constructor() {
            super({
                name: '{{kebabCase name}}',
                patterns: ['localhost', '127.0.0.1', 'file://'],
                description: 'A minimal agentlet for {{name}}',
                version: '1.0.0'
            });
        }

        async activateModule(context = {}) {
            console.log(`Activating {{name}} agentlet`, context);

            // Your activation logic goes here
            if (context.trigger === 'urlChange') {
                console.log(`URL changed from ${context.oldUrl} to ${context.newUrl}`);
            }
        }

        getContent() {
            return `
            <div class="agentlet-{{kebabCase name}}-content">
                <h3>Hello from {{titleCase name}}!</h3>
                <p>This is a minimal agentlet template.</p>
                <button onclick="{{camelCase name}}ShowDialog()">Try Dialog API</button>
            </div>
            `;
        }

        getStyles() {
            return `
                .agentlet-{{kebabCase name}}-content button {
                    padding: 8px 16px;
                    margin: 10px 0;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .agentlet-{{kebabCase name}}-content button:hover {
                    background: #0056b3;
                }
            `;
        }
    }

    // Make the module class available globally
    window.{{camelCase name}}AgentletModule = {{pascalCase name}}Agentlet;

    // Simple dialog demo function
    window.{{camelCase name}}ShowDialog = function() {
        const Dialog = window.agentlet?.utils?.Dialog;
        if (Dialog) {
            Dialog.show('info', {
                title: 'It Works!',
                message: 'Your minimal agentlet is working perfectly. You can now extend it with more features.',
                icon: '✅',
                buttons: [
                    { text: 'Great!', value: 'ok', primary: true }
                ]
            });
        } else {
            // Fallback if Dialog not available
            alert('It works! (Dialog API not available)');
        }
    };

    // Return the module class
    return {{pascalCase name}}Agentlet;
})();