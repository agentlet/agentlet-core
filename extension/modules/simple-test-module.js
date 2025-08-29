/**
 * Simple Test Module - Agentlet Core Example
 * Demonstrates the simplified lifecycle hooks (init, activate, cleanup)
 * This module shows best practices for the new 3-hook lifecycle system
 */

(function() {
    'use strict';
    
    // Prevent multiple loads
    if (window.SimpleTestModuleLoaded) {
        console.log('🧪 Simple Test Module already loaded');
        return;
    }
    window.SimpleTestModuleLoaded = true;

    // Simple module implementation
    function createSimpleTestModule() {
        return {
            name: 'simple-test',
            version: '1.0.0',
            patterns: ['localhost', '127.0.0.1', 'file://'],
            isActive: false,
            eventBus: null,

            checkPattern: function(url) {
                return this.patterns.some(pattern => url.includes(pattern));
            },

            // Simplified lifecycle hooks - only 3 methods needed!
            
            init: async function() {
                console.log('🧪 Simple Test Module initializing...');
                this.isActive = true;
                console.log('🧪 Simple Test Module initialized');
            },

            activate: async function(context = {}) {
                console.log('🧪 Simple Test Module activating...', context);
                if (context.trigger === 'urlChange') {
                    console.log(`🧪 URL changed from ${context.oldUrl} to ${context.newUrl}`);
                }
            },

            cleanup: async function() {
                console.log('🧪 Simple Test Module cleaning up...');
                this.isActive = false;
            },

            getContent: function() {
                const $ = window.agentlet?.$;
                const formCount = $('form').length;
                const linkCount = $('a').length;
                
                return `
                    <div class="agentlet-module-content" data-module="${this.name}">
                        <div class="agentlet-module-header">
                            <h3>🧪 Simple Test Module</h3>
                            <span class="agentlet-module-version">v${this.version}</span>
                        </div>
                        <div class="agentlet-module-body">
                            <p><strong>Status:</strong> <span style="color: ${this.isActive ? '#28a745' : '#dc3545'}">${this.isActive ? '✅ Active' : '❌ Inactive'}</span></p>
                            <p><strong>Page Title:</strong> ${$('title').text()}</p>
                            <p><strong>URL:</strong> ${window.location.href}</p>
                            <p><strong>Forms:</strong> ${formCount}</p>
                            <p><strong>Links:</strong> ${linkCount}</p>
                        </div>
                        <div class="agentlet-module-actions">
                            <button class="agentlet-btn" onclick="window.testModuleAction('alert')">
                                🚨 Test Alert
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('input')">
                                💬 Input Dialog
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('info')">
                                📋 Info Dialog
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('bubble')">
                                💬 Message Bubble
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('jquery')">
                                💎 jQuery Demo
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('log')">
                                📝 Log Info
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('selector')">
                                🎯 Select Element
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('selector-forms')">
                                📋 Select Form
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('selector-inputs')">
                                📝 Select Input
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('screenshot')">
                                📸 Screenshot
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('wait')">
                                ⏳ Wait Dialog
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('progress')">
                                📊 Progress Bar
                            </button>
                            <button class="agentlet-btn agentlet-btn-secondary" onclick="window.testModuleAction('refresh')">
                                🔄 Refresh
                            </button>
                        </div>
                    </div>
                `;
            },

            getMetadata: function() {
                return {
                    name: this.name,
                    version: this.version,
                    isActive: this.isActive,
                    patterns: this.patterns
                };
            },

            updatedURL: async function(newUrl) {
                console.log(`🧪 Simple Test Module: URL updated to ${newUrl}`);
            }
        };
    }

    // Global action handler
    window.testModuleAction = function(action) {
        switch(action) {
            case 'alert':
                alert('Hello from Simple Test Module! ✅');
                break;
            case 'input':
                if (window.agentlet?.utils?.Dialog) {
                    console.log('💬 Opening input dialog...');
                    
                    // Demo different input dialog types
                    const demos = [
                        () => {
                            window.agentlet.utils.Dialog.prompt(
                                'What is your name?',
                                'John Doe',
                                (result) => {
                                    if (result !== null) {
                                        console.log('💬 User entered name:', result);
                                        alert(`Hello, ${result}! 👋`);
                                    } else {
                                        console.log('💬 User cancelled name input');
                                    }
                                }
                            );
                        },
                        () => {
                            window.agentlet.utils.Dialog.promptEmail(
                                'Enter your email address for testing:',
                                'user@example.com',
                                (result) => {
                                    if (result !== null) {
                                        console.log('💬 User entered email:', result);
                                        alert(`Email saved: ${result} 📧`);
                                    } else {
                                        console.log('💬 User cancelled email input');
                                    }
                                }
                            );
                        },
                        () => {
                            window.agentlet.utils.Dialog.show('input', {
                                title: 'Custom Dialog',
                                message: 'Enter a number between 1 and 100:',
                                placeholder: '42',
                                inputType: 'number'
                            }, (result) => {
                                if (result !== null) {
                                    const num = parseInt(result);
                                    console.log('💬 User entered number:', num);
                                    if (num >= 1 && num <= 100) {
                                        alert(`Great choice: ${num}! 🎯`);
                                    } else {
                                        alert(`${num} is not between 1 and 100! 😅`);
                                    }
                                } else {
                                    console.log('💬 User cancelled number input');
                                }
                            });
                        },
                        () => {
                            window.agentlet.utils.Dialog.promptTextarea(
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
                        },
                        () => {
                            window.agentlet.utils.Dialog.promptAI(
                                'What would you like the AI to help you with?',
                                'Analyze this webpage and tell me the main topics discussed',
                                (result) => {
                                    if (result !== null) {
                                        console.log('💬 AI Prompt:', result);
                                        alert(`AI Prompt received! 🤖\n\nPrompt: "${result}"\n\n(This would normally be sent to an AI service)`);
                                    } else {
                                        console.log('💬 User cancelled AI prompt');
                                    }
                                }
                            );
                        }
                    ];
                    
                    // Randomly pick a demo
                    const randomDemo = demos[Math.floor(Math.random() * demos.length)];
                    randomDemo();
                } else {
                    alert('Input dialog not available');
                }
                break;
            case 'info':
                if (window.agentlet?.utils?.Dialog) {
                    console.log('📋 Opening info dialog...');
                    
                    const Dialog = window.agentlet.utils.Dialog;
                    
                    // Demo different info dialog types
                    const demos = [
                        () => {
                            Dialog.info(
                                'This is a simple information dialog. You can display any message here.',
                                'Information Demo',
                                (result) => {
                                    console.log('📋 Info dialog result:', result);
                                }
                            );
                        },
                        () => {
                            Dialog.success(
                                'Operation completed successfully! Your data has been saved.',
                                'Success!',
                                (result) => {
                                    console.log('📋 Success dialog result:', result);
                                }
                            );
                        },
                        () => {
                            Dialog.warning(
                                'This action may have unintended consequences. Please proceed with caution.',
                                'Warning',
                                (result) => {
                                    console.log('📋 Warning dialog result:', result);
                                }
                            );
                        },
                        () => {
                            Dialog.confirm(
                                'Are you sure you want to continue with this action? This cannot be undone.',
                                'Confirm Action',
                                (result) => {
                                    console.log('📋 Confirm dialog result:', result);
                                    if (result === 'ok') {
                                        Dialog.success('Action confirmed!', 'Done');
                                    } else {
                                        Dialog.info('Action cancelled.', 'Cancelled');
                                    }
                                }
                            );
                        },
                        () => {
                            Dialog.yesNo(
                                'Do you want to enable advanced features for this module?',
                                'Enable Advanced Features?',
                                (result) => {
                                    console.log('📋 Yes/No dialog result:', result);
                                    if (result === 'yes') {
                                        Dialog.success('Advanced features enabled!', 'Enabled');
                                    } else {
                                        Dialog.info('Keeping basic features only.', 'Basic Mode');
                                    }
                                }
                            );
                        },
                        () => {
                            Dialog.choice(
                                'What would you like to do next?',
                                [
                                    { text: 'Save Draft', value: 'draft', icon: '💾' },
                                    { text: 'Preview', value: 'preview', icon: '👁️' },
                                    { text: 'Publish', value: 'publish', icon: '🚀' },
                                    { text: 'Cancel', value: 'cancel', icon: '❌' }
                                ],
                                'Choose Action',
                                (result) => {
                                    console.log('📋 Choice dialog result:', result);
                                    switch(result) {
                                        case 'draft':
                                            Dialog.success('Draft saved!', 'Saved');
                                            break;
                                        case 'preview':
                                            Dialog.info('Opening preview...', 'Preview');
                                            break;
                                        case 'publish':
                                            Dialog.success('Published successfully!', 'Published');
                                            break;
                                        case 'cancel':
                                            Dialog.info('Action cancelled.', 'Cancelled');
                                            break;
                                    }
                                }
                            );
                        },
                        () => {
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
                        }
                    ];
                    
                    // Randomly pick a demo
                    const randomDemo = demos[Math.floor(Math.random() * demos.length)];
                    randomDemo();
                } else {
                    alert('Info dialog not available');
                }
                break;
            case 'bubble':
                if (window.agentlet?.utils?.MessageBubble) {
                    console.log('💬 Showing message bubbles...');
                    
                    const MessageBubble = window.agentlet.utils.MessageBubble;
                    
                    // Demo different bubble types with a sequence
                    const demos = [
                        () => {
                            // Simple toast sequence
                            MessageBubble.toast('This is a simple toast message!', 'info', 3000);
                            
                            setTimeout(() => {
                                MessageBubble.success('Toast completed!', { duration: 2000 });
                            }, 1500);
                        },
                        () => {
                            // Different types showcase
                            MessageBubble.info('Here are different message types:');
                            
                            setTimeout(() => MessageBubble.success('Success message!'), 800);
                            setTimeout(() => MessageBubble.warning('Warning message!'), 1600);
                            setTimeout(() => MessageBubble.error('Error message!'), 2400);
                            setTimeout(() => MessageBubble.custom('Custom message!', { 
                                icon: '🎨',
                                style: { background: '#f0f9ff', color: '#0369a1' }
                            }), 3200);
                        },
                        () => {
                            // Persistent notifications
                            const id1 = MessageBubble.notify('This is a persistent notification', 'info', 'Persistent Message');
                            const id2 = MessageBubble.notify('Another persistent one with close button', 'warning', 'Warning!');
                            
                            // Auto-close them after 8 seconds for demo
                            setTimeout(() => {
                                MessageBubble.hide(id1);
                                MessageBubble.hide(id2);
                            }, 8000);
                        },
                        () => {
                            // Loading sequence
                            const loadingId = MessageBubble.loading('Processing your request...');
                            
                            setTimeout(() => {
                                MessageBubble.hide(loadingId);
                                MessageBubble.success('Processing completed!', { duration: 3000 });
                            }, 3000);
                        },
                        () => {
                            // HTML content and interactions
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
                        },
                        () => {
                            // Position demo
                            MessageBubble.show({
                                message: 'This bubble is in bottom-left!',
                                type: 'info',
                                position: 'bottom-left',
                                duration: 4000
                            });
                            
                            setTimeout(() => {
                                MessageBubble.show({
                                    message: 'This one is in top-left!',
                                    type: 'success',
                                    position: 'top-left',
                                    duration: 4000
                                });
                            }, 1000);
                            
                            setTimeout(() => {
                                MessageBubble.show({
                                    message: 'Back to top-right!',
                                    type: 'warning',
                                    position: 'top-right',
                                    duration: 4000
                                });
                            }, 2000);
                        },
                        () => {
                            // Multiple bubbles with actions
                            MessageBubble.show({
                                title: 'Action Required',
                                message: 'Please review the following items and take action.',
                                type: 'warning',
                                duration: 0,
                                closable: true,
                                onClick: () => {
                                    MessageBubble.success('Action taken!', { duration: 2000 });
                                }
                            });
                            
                            setTimeout(() => {
                                MessageBubble.show({
                                    title: 'Update Available',
                                    message: 'A new version is available. Click to update.',
                                    type: 'info',
                                    icon: '🔄',
                                    duration: 0,
                                    closable: true,
                                    onClick: () => {
                                        const updateId = MessageBubble.loading('Updating...');
                                        setTimeout(() => {
                                            MessageBubble.hide(updateId);
                                            MessageBubble.success('Update completed!', { duration: 3000 });
                                        }, 2000);
                                    }
                                });
                            }, 1000);
                        }
                    ];
                    
                    // Randomly pick a demo
                    const randomDemo = demos[Math.floor(Math.random() * demos.length)];
                    randomDemo();
                    
                    // Show instruction bubble
                    setTimeout(() => {
                        MessageBubble.info(`Demo complete! Currently ${MessageBubble.getCount()} bubbles shown.`, {
                            duration: 4000,
                            title: 'Bubble Demo'
                        });
                    }, 500);
                    
                } else {
                    alert('Message bubble not available');
                }
                break;
            case 'jquery':
                if (window.agentlet?.$) {
                    console.log('💎 Running jQuery demos...');
                    
                    const $ = window.agentlet.$;
                    
                    // Demo 1: Page statistics (direct jQuery)
                    const stats = {
                        elements: {
                            total: $('*').length,
                            forms: $('form').length,
                            inputs: $('input, textarea, select').length,
                            buttons: $('button, input[type="button"], input[type="submit"]').length,
                            links: $('a[href]').length,
                            images: $('img').length
                        },
                        text: {
                            words: $(document.body).text().split(/\s+/).filter(word => word.length > 0).length
                        }
                    };
                    console.log('📊 Page Statistics:', stats);
                    
                    // Demo 2: Find and highlight all buttons
                    const $buttons = $('button');
                    console.log(`💎 Found ${$buttons.length} buttons on the page`);
                    
                    // Demo 3: Highlight all forms temporarily (simple highlighting)
                    $('form').each((i, form) => {
                        const $form = $(form);
                        const originalBorder = $form.css('border');
                        $form.css({
                            'border': '2px solid #28a745',
                            'transition': 'border 0.3s ease'
                        });
                        setTimeout(() => {
                            $form.css('border', originalBorder);
                        }, 2000);
                    });
                    
                    // Demo 4: Get form data (using agentlet form utilities)
                    let formsData = [];
                    if (window.agentlet.forms) {
                        $('form').each((i, form) => {
                            try {
                                const formData = window.agentlet.forms.quickExport(form);
                                formsData.push({ formIndex: i, fields: formData });
                            } catch (e) {
                                console.warn('Could not extract form data:', e);
                            }
                        });
                    }
                    console.log('📝 Forms Data:', formsData);
                    
                    // Demo 5: Find elements by text (direct jQuery)
                    const $submitButtons = $('*').filter(function() {
                        return $(this).text().toLowerCase().includes('submit');
                    });
                    console.log(`🔍 Found ${$submitButtons.length} elements containing "submit"`);
                    
                    // Demo 6: Use MessageBubble for notification
                    const MessageBubble = window.agentlet.utils.MessageBubble;
                    MessageBubble.success(
                        'jQuery is working perfectly!<br><small>Check console for detailed results</small>',
                        {
                            title: '💎 jQuery Demo',
                            allowHtml: true,
                            duration: 4000,
                            icon: '💎'
                        }
                    );
                    
                    // Demo 7: Safe operation example (direct jQuery with try-catch)
                    let safeResult;
                    try {
                        safeResult = $('nonexistent-element').length;
                    } catch (e) {
                        safeResult = 'Operation failed safely';
                        console.warn('Safe operation caught error:', e);
                    }
                    
                    console.log('🛡️ Safe operation result:', safeResult);
                    
                    // Use InfoDialog instead of alert
                    Dialog.success(
                        `• Found ${stats.elements.total} total elements\n<br/>• Found ${stats.elements.forms} forms\n<br/>• Found ${stats.text.words} words\n• Found ${stats.elements.links} links\n<br/>• Found ${stats.elements.images} images\n\nCheck console for detailed results!`,
                        'jQuery Demo Complete! 💎',
                        (result) => {
                            console.log('💎 jQuery demo dialog closed:', result);
                        }
                    );
                    
                } else {
                    alert('jQuery not available');
                }
                break;
            case 'log':
                const $ = window.agentlet.$;
                console.log('🧪 Page Info:', {
                    title: $('title').text(),
                    url: window.location.href,
                    forms: $('form').length,
                    links: $('a').length
                });
                break;
            case 'selector':
                if (window.agentlet?.utils?.ElementSelector) {
                    console.log('🎯 Starting element selector...');
                    // Create a new instance to avoid callback conflicts
                    const ElementSelectorClass = window.agentlet.ElementSelectorClass;
                    const elementSelector = new ElementSelectorClass();
                    elementSelector.start((element, info) => {
                        const ScreenCapture = window.agentlet.utils.ScreenCapture;
                        const MessageBubble = window.agentlet.utils.MessageBubble;
                        
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
                                        const $ = window.agentlet.$;
                                        const messageEl = $('#agentlet-info-dialog div div')[0];
                                        if (messageEl) {
                                            const previewContainer = $(messageEl).find('div')[0];
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
                            console.error('🎯 Error showing InfoDialog:', error);
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
                        const $ = window.agentlet.$;
                        const indicator = $('<div>')[0];
                        indicator.style.cssText = `
                            position: absolute;
                            left: ${info.position.x}px;
                            top: ${info.position.y}px;
                            width: ${info.position.width}px;
                            height: ${info.position.height}px;
                            border: 3px solid #ff6b6b;
                            background: rgba(255, 107, 107, 0.1);
                            pointer-events: none;
                            z-index: 999999;
                            animation: pulse 2s infinite;
                        `;
                        
                        // Add CSS animation
                        if (!$('#agentlet-selector-animation').length) {
                            const style = $('<style>')[0];
                            style.id = 'agentlet-selector-animation';
                            style.textContent = `
                                @keyframes pulse {
                                    0% { opacity: 1; transform: scale(1); }
                                    50% { opacity: 0.5; transform: scale(1.02); }
                                    100% { opacity: 1; transform: scale(1); }
                                }
                            `;
                            $('head').append(style);
                        }
                        
                        $('body').append(indicator);
                        
                        // Remove indicator after 10 seconds or when dialog closes
                        const removeIndicator = () => $(indicator).remove();
                        setTimeout(removeIndicator, 10000);
                        
                        // Also remove when any dialog closes
                        const checkForDialog = setInterval(() => {
                            if (!$('#agentlet-info-dialog').length) {
                                removeIndicator();
                                clearInterval(checkForDialog);
                            }
                        }, 500);
                    });
                } else {
                    alert('Element selector not available');
                }
                break;
            case 'selector-forms':
                if (window.agentlet?.utils?.ElementSelector) {
                    console.log('🎯 Starting form selector...');
                    // Create a new instance to avoid callback conflicts
                    const ElementSelectorClass = window.agentlet.ElementSelectorClass;
                    const elementSelector = new ElementSelectorClass();
                    elementSelector.start((element, info) => {
                        const ScreenCapture = window.agentlet.utils.ScreenCapture;
                        
                        Dialog.show('info', {
                            title: 'Form Selected',
                            message: `<p><strong>Form:</strong> ${info.tagName}${info.id ? '#' + info.id : ''}${info.className ? '.' + info.classes.join('.') : ''}</p>
                                     <p><strong>Action:</strong> ${element.action || 'Not specified'}</p>
                                     <p><strong>Method:</strong> ${element.method || 'GET'}</p>
                                     <p><strong>Fields:</strong> ${element.querySelectorAll('input, select, textarea').length}</p>`,
                            allowHtml: true,
                            icon: '📋',
                            buttons: [
                                { text: 'Screenshot', value: 'screenshot', icon: '📸', primary: true },
                                { text: 'Analyze', value: 'analyze', icon: '🔍' },
                                { text: 'Close', value: 'close', secondary: true }
                            ]
                        }, async (result) => {
                            if (result === 'screenshot') {
                                try {
                                    await ScreenCapture.downloadCapture(element, { 
                                        filename: `form-${info.id || 'unnamed'}.png`,
                                        backgroundColor: '#ffffff',
                                        scale: 2
                                    });
                                } catch (error) {
                                    alert('Screenshot failed: ' + error.message);
                                }
                            } else if (result === 'analyze') {
                                const fields = Array.from(element.querySelectorAll('input, select, textarea'));
                                const fieldInfo = fields.map(field => `${field.type || field.tagName}: ${field.name || field.id || 'unnamed'}`).join('\\n');
                                Dialog.info(`Form Analysis:\\n\\nFields (${fields.length}):\\n${fieldInfo}`, 'Form Analysis');
                            }
                        });
                    }, { 
                        selector: 'form',
                        message: 'Click on a form to select it'
                    });
                } else {
                    alert('Element selector not available');
                }
                break;
            case 'selector-inputs':
                if (window.agentlet?.utils?.ElementSelector) {
                    console.log('🎯 Starting input selector...');
                    // Create a new instance to avoid callback conflicts
                    const ElementSelectorClass = window.agentlet.ElementSelectorClass;
                    const elementSelector = new ElementSelectorClass();
                    elementSelector.start((element, info) => {
                        const ScreenCapture = window.agentlet.utils.ScreenCapture;
                        
                        Dialog.show('info', {
                            title: 'Input Selected',
                            message: `<p><strong>Input:</strong> ${info.tagName}${info.id ? '#' + info.id : ''}${info.className ? '.' + info.classes.join('.') : ''}</p>
                                     <p><strong>Type:</strong> ${element.type || 'text'}</p>
                                     <p><strong>Name:</strong> ${element.name || 'Not specified'}</p>
                                     <p><strong>Value:</strong> ${element.value || 'Empty'}</p>
                                     <p><strong>Required:</strong> ${element.required ? 'Yes' : 'No'}</p>`,
                            allowHtml: true,
                            icon: '📝',
                            buttons: [
                                { text: 'Screenshot', value: 'screenshot', icon: '📸', primary: true },
                                { text: 'Fill Test', value: 'fill', icon: '✏️' },
                                { text: 'Close', value: 'close', secondary: true }
                            ]
                        }, async (result) => {
                            if (result === 'screenshot') {
                                try {
                                    await ScreenCapture.downloadCapture(element, { 
                                        filename: `input-${element.name || element.id || 'unnamed'}.png`,
                                        backgroundColor: '#ffffff',
                                        scale: 2
                                    });
                                } catch (error) {
                                    alert('Screenshot failed: ' + error.message);
                                }
                            } else if (result === 'fill') {
                                const testValue = element.type === 'email' ? 'test@example.com' : 
                                                 element.type === 'password' ? 'password123' :
                                                 element.type === 'number' ? '42' :
                                                 element.type === 'date' ? '2024-01-01' :
                                                 'Test Value';
                                element.value = testValue;
                                element.focus();
                                Dialog.success(`Filled with test value: "${testValue}"`, 'Input Filled');
                            }
                        });
                    }, { 
                        selector: 'input, textarea, select',
                        message: 'Click on an input field to select it'
                    });
                } else {
                    alert('Element selector not available');
                }
                break;
            case 'screenshot':
                if (window.agentlet?.utils?.ScreenCapture) {
                    console.log('📸 Starting screenshot demo...');
                    
                    const ScreenCapture = window.agentlet.utils.ScreenCapture;
                    const MessageBubble = window.agentlet.utils.MessageBubble;
                    
                    // Demo different screenshot types
                    const demos = [
                        async () => {
                            // Capture entire page
                            try {
                                MessageBubble.loading('Capturing entire page...');
                                const dataURL = await ScreenCapture.captureAsDataURL();
                                MessageBubble.hideAll();
                                
                                const preview = ScreenCapture.createPreview(dataURL, { maxWidth: 400, maxHeight: 300 });
                                Dialog.show('info', {
                                    title: 'Page Screenshot',
                                    message: `<p>Full page captured successfully!</p><div style="text-align: center; margin: 10px 0;"></div><p><small>Image size: ${dataURL.length} bytes</small></p>`,
                                    allowHtml: true,
                                    icon: '📸',
                                    buttons: [
                                        { text: 'Download', value: 'download', icon: '💾' },
                                        { text: 'Close', value: 'close', secondary: true }
                                    ]
                                }, async (result) => {
                                    if (result === 'download') {
                                        await ScreenCapture.downloadCapture(null, { filename: 'full-page.png' });
                                    }
                                });
                                
                                // Insert preview into dialog
                                setTimeout(() => {
                                    const $ = window.agentlet.$;
                                    const messageEl = $('#agentlet-info-dialog div div')[0];
                                    if (messageEl) {
                                        const previewContainer = $(messageEl).find('div')[0];
                                        if (previewContainer) {
                                            previewContainer.appendChild(preview);
                                        }
                                    }
                                }, 100);
                                
                            } catch (error) {
                                MessageBubble.hideAll();
                                MessageBubble.error('Page capture failed: ' + error.message);
                            }
                        },
                        async () => {
                            // Interactive element capture
                            try {
                                const dataURL = await ScreenCapture.interactiveCapture({ format: 'image/png' });
                                
                                const preview = ScreenCapture.createPreview(dataURL, { maxWidth: 350, maxHeight: 250 });
                                Dialog.show('info', {
                                    title: 'Element Screenshot',
                                    message: `<p>Element captured successfully!</p><div style="text-align: center; margin: 10px 0;"></div><p><small>Click Download to save the image</small></p>`,
                                    allowHtml: true,
                                    icon: '🎯',
                                    buttons: [
                                        { text: 'Download', value: 'download', icon: '💾', primary: true },
                                        { text: 'Copy to Clipboard', value: 'copy', icon: '📋' },
                                        { text: 'Close', value: 'close', secondary: true }
                                    ]
                                }, async (result) => {
                                    if (result === 'download') {
                                        // Convert dataURL to blob and download
                                        const $ = window.agentlet.$;
                                        const canvas = $('<canvas>')[0];
                                        const ctx = canvas.getContext('2d');
                                        const img = new Image();
                                        img.onload = () => {
                                            canvas.width = img.width;
                                            canvas.height = img.height;
                                            ctx.drawImage(img, 0, 0);
                                            
                                            canvas.toBlob((blob) => {
                                                const link = $('<a>')[0];
                                                link.href = URL.createObjectURL(blob);
                                                link.download = 'element-capture.png';
                                                link.click();
                                                URL.revokeObjectURL(link.href);
                                            });
                                        };
                                        img.src = dataURL;
                                    } else if (result === 'copy') {
                                        try {
                                            // Convert dataURL to blob for clipboard
                                            const response = await fetch(dataURL);
                                            const blob = await response.blob();
                                            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
                                            MessageBubble.success('Image copied to clipboard!');
                                        } catch (error) {
                                            MessageBubble.warning('Clipboard not supported in this browser');
                                        }
                                    }
                                });
                                
                                // Insert preview into dialog
                                setTimeout(() => {
                                    const $ = window.agentlet.$;
                                    const messageEl = $('#agentlet-info-dialog div div')[0];
                                    if (messageEl) {
                                        const previewContainer = $(messageEl).find('div')[0];
                                        if (previewContainer) {
                                            previewContainer.appendChild(preview);
                                        }
                                    }
                                }, 100);
                                
                            } catch (error) {
                                MessageBubble.error('Interactive capture cancelled or failed');
                            }
                        },
                        async () => {
                            // Capture viewport only
                            try {
                                MessageBubble.loading('Capturing visible area...');
                                const dataURL = await ScreenCapture.captureAsDataURL(null, {
                                    width: window.innerWidth,
                                    height: window.innerHeight,
                                    x: window.pageXOffset,
                                    y: window.pageYOffset
                                });
                                MessageBubble.hideAll();
                                
                                const preview = ScreenCapture.createPreview(dataURL, { maxWidth: 350, maxHeight: 250 });
                                Dialog.show('info', {
                                    title: 'Viewport Screenshot',
                                    message: `<p>Visible area captured!</p><div style="text-align: center; margin: 10px 0;"></div><p><small>Viewport: ${window.innerWidth}×${window.innerHeight}px</small></p>`,
                                    allowHtml: true,
                                    icon: '👁️',
                                    buttons: [
                                        { text: 'Download', value: 'download', primary: true },
                                        { text: 'Close', value: 'close', secondary: true }
                                    ]
                                }, async (result) => {
                                    if (result === 'download') {
                                        await ScreenCapture.downloadCapture(null, {
                                            filename: 'viewport.png',
                                            width: window.innerWidth,
                                            height: window.innerHeight,
                                            x: window.pageXOffset,
                                            y: window.pageYOffset
                                        });
                                    }
                                });
                                
                                // Insert preview into dialog
                                setTimeout(() => {
                                    const $ = window.agentlet.$;
                                    const messageEl = $('#agentlet-info-dialog div div')[0];
                                    if (messageEl) {
                                        const previewContainer = $(messageEl).find('div')[0];
                                        if (previewContainer) {
                                            previewContainer.appendChild(preview);
                                        }
                                    }
                                }, 100);
                                
                            } catch (error) {
                                MessageBubble.hideAll();
                                MessageBubble.error('Viewport capture failed: ' + error.message);
                            }
                        },
                        async () => {
                            // Capture Agentlet container
                            try {
                                const $ = window.agentlet.$;
                                const agentletContainer = $('#agentlet-container')[0];
                                if (!agentletContainer) {
                                    MessageBubble.warning('Agentlet container not found');
                                    return;
                                }
                                
                                MessageBubble.loading('Capturing Agentlet interface...');
                                const dataURL = await ScreenCapture.captureAsDataURL(agentletContainer);
                                MessageBubble.hideAll();
                                
                                const preview = ScreenCapture.createPreview(dataURL, { maxWidth: 300, maxHeight: 400 });
                                Dialog.show('info', {
                                    title: 'Agentlet Interface Screenshot',
                                    message: `<p>Agentlet Core interface captured!</p><div style="text-align: center; margin: 10px 0;"></div><p><small>Perfect for documentation or sharing</small></p>`,
                                    allowHtml: true,
                                    icon: '🤖',
                                    buttons: [
                                        { text: 'Download', value: 'download', primary: true },
                                        { text: 'Close', value: 'close', secondary: true }
                                    ]
                                }, async (result) => {
                                    if (result === 'download') {
                                        await ScreenCapture.downloadCapture(agentletContainer, { filename: 'agentlet-interface.png' });
                                    }
                                });
                                
                                // Insert preview into dialog
                                setTimeout(() => {
                                    const $ = window.agentlet.$;
                                    const messageEl = $('#agentlet-info-dialog div div')[0];
                                    if (messageEl) {
                                        const previewContainer = $(messageEl).find('div')[0];
                                        if (previewContainer) {
                                            previewContainer.appendChild(preview);
                                        }
                                    }
                                }, 100);
                                
                            } catch (error) {
                                MessageBubble.hideAll();
                                MessageBubble.error('Agentlet capture failed: ' + error.message);
                            }
                        }
                    ];
                    
                    // Randomly pick a demo
                    const randomDemo = demos[Math.floor(Math.random() * demos.length)];
                    randomDemo();
                    
                } else {
                    alert('Screen capture not available');
                }
                break;
            case 'wait':
                if (window.agentlet?.utils?.Dialog) {
                    console.log('⏳ Starting wait dialog demo...');
                    
                    const Dialog = window.agentlet.utils.Dialog;
                    const MessageBubble = window.agentlet.utils.MessageBubble;
                    
                    // Demo different wait dialog types
                    const demos = [
                        () => {
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
                        },
                        () => {
                            // Loading Demo
                            Dialog.showLoading('Loading external resources and preparing interface...', false);
                            
                            setTimeout(() => {
                                Dialog.updateMessage('Fetching data from server...');
                            }, 1500);
                            
                            setTimeout(() => {
                                Dialog.updateMessage('Rendering components...');
                            }, 3000);
                            
                            setTimeout(() => {
                                Dialog.hide();
                                MessageBubble.success('All resources loaded successfully!', { duration: 3000 });
                            }, 5000);
                        },
                        () => {
                            // Analyzing Demo
                            Dialog.showAnalyzing('Deep scanning page for security vulnerabilities...', true, () => {
                                MessageBubble.warning('Security scan cancelled by user');
                            });
                            
                            setTimeout(() => {
                                Dialog.updateMessage('Checking for XSS vulnerabilities...');
                            }, 2000);
                            
                            setTimeout(() => {
                                Dialog.updateMessage('Analyzing form security...');
                            }, 4000);
                            
                            setTimeout(() => {
                                Dialog.updateMessage('Validating HTTPS implementation...');
                            }, 6000);
                            
                            setTimeout(() => {
                                Dialog.hide();
                                Dialog.success('Security scan complete! No vulnerabilities found.', '🔒 Security Report');
                            }, 8000);
                        },
                        () => {
                            // Thinking Demo
                            Dialog.showThinking('AI is formulating the best response to your query...', true, () => {
                                MessageBubble.info('AI thinking process interrupted');
                            });
                            
                            setTimeout(() => {
                                Dialog.updateMessage('Considering multiple approaches...');
                            }, 2000);
                            
                            setTimeout(() => {
                                Dialog.updateMessage('Weighing pros and cons...');
                            }, 4000);
                            
                            setTimeout(() => {
                                Dialog.updateMessage('Finalizing recommendation...');
                            }, 6000);
                            
                            setTimeout(() => {
                                Dialog.hide();
                                Dialog.info('Based on my analysis, I recommend implementing a progressive enhancement strategy for your web application. This approach will ensure compatibility across all browsers while providing enhanced functionality for modern ones.', '💭 AI Recommendation');
                            }, 8000);
                        },
                        () => {
                            // Custom Demo with multiple stages
                            Dialog.show('wait', {
                                title: '🚀 Deploying Application',
                                message: 'Preparing deployment pipeline...',
                                icon: '🚀',
                                showSpinner: true,
                                allowCancel: true
                            }, () => {
                                MessageBubble.error('Deployment cancelled by user');
                            });
                            
                            const stages = [
                                'Building production bundle...',
                                'Running automated tests...',
                                'Optimizing assets...',
                                'Uploading to server...',
                                'Configuring load balancer...',
                                'Warming up cache...',
                                'Running health checks...'
                            ];
                            
                            stages.forEach((stage, index) => {
                                setTimeout(() => {
                                    Dialog.updateMessage(stage);
                                }, (index + 1) * 1500);
                            });
                            
                            setTimeout(() => {
                                Dialog.hide();
                                Dialog.success('🎉 Deployment successful! Your application is now live and accessible to users.', 'Deployment Complete');
                            }, stages.length * 1500 + 1000);
                        },
                        () => {
                            // Quick demo without cancel
                            Dialog.show('wait', {
                                title: 'Processing Payment',
                                message: 'Securely processing your payment...',
                                icon: '💳',
                                showSpinner: true,
                                allowCancel: false
                            });
                            
                            setTimeout(() => {
                                Dialog.updateMessage('Contacting payment gateway...');
                            }, 1000);
                            
                            setTimeout(() => {
                                Dialog.updateMessage('Verifying transaction...');
                            }, 2500);
                            
                            setTimeout(() => {
                                Dialog.hide();
                                Dialog.success('Payment processed successfully! Transaction ID: #TX-2024-001234', '✅ Payment Complete');
                            }, 4500);
                        }
                    ];
                    
                    // Show demo selection dialog first
                    Dialog.choice(
                        'Choose which wait dialog demo you\'d like to see:',
                        [
                            { text: '🤖 AI Processing', value: 0, icon: '🤖' },
                            { text: '⏳ Loading', value: 1, icon: '⏳' },
                            { text: '🔍 Analyzing', value: 2, icon: '🔍' },
                            { text: '💭 Thinking', value: 3, icon: '💭' },
                            { text: '🚀 Deployment', value: 4, icon: '🚀' },
                            { text: '💳 Payment', value: 5, icon: '💳' },
                            { text: '🎲 Random', value: 'random', icon: '🎲' }
                        ],
                        'Wait Dialog Demo',
                        (result) => {
                            if (result !== null && result !== 'cancel') {
                                // Extract the value from the choice object
                                let demoIndex = typeof result === 'object' ? result.value : result;
                                if (demoIndex === 'random') {
                                    demoIndex = Math.floor(Math.random() * demos.length);
                                }
                                
                                // Validate the demo function exists
                                if (typeof demos[demoIndex] === 'function') {
                                    // Add a small delay before starting the demo
                                    setTimeout(() => {
                                        demos[demoIndex]();
                                    }, 500);
                                } else {
                                    console.error('Demo at index', demoIndex, 'is not a function. demos array:', demos);
                                    MessageBubble.error(`Invalid demo selection: ${demoIndex}. Available demos: 0-${demos.length - 1}`);
                                }
                            }
                        }
                    );
                    
                } else {
                    alert('Wait dialog not available');
                }
                break;
            case 'progress':
                if (window.agentlet?.utils?.Dialog) {
                    console.log('📊 Starting progress bar demo...');
                    
                    const Dialog = window.agentlet.utils.Dialog;
                    const MessageBubble = window.agentlet.utils.MessageBubble;
                    
                    // Demo different progress bar types
                    const demos = [
                        () => {
                            // Simple progress demo
                            const progress = Dialog.showProgressBar('Starting data processing...', {
                                title: 'Processing Data',
                                closable: true,
                                onCancel: () => {
                                    MessageBubble.warning('Data processing cancelled by user');
                                },
                                onComplete: () => {
                                    MessageBubble.success('Data processing completed successfully!');
                                }
                            });
                            
                            // Simulate progress
                            let currentProgress = 0;
                            const interval = setInterval(() => {
                                currentProgress += Math.random() * 15;
                                const messages = [
                                    'Loading data from server...',
                                    'Processing records...',
                                    'Analyzing patterns...',
                                    'Generating reports...',
                                    'Finalizing results...'
                                ];
                                const message = messages[Math.floor(currentProgress / 20)];
                                
                                progress.updateProgress(currentProgress, message);
                                
                                if (currentProgress >= 100) {
                                    clearInterval(interval);
                                }
                            }, 500);
                        },
                        () => {
                            // Multi-step progress demo
                            const steps = [
                                'Initialize system',
                                'Load configuration',
                                'Connect to database',
                                'Fetch user data',
                                'Process information',
                                'Generate results',
                                'Save to cache'
                            ];
                            
                            const progress = Dialog.showProgressWithSteps(steps, {
                                title: 'System Setup',
                                message: 'Preparing system components...',
                                closable: false
                            });
                            
                            let currentStep = 0;
                            const stepInterval = setInterval(() => {
                                progress.setStep(currentStep, steps[currentStep]);
                                progress.updateProgress((currentStep + 1) * (100 / steps.length), steps[currentStep]);
                                
                                currentStep++;
                                if (currentStep >= steps.length) {
                                    clearInterval(stepInterval);
                                    setTimeout(() => {
                                        progress.completeProgress('System setup completed!');
                                    }, 500);
                                }
                            }, 1000);
                        },
                        () => {
                            // File upload simulation
                            const progress = Dialog.showProgressBar('Uploading file to server...', {
                                title: 'File Upload',
                                animated: true,
                                closable: true,
                                onCancel: () => {
                                    MessageBubble.error('File upload cancelled');
                                }
                            });
                            
                            let uploaded = 0;
                            const fileSize = 100;
                            const uploadInterval = setInterval(() => {
                                const chunk = Math.random() * 8 + 2; // 2-10% per interval
                                uploaded += chunk;
                                
                                if (uploaded >= fileSize) {
                                    uploaded = fileSize;
                                    clearInterval(uploadInterval);
                                }
                                
                                const speed = (chunk * 1000 / 500).toFixed(1); // MB/s simulation
                                progress.updateProgress(uploaded, `Uploading... ${speed} MB/s`);
                            }, 500);
                        },
                        () => {
                            // AI processing simulation
                            const progress = Dialog.showProgressBar('AI is analyzing your content...', {
                                title: 'AI Analysis',
                                showETA: false, // AI processing time is unpredictable
                                animated: true,
                                closable: true,
                                onComplete: () => {
                                    Dialog.success('AI analysis completed! Found 42 insights and 17 actionable recommendations.', '🤖 Analysis Complete');
                                }
                            });
                            
                            // Simulate AI processing with variable progress
                            let aiProgress = 0;
                            const phases = [
                                'Preprocessing text...',
                                'Extracting features...',
                                'Running neural network...',
                                'Analyzing patterns...',
                                'Generating insights...',
                                'Finalizing report...'
                            ];
                            
                            let currentPhase = 0;
                            const aiInterval = setInterval(() => {
                                // AI processing is non-linear
                                const increment = Math.random() * 20 + 5;
                                aiProgress += increment;
                                
                                if (aiProgress > 100) aiProgress = 100;
                                
                                // Change phase based on progress
                                const newPhase = Math.floor(aiProgress / 16.67);
                                if (newPhase !== currentPhase && newPhase < phases.length) {
                                    currentPhase = newPhase;
                                }
                                
                                progress.updateProgress(aiProgress, phases[currentPhase] || 'Finalizing...');
                                
                                if (aiProgress >= 100) {
                                    clearInterval(aiInterval);
                                }
                            }, 800);
                        },
                        () => {
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
                            }, 300);
                        }
                    ];
                    
                    // Show demo selection dialog
                    Dialog.choice(
                        'Choose which progress bar demo you\'d like to see:',
                        [
                            { text: '📊 Simple Progress', value: 0, icon: '📊' },
                            { text: '📋 Multi-Step', value: 1, icon: '📋' },
                            { text: '📁 File Upload', value: 2, icon: '📁' },
                            { text: '🤖 AI Processing', value: 3, icon: '🤖' },
                            { text: '⚡ Batch Processing', value: 4, icon: '⚡' },
                            { text: '🎲 Random', value: 'random', icon: '🎲' }
                        ],
                        'Progress Bar Demo',
                        (result) => {
                            if (result !== null && result !== 'cancel') {
                                let demoIndex = typeof result === 'object' ? result.value : result;
                                if (demoIndex === 'random') {
                                    demoIndex = Math.floor(Math.random() * demos.length);
                                }
                                
                                if (typeof demos[demoIndex] === 'function') {
                                    setTimeout(() => {
                                        demos[demoIndex]();
                                    }, 500);
                                } else {
                                    MessageBubble.error(`Invalid demo selection: ${demoIndex}`);
                                }
                            }
                        }
                    );
                    
                } else {
                    alert('Progress dialog not available');
                }
                break;
            case 'refresh':
                if (window.agentlet?.ui?.refreshContent) {
                    window.agentlet.ui.refreshContent();
                } else {
                    location.reload();
                }
                break;
        }
    };

    // Auto-register with Agentlet Core
    async function registerModule() {
        if (!window.agentlet) {
            setTimeout(registerModule, 500);
            return;
        }

        try {
            const existing = window.agentlet.modules.get('simple-test');
            if (existing) {
                console.log('🧪 Simple Test Module already registered');
                return;
            }

            const module = createSimpleTestModule();
            module.eventBus = window.agentlet.eventBus;
            
            await window.agentlet.modules.register(module, 'example');
            console.log('🧪 Simple Test Module registered successfully');
            
        } catch (error) {
            console.error('🧪 Failed to register Simple Test Module:', error);
        }
    }

    console.log('🧪 Simple Test Module script loaded');
    registerModule();

})();