(function() {
    'use strict';
    
    // Define the module class
    class {{pascalCase name}}Agentlet extends window.agentlet.Module {
        constructor() {
            super({
                name: '{{kebabCase name}}',
                patterns: ['localhost', '127.0.0.1', 'file://'],
                matchMode: 'includes',
                description: 'A sample agentlet for {{name}}',
                version: '1.0.0'
            });
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
        
        async cleanupModule(context = {}) {
            console.log(`Cleaning up {{name}} agentlet`, context);
            
            // Custom cleanup logic goes here
            // Example: Remove event listeners, save state, cleanup resources, etc.
        }

        // Example: Override getPanelTitle to provide a dynamic title
        // getPanelTitle() {
        //     return 'Custom assistant: ' + new Date().toLocaleTimeString();
        // }

        getContent() {
            return `
            <div class="agentlet-{{kebabCase name}}-content">
                <h2>Welcome to {{titleCase name}}!</h2>
                <p>This is a sample agentlet running on localhost.</p>
                <p>You can find this file at &#96;src/index.js&#96;.</p>
                <p>Edit this file to customize your agentlet.</p>
                <hr/>
                <button id="agentlet-btn-input" onclick="{{camelCase name}}AgentletAction('input')">Input Dialog</button>
                <button id="agentlet-btn-info" onclick="{{camelCase name}}AgentletAction('info')">Info Dialog</button>
                <button id="agentlet-btn-bubble" onclick="{{camelCase name}}AgentletAction('bubble')">Message Bubble</button>
                <button id="agentlet-btn-wait" onclick="{{camelCase name}}AgentletAction('wait')">Wait Dialog</button>
                <button id="agentlet-btn-progress" onclick="{{camelCase name}}AgentletAction('progress')">Progress Bar</button>
                <button id="agentlet-btn-selector" onclick="{{camelCase name}}AgentletAction('selector')">Element Selector</button>
                <button id="agentlet-btn-extract-table" onclick="{{camelCase name}}AgentletAction('extract-table')">Extract Table</button>
            </div>
            `;
        }

        getStyles() {
            return `
                .agentlet-{{kebabCase name}}-content > h2 {
                    font-size: 18px;
                }
                .agentlet-{{kebabCase name}}-content > p {
                    font-size: 12px;
                }
                .agentlet-{{kebabCase name}}-content > button {
                    padding: 8px 14px;
                    margin: 5px 3px;
                }
                    .agentlet-{{kebabCase name}}-content > hr {
                    margin: 15px 0px;
                }
            `;
        }

        showHelp() {
            const Dialog = window.agentlet?.utils?.Dialog;
            if (Dialog) {
                Dialog.show('info', {
                    title: 'Help for {{titleCase name}}',
                    message: `
                        <h4>About {{titleCase name}}</h4>
                        <p><strong>Version:</strong> 1.0.0</p>
                    `,
                    icon: '❓',
                    allowHtml: true,
                });
            }
        }

        // You can also override the showSettings() method to show a custom settings dialog
    }

    // Make the module class available globally for registry to instantiate
    window.{{camelCase name}}AgentletModule = {{pascalCase name}}Agentlet;
    
    // Also expose the action function globally
    window.{{camelCase name}}AgentletAction = function(action) {
        const MessageBubble = window.agentlet?.utils?.MessageBubble;
        const Dialog = window.agentlet?.utils?.Dialog;
        const ElementSelector = window.agentlet?.utils?.ElementSelector;
        const ScreenCapture = window.agentlet?.utils?.ScreenCapture;

        switch(action) {
            case 'input':
                if (Dialog) {
                    console.log('💬 Opening input dialog...');

                    Dialog.promptTextarea(
                        'Enter a multi-line message:',
                        'Hello world!\nThis is a test message.\n\nWhat do you think?',
                        5,
                        (result) => {
                            if (result !== null) {
                                console.log('💬 User entered text:', result);
                                alert(`Message received (${result.length} characters):\n\n${result}`);
                            } else {
                                console.log('💬 User cancelled text input');
                            }
                        }
                    );
                } else {
                    alert('Input dialog not available');
                }
                break;
            case 'info':
                if (Dialog) {
                    console.log('📋 Opening info dialog...');

                    Dialog.show('info', {
                        title: 'Custom Dialog',
                        message: `
                            <h4>Rich Content Example</h4>
                            <p>This dialog supports <strong>HTML content</strong>!</p>
                            <ul>
                                <li>✅ Bold text</li>
                                <li>✅ Lists</li>
                                <li>✅ Links: <a href="#" onclick="alert('Link clicked!')">Click me</a></li>
                                <li>✅ Custom styling</li>
                            </ul>
                            <p><em>Current time: ${new Date().toLocaleTimeString()}</em></p>
                        `,
                        icon: '🎨',
                        allowHtml: true,
                        buttons: [
                            { text: 'Close', value: 'close', secondary: true },
                            { text: 'Like It!', value: 'like', primary: true, icon: '👍' }
                        ]
                    }, (result) => {
                        console.log('📋 Custom dialog result:', result);
                        if (result === 'like') {
                            Dialog.success('Thanks for the feedback!', 'Appreciated! 🙏');
                        }
                    });
                } else {
                    alert('Info dialog not available');
                }
                break;
            case 'bubble':
                if (MessageBubble) {
                    console.log('💬 Showing message bubbles...');
                    

                    // Different types showcase
                    MessageBubble.info('Here are different message types:');
                    
                    setTimeout(() => MessageBubble.success('Success message!'), 800);
                    setTimeout(() => MessageBubble.warning('Warning message!'), 1600);
                    setTimeout(() => MessageBubble.error('Error message!'), 2400);
                    setTimeout(() => MessageBubble.custom('Custom message!', { 
                        icon: '🎨',
                        style: { background: '#f0f9ff', color: '#0369a1' }
                    }), 3200);

                    MessageBubble.show({
                        title: 'Rich Content Bubble',
                        message: '<strong>HTML supported!</strong><br>You can include <em>formatting</em>, <a href="#" onclick="alert(\'Link clicked!\')">links</a>, and more!',
                        type: 'custom',
                        icon: '🎨',
                        allowHtml: true,
                        duration: 0,
                        closable: true,
                        style: {
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            color: 'white',
                            border: 'none'
                        },
                        onClick: () => {
                            MessageBubble.success('Bubble clicked!', { duration: 2000 });
                        }
                    });

                } else {
                    alert('Message bubble not available');
                }
                break;
            case 'wait':
                if (Dialog) {
                    console.log('⏳ Starting wait dialog demo...');
                    
                    // AI Processing Demo
                    Dialog.showAIProcessing('Analyzing page content and extracting key information...', true, () => {
                        MessageBubble.info('AI processing was cancelled by user');
                    });
                    
                    // Simulate AI processing steps
                    setTimeout(() => {
                        Dialog.updateMessage('Processing text content...');
                    }, 2000);
                    
                    setTimeout(() => {
                        Dialog.updateMessage('Analyzing structure...');
                    }, 4000);
                    
                    setTimeout(() => {
                        Dialog.updateMessage('Generating insights...');
                    }, 6000);
                    
                    setTimeout(() => {
                        Dialog.hide();
                        Dialog.success('AI analysis completed! Found 42 insights and 17 action items.', 'Processing Complete');
                    }, 8000);

                } else {
                    alert('Wait dialog not available');
                }
                break;
            case 'progress':
                if (Dialog) {
                    console.log('📊 Starting progress bar demo...');

                    // Batch processing demo
                    const totalItems = 250;
                    let processedItems = 0;
                    
                    const progress = Dialog.showBatchProgress(totalItems, {
                        title: 'Batch Processing',
                        closable: true,
                        onCancel: () => {
                            MessageBubble.info(`Processing stopped. ${processedItems} of ${totalItems} items completed.`);
                        }
                    });
                    
                    const batchInterval = setInterval(() => {
                        const batchSize = Math.floor(Math.random() * 10) + 1;
                        processedItems += batchSize;
                        
                        if (processedItems > totalItems) {
                            processedItems = totalItems;
                            clearInterval(batchInterval);
                        }
                        
                        const percentage = (processedItems / totalItems) * 100;
                        progress.updateProgress(percentage, `Processing ${processedItems} of ${totalItems} items...`);
                        
                        if (processedItems >= totalItems) {
                            progress.completeProgress('All items processed!');
                        }
                    }, 300);
                    
                } else {
                    alert('Progress dialog not available');
                }
                break;
            case 'selector':
                if (ElementSelector) {
                    console.log('🎯 Starting element selector...');
                    // Create a new instance to avoid callback conflicts
                    const ElementSelectorClass = window.agentlet.ElementSelectorClass;
                    const elementSelector = new ElementSelectorClass();
                    elementSelector.start((element, info) => {
                        
                        // Show selection result with screenshot option
                        try {
                            Dialog.show('info', {
                                title: 'Element Selected',
                                message: `<p><strong>Element:</strong> ${info.tagName}${info.id ? '#' + info.id : ''}${info.className ? '.' + info.classes.join('.') : ''}</p>
                                            <p><strong>Text:</strong> ${info.text || 'No text'}</p>
                                            <p><strong>Dimensions:</strong> ${info.position.width}×${info.position.height}px</p>
                                            <p><strong>Position:</strong> (${info.position.x}, ${info.position.y})</p>`,
                                allowHtml: true,
                                icon: '🎯',
                                buttons: [
                                    { text: 'Screenshot', value: 'screenshot', icon: '📸', primary: true },
                                    { text: 'Details', value: 'details', icon: '📋' },
                                    { text: 'Close', value: 'close', secondary: true }
                                ]
                            }, async (result) => {
                                if (result === 'screenshot') {
                                    // Capture the selected element
                                    try {
                                        MessageBubble.loading('Capturing selected element...');
                                        const dataURL = await ScreenCapture.captureAsDataURL(element, { 
                                            backgroundColor: '#ffffff',
                                            scale: 2 // Higher quality
                                        });
                                        MessageBubble.hideAll();
                                        
                                        // Show screenshot preview
                                        const preview = ScreenCapture.createPreview(dataURL, { 
                                            maxWidth: 400, 
                                            maxHeight: 300 
                                        });
                                        
                                        Dialog.show('info', {
                                            title: 'Element Screenshot',
                                            message: `<p>Screenshot of <strong>${info.tagName}${info.id ? '#' + info.id : ''}</strong></p>
                                                        <div style="text-align: center; margin: 15px 0;"></div>
                                                        <p><small>Size: ${info.position.width}×${info.position.height}px | Quality: 2x scale</small></p>`,
                                            allowHtml: true,
                                            icon: '📸',
                                            buttons: [
                                                { text: 'Download', value: 'download', icon: '💾', primary: true },
                                                { text: 'Copy to Clipboard', value: 'copy', icon: '📋' },
                                                { text: 'Close', value: 'close', secondary: true }
                                            ]
                                        }, async (screenshotResult) => {
                                            if (screenshotResult === 'download') {
                                                await ScreenCapture.downloadCapture(element, { 
                                                    filename: `element-${info.tagName.toLowerCase()}${info.id ? '-' + info.id : ''}.png`,
                                                    backgroundColor: '#ffffff',
                                                    scale: 2
                                                });
                                            } else if (screenshotResult === 'copy') {
                                                try {
                                                    await ScreenCapture.copyToClipboard(element, { 
                                                        backgroundColor: '#ffffff',
                                                        scale: 2
                                                    });
                                                    MessageBubble.success('Element screenshot copied to clipboard!');
                                                } catch (error) {
                                                    MessageBubble.warning('Clipboard not supported: ' + error.message);
                                                }
                                            }
                                        });
                                        
                                        // Insert preview into dialog
                                        setTimeout(() => {
                                            const messageEl = document.querySelector('#agentlet-info-dialog div div');
                                            if (messageEl) {
                                                const previewContainer = messageEl.querySelector('div');
                                                if (previewContainer) {
                                                    previewContainer.appendChild(preview);
                                                }
                                            }
                                        }, 100);
                                        
                                    } catch (error) {
                                        MessageBubble.hideAll();
                                        MessageBubble.error('Element capture failed: ' + error.message);
                                    }
                                } else if (result === 'details') {
                                    // Show detailed element info
                                    Dialog.info(
                                        `Tag: ${info.tagName}\nID: ${info.id || 'None'}\nClasses: ${info.classes.join(', ') || 'None'}\nText: ${info.text || 'None'}\nHTML: ${element.outerHTML.substring(0, 200)}${element.outerHTML.length > 200 ? '...' : ''}\nPosition: (${info.position.x}, ${info.position.y})\nSize: ${info.position.width}×${info.position.height}px`,
                                        'Element Details'
                                    );
                                }
                            });
                        } catch (error) {
                            console.error('🎯 Error showing Dialog:', error);
                            // Fallback to simple alert
                            const choice = confirm(`Selected: ${info.tagName}${info.id ? '#' + info.id : ''}\nDimensions: ${info.position.width}×${info.position.height}px\n\nTake screenshot?`);
                            if (choice && ScreenCapture) {
                                ScreenCapture.captureAsDataURL(element).then(dataURL => {
                                    ScreenCapture.downloadCapture(element, { filename: `element-${info.tagName.toLowerCase()}.png` });
                                }).catch(err => {
                                    alert('Screenshot failed: ' + err.message);
                                });
                            }
                        }
                        
                        // Add visual indicator to selected element
                        const indicator = document.createElement('div');
                        indicator.style.cssText = `
                            position: absolute;
                            left: ${info.position.x}px;
                            top: ${info.position.y}px;
                            width: ${info.position.width}px;
                            height: ${info.position.height}px;
                            border: 3px solid #ff6b6b;
                            background: rgba(255, 107, 107, 0.1);
                            pointer-events: none;
                            z-index: 999996;
                            animation: pulse 2s infinite;
                        `;
                        
                        // Add CSS animation
                        if (!document.getElementById('agentlet-selector-animation')) {
                            const style = document.createElement('style');
                            style.id = 'agentlet-selector-animation';
                            style.textContent = `
                                @keyframes pulse {
                                    0% { opacity: 1; transform: scale(1); }
                                    50% { opacity: 0.5; transform: scale(1.02); }
                                    100% { opacity: 1; transform: scale(1); }
                                }
                            `;
                            document.head.appendChild(style);
                        }
                        
                        document.body.appendChild(indicator);
                        
                        // Remove indicator after 10 seconds or when dialog closes
                        const removeIndicator = () => indicator.remove();
                        setTimeout(removeIndicator, 10000);
                        
                        // Also remove when any dialog closes
                        const checkForDialog = setInterval(() => {
                            if (!document.getElementById('agentlet-info-dialog')) {
                                removeIndicator();
                                clearInterval(checkForDialog);
                            }
                        }, 500);
                    });
                } else {
                    alert('Element selector not available');
                }
                break;
            case 'extract-table':
                if (ElementSelector && window.agentlet.tables) {
                    console.log('🎯 Starting table extraction...');
                    // Create a new instance to avoid callback conflicts
                    const ElementSelectorClass = window.agentlet.ElementSelectorClass;
                    const elementSelector = new ElementSelectorClass();
                    elementSelector.start((tableElement, info) => {
                        // Extract and download in one operation
                        window.agentlet.tables.extractAndDownload(tableElement, {
                            includePagination: true,
                            filename: 'complete-data.xlsx'
                        });
                    }, {
                        selector: 'table',
                        message: 'Hover over any part of a table to highlight it, then click or press Enter to select it for extraction'
                    });
                } else {
                    alert('Element selector or table extraction not available');
                }
                break;
        }
    };
    
    // Return the module class for ScriptInjector
    return {{pascalCase name}}Agentlet;
})();