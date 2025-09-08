/**
 * Unified Dialog - Consolidated InfoDialog, InputDialog, and WaitDialog functionality
 * Provides modal dialogs for information display, user input, and wait states
 */
import { Z_INDEX } from './ZIndexConstants.js';
class Dialog {
    constructor(config = {}) {
        this.theme = config.theme || {};
        this.isActive = false;
        this.overlay = null;
        this.dialog = null;
        this.callback = null;
        this.type = null;
        this.activeInput = null;
        this.cancelCallback = null;
        this.scrollY = 0; // Store scroll position
        
        // Bind methods
        this.handleKeydown = this.handleKeydown.bind(this);
        this.handleOverlayClick = this.handleOverlayClick.bind(this);
        
        // Ensure dialog styles are injected
        this.addDialogStyles();
    }
    
    /**
     * Preserve current scroll position before showing dialog
     */
    preserveScrollPosition() {
        this.scrollY = window.scrollY;
        document.body.style.top = `-${this.scrollY}px`;
    }
    
    /**
     * Restore scroll position after hiding dialog
     */
    restoreScrollPosition() {
        const scrollY = this.scrollY;
        document.body.style.top = '';
        window.scrollTo(0, scrollY);
    }
    
    /**
     * Universal show method - primary interface for all dialog types
     */
    show(type, options = {}, callback) {
        this.type = type;
        switch(type) {
        case 'info':
            return this.showInfo(options, callback);
        case 'input':
            return this.showInput(options, callback);
        case 'wait':
            return this.showWait(options, callback);
        case 'progress':
            return this.showProgress(options, callback);
        case 'fullscreen':
            return this.showFullscreen(options, callback);
        case 'command':
            return this.showCommandPrompt(options, callback);
        default:
            throw new Error(`Unknown dialog type: ${type}`);
        }
    }
    
    /**
     * Show information dialog
     */
    showInfo(options = {}, callback) {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return;
        }
        
        console.log('🚀 Starting info dialog creation with options:', options);
        
        const config = {
            title: options.title || 'Information',
            message: options.message || '',
            icon: options.icon || 'ℹ️',
            allowHtml: options.allowHtml || false,
            buttons: options.buttons || [{ text: 'OK', value: 'ok', primary: true }],
            ...options
        };
        
        this.callback = callback;
        this.isActive = true;
        this.type = 'info';
        
        this.createOverlay();
        
        // Check if overlay creation failed
        if (!this.overlay) {
            console.error('❌ Overlay creation failed, aborting dialog creation');
            this.isActive = false;
            this.type = null;
            return;
        }
        
        this.createInfoDialog(config);
        
        // Check if dialog creation failed
        if (!this.dialog) {
            console.error('❌ Dialog creation failed, cleaning up');
            this.removeOverlay();
            this.isActive = false;
            this.type = null;
            return;
        }
        
        this.addEventListeners();
        console.log('👂 Event listeners added');
        
        console.log('✅ Info dialog setup complete');
    }
    
    /**
     * Show input dialog
     */
    showInput(options = {}, callback) {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return;
        }
        
        const config = {
            title: options.title || 'Input Required',
            message: options.message || '',
            placeholder: options.placeholder || '',
            defaultValue: options.defaultValue || '',
            inputType: options.inputType || 'text',
            rows: options.rows || 4,
            resizable: options.resizable !== false,
            ...options
        };
        
        this.callback = callback;
        this.isActive = true;
        this.type = 'input';
        
        this.createOverlay();
        this.createInputDialog(config);
        this.addEventListeners();
        this.focusFirstInput();
    }
    
    /**
     * Show wait dialog
     */
    showWait(options = {}, cancelCallback) {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return;
        }
        
        const config = {
            title: options.title || 'AI Processing',
            message: options.message || 'Please wait...',
            icon: options.icon || '🤖',
            showSpinner: options.showSpinner !== false,
            allowCancel: options.allowCancel || false,
            ...options
        };
        
        this.cancelCallback = cancelCallback;
        this.isActive = true;
        this.type = 'wait';
        
        this.createOverlay();
        this.createWaitDialog(config);
        this.addEventListeners();
    }
    
    /**
     * Show fullscreen dialog
     */
    showFullscreen(options = {}, callback) {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return;
        }
        
        const config = {
            title: options.title || 'Fullscreen Dialog',
            message: options.message || '',
            icon: options.icon || '🔍',
            allowHtml: options.allowHtml || false,
            buttons: options.buttons || [{ text: 'Close', value: 'close', primary: true }],
            customContent: options.customContent || null,
            scrollable: options.scrollable !== false,
            closeOnOverlay: options.closeOnOverlay !== false,
            showHeaderCloseButton: options.showHeaderCloseButton !== false,
            ...options
        };
        
        this.callback = callback;
        this.isActive = true;
        this.type = 'fullscreen';
        
        this.createFullscreenOverlay();
        this.createFullscreenDialog(config);
        this.addEventListeners();
    }
    
    /**
     * Show command prompt dialog - large centered input for quick commands
     */
    showCommandPrompt(options = {}, callback) {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return;
        }
        
        const config = {
            title: options.title || 'Command Prompt',
            message: options.message || '',
            icon: options.icon || '⚡',
            placeholder: options.placeholder || 'Enter command...',
            defaultValue: options.defaultValue || '',
            inputType: options.inputType || 'text',
            fontSize: options.fontSize || '24px',
            showHeader: options.showHeader !== false,
            showMessage: options.showMessage !== false,
            allowHtml: options.allowHtml || false,
            closeOnOverlay: options.closeOnOverlay !== false,
            ...options
        };
        
        this.callback = callback;
        this.isActive = true;
        this.type = 'command';
        
        this.createOverlay();
        this.createCommandPromptDialog(config);
        this.addEventListeners();
        this.focusFirstInput();
    }
    
    /**
     * Show progress dialog
     */
    showProgress(options = {}, callbacks = {}) {
        if (this.isActive) {
            console.warn('Dialog is already active');
            return;
        }
        
        const config = {
            title: options.title || 'Processing',
            message: options.message || 'Processing...',
            icon: options.icon || '📊',
            showPercentage: options.showPercentage !== false,
            showETA: options.showETA !== false,
            showSteps: options.showSteps !== false,
            animated: options.animated !== false,
            closable: options.closable || false,
            autoClose: options.autoClose !== false,
            initialProgress: options.initialProgress || 0,
            totalSteps: options.totalSteps || 1,
            stepLabels: options.stepLabels || [],
            currentStep: options.currentStep || 0,
            ...options
        };
        
        // Set callbacks
        this.onProgress = callbacks.onProgress || options.onProgress;
        this.onComplete = callbacks.onComplete || options.onComplete;
        this.cancelCallback = callbacks.onCancel || options.onCancel;
        
        // Initialize progress state
        this.currentProgress = config.initialProgress;
        this.totalSteps = config.totalSteps;
        this.stepLabels = config.stepLabels;
        this.currentStep = config.currentStep;
        this.startTime = Date.now();
        
        this.isActive = true;
        this.type = 'progress';
        
        this.createOverlay();
        this.createProgressDialog(config);
        this.addEventListeners();
        this.updateProgressDisplay();
        
        return this;
    }
    
    /**
     * Hide dialog with result
     */
    hide(result = null) {
        if (!this.isActive) return;
        
        this.removeEventListeners();
        this.removeDialog();
        this.removeOverlay();
        
        this.isActive = false;
        this.type = null;
        this.activeInput = null;
        
        if (this.callback) {
            const callback = this.callback;
            this.callback = null;
            callback(result);
        }
        
        if (this.cancelCallback) {
            this.cancelCallback = null;
        }
    }
    
    /**
     * Update message for active wait dialog
     */
    updateMessage(newMessage) {
        if (!this.isActive || this.type !== 'wait') {
            console.warn('No active wait dialog to update');
            return;
        }
        
        const messageElement = this.dialog?.querySelector('.agentlet-wait-message');
        if (messageElement) {
            messageElement.textContent = newMessage;
        }
    }
    
    /**
     * Focus on the first input element in the dialog
     */
    focusFirstInput() {
        if (!this.dialog) return;
        
        // Multiple attempts to ensure focus works
        const attemptFocus = (attempt = 0) => {
            const firstInput = this.dialog?.querySelector('input, textarea, select');
            if (firstInput && document.body.contains(firstInput)) {
                try {
                    firstInput.focus();
                    
                    // For text inputs, also select all text if there's a default value
                    if ((firstInput.type === 'text' || firstInput.type === 'email' || firstInput.type === 'password' || firstInput.tagName === 'TEXTAREA') && firstInput.value) {
                        firstInput.select();
                    }
                } catch (error) {
                    console.warn('Failed to focus input:', error);
                }
            } else if (attempt < 5) {
                // Retry up to 5 times with increasing delays
                setTimeout(() => attemptFocus(attempt + 1), 50 * (attempt + 1));
            }
        };
        
        // Start first attempt immediately, then with delays
        attemptFocus();
    }
    
    // =================
    // INFO DIALOG METHODS
    // =================
    
    /**
     * Show info dialog
     */
    info(message, title = 'Information', callback) {
        return this.showInfo({
            message,
            title,
            icon: 'ℹ️'
        }, callback);
    }
    
    /**
     * Show success dialog
     */
    success(message, title = 'Success', callback) {
        return this.showInfo({
            message,
            title,
            icon: '✅'
        }, callback);
    }
    
    /**
     * Show warning dialog
     */
    warning(message, title = 'Warning', callback) {
        return this.showInfo({
            message,
            title,
            icon: '⚠️'
        }, callback);
    }
    
    /**
     * Show error dialog
     */
    error(message, title = 'Error', callback) {
        return this.showInfo({
            message,
            title,
            icon: '❌'
        }, callback);
    }
    
    /**
     * Show confirm dialog
     */
    confirm(message, title = 'Confirm', callback) {
        return this.showInfo({
            message,
            title,
            icon: '❓',
            buttons: [
                { text: 'Cancel', value: 'cancel', secondary: true },
                { text: 'Confirm', value: 'confirm', primary: true }
            ]
        }, callback);
    }
    
    /**
     * Show yes/no dialog
     */
    yesNo(message, title = 'Question', callback) {
        return this.showInfo({
            message,
            title,
            icon: '❓',
            buttons: [
                { text: 'No', value: 'no', secondary: true },
                { text: 'Yes', value: 'yes', primary: true }
            ]
        }, callback);
    }
    
    /**
     * Show choice dialog
     */
    choice(message, choices, title = 'Choose', callback) {
        const buttons = choices.map((choice, index) => ({
            text: choice.text || choice,
            value: choice.value || choice,
            primary: index === 0
        }));
        
        return this.showInfo({
            message,
            title,
            icon: '📋',
            buttons
        }, callback);
    }
    
    // =================
    // INPUT DIALOG METHODS
    // =================
    
    /**
     * Simple text prompt
     */
    prompt(message, defaultValue = '', callback) {
        return this.showInput({
            message,
            defaultValue,
            inputType: 'text'
        }, callback);
    }
    
    /**
     * Password prompt
     */
    promptPassword(message, callback) {
        return this.showInput({
            message,
            inputType: 'password'
        }, callback);
    }
    
    /**
     * Email prompt
     */
    promptEmail(message, defaultValue = '', callback) {
        return this.showInput({
            message,
            defaultValue,
            inputType: 'email'
        }, callback);
    }
    
    /**
     * Textarea prompt
     */
    promptTextarea(message, defaultValue = '', rows = 4, callback) {
        return this.showInput({
            message,
            defaultValue,
            inputType: 'textarea',
            rows
        }, callback);
    }
    
    /**
     * AI prompt (textarea)
     */
    promptAI(message, defaultValue = '', callback) {
        return this.showInput({
            message,
            defaultValue,
            inputType: 'textarea',
            title: 'AI Prompt',
            rows: 6
        }, callback);
    }
    
    // =================
    // COMMAND PROMPT METHODS
    // =================
    
    /**
     * Show command prompt dialog
     */
    commandPrompt(options = {}, callback) {
        // Support legacy API (string as first param) for backward compatibility
        if (typeof options === 'string') {
            options = {
                placeholder: options
            };
            callback = arguments[1];
        }
        
        return this.showCommandPrompt(options, callback);
    }
    
    /**
     * Quick command prompt - minimal setup
     */
    quickCommand(placeholder = 'Enter command...', callback) {
        return this.showCommandPrompt({
            placeholder,
            showHeader: false,
            showMessage: false,
            fontSize: '28px'
        }, callback);
    }
    
    // =================
    // FULLSCREEN DIALOG METHODS
    // =================
    
    /**
     * Show fullscreen dialog
     */
    fullscreen(options, callback) {
        return this.showFullscreen(options, callback);
    }
    
    // =================
    // WAIT DIALOG METHODS
    // =================
    
    /**
     * Show AI processing dialog
     */
    showAIProcessing(options = {}, cancelCallback) {
        // Support legacy API (string as first param) for backward compatibility
        if (typeof options === 'string') {
            options = {
                message: options,
                allowCancel: arguments[1] || false
            };
            cancelCallback = arguments[2];
        }
        
        return this.showWait({
            title: options.title || 'AI Processing',
            message: options.message || 'Processing with AI...',
            icon: options.showIcon !== false ? (options.icon || '🤖') : '',
            allowCancel: options.allowCancel || false,
            showSpinner: options.showSpinner !== false,
            ...options
        }, cancelCallback);
    }
    
    /**
     * Show loading dialog
     */
    showLoading(message = 'Loading...', allowCancel = false, cancelCallback) {
        return this.showWait({
            message,
            title: 'Loading',
            icon: '⏳',
            allowCancel
        }, cancelCallback);
    }
    
    /**
     * Show analyzing dialog
     */
    showAnalyzing(message = 'Analyzing...', allowCancel = false, cancelCallback) {
        return this.showWait({
            message,
            title: 'Analyzing',
            icon: '🔍',
            allowCancel
        }, cancelCallback);
    }
    
    /**
     * Show thinking dialog
     */
    showThinking(message = 'Thinking...', allowCancel = false, cancelCallback) {
        return this.showWait({
            message,
            title: 'Thinking',
            icon: '💭',
            allowCancel
        }, cancelCallback);
    }
    
    // =================
    // PROGRESS DIALOG METHODS
    // =================
    
    /**
     * Show simple progress bar
     */
    showProgressBar(message = 'Processing...', options = {}) {
        return this.showProgress({
            message,
            showPercentage: true,
            showETA: true,
            closable: true,
            ...options
        });
    }
    
    /**
     * Show progress bar with steps
     */
    showProgressWithSteps(steps, options = {}) {
        return this.showProgress({
            stepLabels: steps,
            showSteps: true,
            totalSteps: steps.length,
            showPercentage: true,
            closable: true,
            ...options
        });
    }
    
    /**
     * Show progress bar for batch processing
     */
    showBatchProgress(totalItems, options = {}) {
        return this.showProgress({
            message: `Processing 0 of ${totalItems} items...`,
            showPercentage: true,
            showETA: true,
            closable: true,
            ...options
        });
    }
    
    // =================
    // INTERNAL METHODS
    // =================
    
    /**
     * Create overlay element
     */
    createOverlay() {
        const $ = window.agentlet.$;
        if (!$) {
            console.error('🚨 Dialog Error: jQuery not available for Dialog overlay creation');
            console.error('🔍 Debug info:', {
                'window.agentlet': !!window.agentlet,
                'window.agentlet.$': !!window.agentlet?.$,
                'window.jQuery': !!window.jQuery,
                'dialogType': this.type
            });
            return;
        }
        
        this.overlay = document.createElement('div');
        this.overlay.className = `agentlet-dialog-overlay agentlet-${this.type}-overlay`;
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: ${Z_INDEX.DIALOG_OVERLAY};
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        $(document.body).append(this.overlay);
        
        // Add class to body when overlay is active
        $(document.body).addClass('agentlet-overlay-active');
        // Block background scroll when dialog is open, preserve scroll position
        this.preserveScrollPosition();
        document.body.classList.add('agentlet-dialog-open');
    }
    
    /**
     * Create fullscreen overlay element
     */
    createFullscreenOverlay() {
        const $ = window.agentlet.$;
        if (!$) {
            console.error('🚨 Dialog Error: jQuery not available for fullscreen Dialog overlay creation');
            console.error('🔍 Debug info:', {
                'window.agentlet': !!window.agentlet,
                'window.agentlet.$': !!window.agentlet?.$,
                'window.jQuery': !!window.jQuery,
                'dialogType': this.type
            });
            return;
        }
        
        this.overlay = document.createElement('div');
        this.overlay.className = `agentlet-dialog-overlay agentlet-${this.type}-overlay`;
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: ${Z_INDEX.DIALOG_OVERLAY};
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 5vh 5vw;
            box-sizing: border-box;
        `;
        
        $(document.body).append(this.overlay);
        
        // Add class to body when overlay is active
        $(document.body).addClass('agentlet-overlay-active');
        // Block background scroll when dialog is open, preserve scroll position
        this.preserveScrollPosition();
        document.body.classList.add('agentlet-dialog-open');
    }
    
    /**
     * Remove overlay element
     */
    removeOverlay() {
        const $ = window.agentlet.$;
        if (this.overlay && $) {
            $(this.overlay).remove();
            this.overlay = null;
            
            // Remove class from body when overlay is removed
            $(document.body).removeClass('agentlet-overlay-active');
            // Restore background scroll when dialog is closed
            document.body.classList.remove('agentlet-dialog-open');
            // Restore scroll position
            this.restoreScrollPosition();
        }
    }
    
    /**
     * Create info dialog
     */
    createInfoDialog(config) {
        const $ = window.agentlet.$;
        if (!$) {
            console.error('🚨 Dialog Error: jQuery not available for info dialog creation');
            console.error('🔍 Debug info:', {
                'window.agentlet': !!window.agentlet,
                'window.agentlet.$': !!window.agentlet?.$,
                'window.jQuery': !!window.jQuery,
                'dialogType': this.type,
                'overlayExists': !!this.overlay
            });
            return;
        }
        
        console.log('📘 Creating info dialog with config:', { 
            title: config.title, 
            hasMessage: !!config.message,
            buttonsCount: config.buttons?.length || 0,
            allowHtml: config.allowHtml,
            theme: Object.keys(this.theme).length > 0 ? 'custom' : 'default'
        });
        
        this.dialog = document.createElement('div');
        this.dialog.className = 'agentlet-info-dialog';
        this.dialog.style.cssText = `
            background: ${this.theme.backgroundColor || '#ffffff'};
            border-radius: ${this.theme.borderRadius || '8px'};
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            max-width: ${config.maxWidth || '500px'};
            min-width: ${config.minWidth || '300px'};
            width: ${config.width || 'auto'};
            max-height: 80vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            font-family: ${this.theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
            position: relative;
            z-index: ${Z_INDEX.DIALOG};
        `;
        
        // Create header
        const header = document.createElement('div');
        header.className = 'agentlet-info-header';
        header.style.cssText = `
            padding: 20px 20px 15px;
            border-bottom: 1px solid ${this.theme.borderColor || '#e0e0e0'};
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            background: ${this.theme.headerBackground || 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'};
            flex-shrink: 0;
        `;
        
        const icon = document.createElement('span');
        icon.textContent = config.icon;
        icon.style.cssText = 'font-size: 24px;';
        
        const title = document.createElement('h3');
        title.textContent = config.title;
        title.style.cssText = `
            margin: 0;
            color: ${this.theme.dialogHeaderTextColor || this.theme.headerTextColor || '#333333'};
            font-size: 18px;
            font-weight: 600;
        `;
        
        header.appendChild(icon);
        header.appendChild(title);
        
        // Create content
        const content = document.createElement('div');
        content.className = 'agentlet-info-content';
        content.style.cssText = `
            padding: 20px;
            color: ${this.theme.textColor || '#333333'};
            line-height: 1.5;
            flex: 1;
            overflow-y: auto;
        `;
        
        if (config.allowHtml) {
            content.innerHTML = config.message;
        } else {
            content.textContent = config.message;
        }
        
        // Create buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'agentlet-info-buttons';
        buttonContainer.style.cssText = `
            padding: 0 20px 20px;
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            flex-shrink: 0;
        `;
        
        config.buttons.forEach(buttonConfig => {
            const button = document.createElement('button');
            button.textContent = buttonConfig.text;
            button.disabled = buttonConfig.disabled || false;
            
            let buttonStyle = `
                padding: 10px 20px;
                border: 1px solid ${this.theme.borderColor || '#ccc'};
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            `;
            
            if (buttonConfig.primary) {
                buttonStyle += `
                    background: ${this.theme.primaryColor || '#007bff'};
                    color: white;
                    border-color: ${this.theme.primaryColor || '#007bff'};
                `;
            } else if (buttonConfig.danger) {
                buttonStyle += `
                    background: #dc3545;
                    color: white;
                    border-color: #dc3545;
                `;
            } else {
                buttonStyle += `
                    background: ${this.theme.actionButtonBackground || '#f8f9fa'};
                    color: ${this.theme.actionButtonText || '#333333'};
                `;
            }
            
            button.style.cssText = buttonStyle;
            
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hide(buttonConfig.value);
            });
            
            buttonContainer.appendChild(button);
        });
        
        this.dialog.appendChild(header);
        this.dialog.appendChild(content);
        this.dialog.appendChild(buttonContainer);
        
        this.overlay.appendChild(this.dialog);
        
        // Force visibility - ensure dialog is not hidden by CSS conflicts
        this.dialog.style.display = 'flex';
        this.dialog.style.visibility = 'visible';
        
        console.log('📦 Info dialog DOM structure created:', {
            dialogExists: !!this.dialog,
            overlayExists: !!this.overlay,
            dialogInOverlay: this.overlay?.contains(this.dialog),
            overlayInDOM: document.body.contains(this.overlay),
            dialogDisplay: this.dialog?.style.display,
            dialogVisibility: this.dialog?.style.visibility,
            dialogClasses: this.dialog?.className
        });
        this.dialog.style.opacity = '1';
        
        console.log('✅ Info dialog created and appended to overlay:', {
            overlayExists: !!this.overlay,
            dialogExists: !!this.dialog,
            overlayZIndex: this.overlay.style.zIndex,
            dialogZIndex: this.dialog.style.zIndex,
            overlayInDOM: document.body.contains(this.overlay),
            dialogInDOM: document.body.contains(this.dialog),
            dialogDisplay: this.dialog.style.display,
            dialogVisibility: this.dialog.style.visibility,
            dialogOpacity: this.dialog.style.opacity
        });
    }
    
    /**
     * Create input dialog
     */
    createInputDialog(config) {
        const $ = window.agentlet.$;
        if (!$) return;
        
        this.dialog = document.createElement('div');
        this.dialog.className = 'agentlet-input-dialog';
        this.dialog.style.cssText = `
            background: ${this.theme.backgroundColor || '#ffffff'};
            border-radius: ${this.theme.borderRadius || '8px'};
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            min-width: 350px;
            font-family: ${this.theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
            position: relative;
            z-index: ${Z_INDEX.DIALOG};
        `;
        
        // Create header
        const header = document.createElement('div');
        header.className = 'agentlet-input-header';
        header.style.cssText = `
            padding: 20px 20px 15px;
            border-bottom: 1px solid ${this.theme.borderColor || '#e0e0e0'};
        `;
        
        const title = document.createElement('h3');
        title.textContent = config.title;
        title.style.cssText = `
            margin: 0;
            color: ${this.theme.textColor || '#333333'};
            font-size: 18px;
            font-weight: 600;
        `;
        
        header.appendChild(title);
        
        // Create content
        const content = document.createElement('div');
        content.className = 'agentlet-input-content';
        content.style.cssText = 'padding: 20px;';
        
        if (config.message) {
            const message = document.createElement('p');
            message.textContent = config.message;
            message.style.cssText = `
                margin: 0 0 15px 0;
                color: ${this.theme.textColor || '#333333'};
                line-height: 1.5;
            `;
            content.appendChild(message);
        }
        
        // Create input
        let input;
        if (config.inputType === 'textarea') {
            input = document.createElement('textarea');
            input.rows = config.rows;
            if (!config.resizable) {
                input.style.resize = 'none';
            }
        } else {
            input = document.createElement('input');
            input.type = config.inputType;
        }
        
        input.className = 'agentlet-input-field';
        input.placeholder = config.placeholder;
        input.value = config.defaultValue;
        input.style.cssText = `
            width: 100%;
            padding: 10px;
            border: 1px solid ${this.theme.borderColor || '#ccc'};
            border-radius: 4px;
            font-size: 14px;
            font-family: inherit;
            box-sizing: border-box;
        `;
        
        content.appendChild(input);
        this.activeInput = input;
        
        // Create buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'agentlet-input-buttons';
        buttonContainer.style.cssText = `
            padding: 0 20px 20px;
            display: flex;
            gap: 10px;
            justify-content: flex-end;
        `;
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = `
            padding: 10px 20px;
            border: 1px solid ${this.theme.borderColor || '#ccc'};
            border-radius: 4px;
            background: ${this.theme.actionButtonBackground || '#f8f9fa'};
            color: ${this.theme.actionButtonText || '#333333'};
            cursor: pointer;
            font-size: 14px;
        `;
        
        const submitButton = document.createElement('button');
        submitButton.textContent = 'Submit';
        submitButton.style.cssText = `
            padding: 10px 20px;
            border: 1px solid ${this.theme.primaryColor || '#007bff'};
            border-radius: 4px;
            background: ${this.theme.primaryColor || '#007bff'};
            color: white;
            cursor: pointer;
            font-size: 14px;
        `;
        
        cancelButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide(null);
        });
        
        submitButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide(input.value);
        });
        
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(submitButton);
        
        this.dialog.appendChild(header);
        this.dialog.appendChild(content);
        this.dialog.appendChild(buttonContainer);
        
        this.overlay.appendChild(this.dialog);
    }
    
    /**
     * Create wait dialog
     */
    createWaitDialog(config) {
        const $ = window.agentlet.$;
        if (!$) return;
        
        this.dialog = document.createElement('div');
        this.dialog.className = 'agentlet-wait-dialog';
        this.dialog.style.cssText = `
            background: ${this.theme.backgroundColor || '#ffffff'};
            border-radius: ${this.theme.borderRadius || '8px'};
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            max-width: 400px;
            min-width: 300px;
            font-family: ${this.theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
            text-align: center;
            position: relative;
            z-index: ${Z_INDEX.DIALOG};
        `;
        
        // Create header
        const header = document.createElement('div');
        header.className = 'agentlet-wait-header';
        header.style.cssText = `
            padding: 20px 20px 15px;
            border-bottom: 1px solid ${this.theme.borderColor || '#e0e0e0'};
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            background: ${this.theme.headerBackground || 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'};
        `;
        
        // Create icon only if provided
        if (config.icon) {
            const icon = document.createElement('span');
            icon.textContent = config.icon;
            icon.style.cssText = `
                font-size: 24px;
                animation: pulse 2s infinite;
            `;
            header.appendChild(icon);
        }
        
        const title = document.createElement('h3');
        title.textContent = config.title;
        title.style.cssText = `
            margin: 0;
            color: ${this.theme.dialogHeaderTextColor || this.theme.headerTextColor || '#333333'};
            font-size: 18px;
            font-weight: 600;
        `;
        
        header.appendChild(title);
        
        // Create content
        const content = document.createElement('div');
        content.className = 'agentlet-wait-content';
        content.style.cssText = 'padding: 20px;';
        
        if (config.showSpinner) {
            const spinner = document.createElement('div');
            spinner.className = 'agentlet-wait-spinner';
            spinner.style.cssText = `
                width: 40px;
                height: 40px;
                border: 4px solid ${this.theme.borderColor || '#e0e0e0'};
                border-top: 4px solid ${this.theme.primaryColor || '#007bff'};
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 0 auto 15px;
            `;
            content.appendChild(spinner);
        }
        
        const message = document.createElement('p');
        message.className = 'agentlet-wait-message';
        message.textContent = config.message;
        message.style.cssText = `
            margin: 0;
            color: ${this.theme.textColor || '#333333'};
            line-height: 1.5;
        `;
        
        content.appendChild(message);
        
        this.dialog.appendChild(header);
        this.dialog.appendChild(content);
        
        // Add cancel button if allowed
        if (config.allowCancel) {
            const buttonContainer = document.createElement('div');
            buttonContainer.className = 'agentlet-wait-buttons';
            buttonContainer.style.cssText = `
                padding: 0 20px 20px;
                display: flex;
                justify-content: center;
            `;
            
            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.style.cssText = `
                padding: 10px 20px;
                border: 1px solid ${this.theme.borderColor || '#ccc'};
                border-radius: 4px;
                background: ${this.theme.actionButtonBackground || '#f8f9fa'};
                color: ${this.theme.actionButtonText || '#333333'};
                cursor: pointer;
                font-size: 14px;
            `;
            
            cancelButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.cancelCallback) {
                    this.cancelCallback();
                }
                this.hide(true); // true indicates cancellation
            });
            
            buttonContainer.appendChild(cancelButton);
            this.dialog.appendChild(buttonContainer);
        }
        
        this.overlay.appendChild(this.dialog);
        
        // Force visibility - ensure dialog is not hidden by CSS conflicts
        this.dialog.style.display = 'block';
        this.dialog.style.visibility = 'visible';
        this.dialog.style.opacity = '1';
        
        // Add CSS animations
        this.addDialogStyles();
    }
    
    /**
     * Create command prompt dialog
     */
    createCommandPromptDialog(config) {
        const $ = window.agentlet.$;
        if (!$) return;
        
        this.dialog = document.createElement('div');
        this.dialog.className = 'agentlet-command-dialog';
        this.dialog.style.cssText = `
            background: ${this.theme.backgroundColor || '#ffffff'};
            border-radius: ${this.theme.borderRadius || '12px'};
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            max-width: 800px;
            min-width: 400px;
            width: 80%;
            font-family: ${this.theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
            display: flex;
            flex-direction: column;
            position: relative;
            z-index: ${Z_INDEX.DIALOG};
        `;
        
        // Create header (conditional)
        if (config.showHeader) {
            const header = document.createElement('div');
            header.className = 'agentlet-command-header';
            header.style.cssText = `
                padding: 24px 30px 20px;
                border-bottom: 2px solid ${this.theme.borderColor || '#e0e0e0'};
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 15px;
                background: ${this.theme.headerBackground || 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'};
                border-radius: ${this.theme.borderRadius || '12px'} ${this.theme.borderRadius || '12px'} 0 0;
                flex-shrink: 0;
            `;
            
            const icon = document.createElement('span');
            icon.textContent = config.icon;
            icon.style.cssText = 'font-size: 32px;';
            
            const title = document.createElement('h2');
            title.textContent = config.title;
            title.style.cssText = `
                margin: 0;
                color: ${this.theme.dialogHeaderTextColor || this.theme.headerTextColor || '#333333'};
                font-size: 24px;
                font-weight: 700;
            `;
            
            header.appendChild(icon);
            header.appendChild(title);
            this.dialog.appendChild(header);
        }
        
        // Create content
        const content = document.createElement('div');
        content.className = 'agentlet-command-content';
        content.style.cssText = `
            padding: ${config.showHeader ? '30px' : '40px'};
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 20px;
            flex: 1;
        `;
        
        // Add message if provided and enabled
        if (config.showMessage && config.message) {
            const message = document.createElement('div');
            message.className = 'agentlet-command-message';
            message.style.cssText = `
                color: ${this.theme.textColor || '#333333'};
                font-size: 18px;
                line-height: 1.5;
                text-align: center;
                margin-bottom: 10px;
            `;
            
            if (config.allowHtml) {
                message.innerHTML = config.message;
            } else {
                message.textContent = config.message;
            }
            
            content.appendChild(message);
        }
        
        // Create large input
        let input;
        if (config.inputType === 'textarea') {
            input = document.createElement('textarea');
            input.rows = 3;
            input.style.resize = 'vertical';
        } else {
            input = document.createElement('input');
            input.type = config.inputType;
        }
        
        input.className = 'agentlet-command-input';
        input.placeholder = config.placeholder;
        input.value = config.defaultValue;
        input.style.cssText = `
            width: 100%;
            padding: 20px 24px;
            border: 3px solid ${this.theme.borderColor || '#e0e0e0'};
            border-radius: 12px;
            font-size: ${config.fontSize};
            font-family: ${this.theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
            font-weight: 500;
            box-sizing: border-box;
            text-align: center;
            background: ${this.theme.inputBackground || '#ffffff'};
            color: ${this.theme.textColor || '#333333'};
            transition: all 0.2s ease;
            outline: none;
        `;
        
        // Add focus styles
        input.addEventListener('focus', () => {
            input.style.borderColor = this.theme.primaryColor || '#007bff';
            input.style.boxShadow = `0 0 0 4px rgba(0, 123, 255, 0.15)`;
            input.style.transform = 'scale(1.02)';
        });
        
        input.addEventListener('blur', () => {
            input.style.borderColor = this.theme.borderColor || '#e0e0e0';
            input.style.boxShadow = 'none';
            input.style.transform = 'scale(1)';
        });
        
        content.appendChild(input);
        this.activeInput = input;
        
        // Create buttons container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'agentlet-command-buttons';
        buttonContainer.style.cssText = `
            display: flex;
            gap: 15px;
            justify-content: center;
            margin-top: 10px;
        `;
        
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = `
            padding: 12px 24px;
            border: 2px solid ${this.theme.borderColor || '#ccc'};
            border-radius: 8px;
            background: ${this.theme.actionButtonBackground || '#f8f9fa'};
            color: ${this.theme.actionButtonText || '#333333'};
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.2s;
            min-width: 100px;
        `;
        
        const submitButton = document.createElement('button');
        submitButton.textContent = 'Execute';
        submitButton.style.cssText = `
            padding: 12px 24px;
            border: 2px solid ${this.theme.primaryColor || '#007bff'};
            border-radius: 8px;
            background: ${this.theme.primaryColor || '#007bff'};
            color: white;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            transition: all 0.2s;
            min-width: 100px;
        `;
        
        // Add hover effects
        cancelButton.addEventListener('mouseenter', () => {
            cancelButton.style.backgroundColor = '#e9ecef';
            cancelButton.style.transform = 'translateY(-1px)';
        });
        
        cancelButton.addEventListener('mouseleave', () => {
            cancelButton.style.backgroundColor = this.theme.actionButtonBackground || '#f8f9fa';
            cancelButton.style.transform = 'translateY(0)';
        });
        
        submitButton.addEventListener('mouseenter', () => {
            submitButton.style.transform = 'translateY(-1px)';
            submitButton.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.3)';
        });
        
        submitButton.addEventListener('mouseleave', () => {
            submitButton.style.transform = 'translateY(0)';
            submitButton.style.boxShadow = 'none';
        });
        
        // Add event listeners
        cancelButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide(null);
        });
        
        submitButton.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hide(input.value.trim());
        });
        
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(submitButton);
        content.appendChild(buttonContainer);
        
        this.dialog.appendChild(content);
        this.overlay.appendChild(this.dialog);
    }
    
    /**
     * Create progress dialog
     */
    createProgressDialog(config) {
        const $ = window.agentlet.$;
        if (!$) return;
        
        this.dialog = document.createElement('div');
        this.dialog.className = 'agentlet-progress-dialog';
        this.dialog.style.cssText = `
            background: ${this.theme.backgroundColor || '#ffffff'};
            border-radius: ${this.theme.borderRadius || '8px'};
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            min-width: 400px;
            font-family: ${this.theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
            position: relative;
            z-index: ${Z_INDEX.DIALOG};
        `;
        
        // Create header
        const header = document.createElement('div');
        header.className = 'agentlet-progress-header';
        header.style.cssText = `
            padding: 20px 20px 15px;
            border-bottom: 1px solid ${this.theme.borderColor || '#e0e0e0'};
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        
        const icon = document.createElement('span');
        icon.textContent = config.icon;
        icon.style.cssText = 'font-size: 24px;';
        
        const title = document.createElement('h3');
        title.textContent = config.title;
        title.style.cssText = `
            margin: 0;
            color: ${this.theme.textColor || '#333333'};
            font-size: 18px;
            font-weight: 600;
            flex: 1;
        `;
        
        header.appendChild(icon);
        header.appendChild(title);
        
        // Add close button if closable
        if (config.closable) {
            const closeButton = document.createElement('button');
            closeButton.textContent = '×';
            closeButton.style.cssText = `
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: ${this.theme.textColor || '#333333'};
                opacity: 0.6;
                transition: opacity 0.2s;
            `;
            
            closeButton.addEventListener('click', () => {
                if (this.cancelCallback) {
                    this.cancelCallback();
                }
                this.hide('cancel');
            });
            
            closeButton.addEventListener('mouseenter', () => {
                closeButton.style.opacity = '1';
            });
            
            closeButton.addEventListener('mouseleave', () => {
                closeButton.style.opacity = '0.6';
            });
            
            header.appendChild(closeButton);
        }
        
        // Create content
        const content = document.createElement('div');
        content.className = 'agentlet-progress-content';
        content.style.cssText = 'padding: 20px;';
        
        // Progress message
        const message = document.createElement('p');
        message.className = 'agentlet-progress-message';
        message.textContent = config.message;
        message.style.cssText = `
            margin: 0 0 20px 0;
            color: ${this.theme.textColor || '#333333'};
            line-height: 1.5;
        `;
        
        content.appendChild(message);
        
        // Progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.className = 'agentlet-progress-container';
        progressContainer.style.cssText = `
            margin-bottom: 15px;
        `;
        
        // Progress bar
        const progressBar = document.createElement('div');
        progressBar.className = 'agentlet-progress-bar';
        progressBar.style.cssText = `
            width: 100%;
            height: 20px;
            background: ${this.theme.borderColor || '#e0e0e0'};
            border-radius: 10px;
            overflow: hidden;
            position: relative;
        `;
        
        const progressFill = document.createElement('div');
        progressFill.className = 'agentlet-progress-fill';
        progressFill.style.cssText = `
            height: 100%;
            background: ${this.theme.primaryColor || '#007bff'};
            width: ${config.initialProgress}%;
            transition: width 0.3s ease;
            position: relative;
        `;
        
        if (config.animated) {
            progressFill.style.backgroundImage = `
                linear-gradient(45deg, 
                    rgba(255, 255, 255, 0.2) 25%, 
                    transparent 25%, 
                    transparent 50%, 
                    rgba(255, 255, 255, 0.2) 50%, 
                    rgba(255, 255, 255, 0.2) 75%, 
                    transparent 75%
                )`;
            progressFill.style.backgroundSize = '20px 20px';
            progressFill.style.animation = 'agentlet-progress-animate 1s linear infinite';
        }
        
        progressBar.appendChild(progressFill);
        progressContainer.appendChild(progressBar);
        content.appendChild(progressContainer);
        
        // Progress info container
        const infoContainer = document.createElement('div');
        infoContainer.className = 'agentlet-progress-info';
        infoContainer.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            font-size: 14px;
            color: ${this.theme.textColor || '#666666'};
        `;
        
        // Percentage display
        if (config.showPercentage) {
            const percentage = document.createElement('span');
            percentage.className = 'agentlet-progress-percentage';
            percentage.textContent = `${Math.round(config.initialProgress)}%`;
            infoContainer.appendChild(percentage);
        }
        
        // ETA display
        if (config.showETA) {
            const eta = document.createElement('span');
            eta.className = 'agentlet-progress-eta';
            eta.textContent = 'Calculating...';
            infoContainer.appendChild(eta);
        }
        
        if (config.showPercentage || config.showETA) {
            content.appendChild(infoContainer);
        }
        
        // Steps display
        if (config.showSteps && config.stepLabels && config.stepLabels.length > 0) {
            const stepsContainer = document.createElement('div');
            stepsContainer.className = 'agentlet-progress-steps';
            stepsContainer.style.cssText = `
                margin-bottom: 15px;
            `;
            
            const stepsTitle = document.createElement('div');
            stepsTitle.textContent = 'Steps:';
            stepsTitle.style.cssText = `
                font-weight: 600;
                margin-bottom: 10px;
                color: ${this.theme.textColor || '#333333'};
            `;
            stepsContainer.appendChild(stepsTitle);
            
            config.stepLabels.forEach((stepLabel, index) => {
                const step = document.createElement('div');
                step.className = `agentlet-progress-step agentlet-progress-step-${index}`;
                step.style.cssText = `
                    padding: 5px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 14px;
                `;
                
                const stepIcon = document.createElement('span');
                stepIcon.className = 'agentlet-progress-step-icon';
                if (index < config.currentStep) {
                    stepIcon.textContent = '✅';
                    step.style.color = '#28a745';
                } else if (index === config.currentStep) {
                    stepIcon.textContent = '⏳';
                    step.style.color = this.theme.primaryColor || '#007bff';
                } else {
                    stepIcon.textContent = '⚪';
                    step.style.color = '#999999';
                }
                
                const stepText = document.createElement('span');
                stepText.textContent = stepLabel;
                
                step.appendChild(stepIcon);
                step.appendChild(stepText);
                stepsContainer.appendChild(step);
            });
            
            content.appendChild(stepsContainer);
        }
        
        this.dialog.appendChild(header);
        this.dialog.appendChild(content);
        this.overlay.appendChild(this.dialog);
    }
    
    /**
     * Create fullscreen dialog
     */
    createFullscreenDialog(config) {
        const $ = window.agentlet.$;
        if (!$) return;
        
        this.dialog = document.createElement('div');
        this.dialog.className = 'agentlet-fullscreen-dialog';
        this.dialog.style.cssText = `
            background: ${this.theme.backgroundColor || '#ffffff'};
            border-radius: ${this.theme.borderRadius || '12px'};
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            width: 90%;
            height: 90%;
            max-width: 90vw;
            max-height: 90vh;
            font-family: ${this.theme.fontFamily || 'system-ui, -apple-system, sans-serif'};
            display: flex;
            flex-direction: column;
            position: relative;
            z-index: ${Z_INDEX.DIALOG};
        `;
        
        // Create header
        const header = document.createElement('div');
        header.className = 'agentlet-fullscreen-header';
        header.style.cssText = `
            padding: 24px 30px;
            border-bottom: 2px solid ${this.theme.borderColor || '#e0e0e0'};
            display: flex;
            align-items: center;
            gap: 15px;
            flex-shrink: 0;
            background: ${this.theme.headerBackground || 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'};
            border-radius: ${this.theme.borderRadius || '12px'} ${this.theme.borderRadius || '12px'} 0 0;
        `;
        
        const icon = document.createElement('span');
        icon.textContent = config.icon;
        icon.style.cssText = 'font-size: 32px;';
        
        const title = document.createElement('h2');
        title.textContent = config.title;
        title.style.cssText = `
            margin: ${this.theme.dialogHeaderTextMargin || '0'};
            color: ${this.theme.dialogHeaderTextColor || this.theme.headerTextColor || '#333333'};
            font-size: 24px;
            font-weight: 700;
            flex: 1;
        `;
        
        header.appendChild(icon);
        header.appendChild(title);
        
        // Close button (conditional)
        if (config.showHeaderCloseButton) {
            const closeButton = document.createElement('button');
            closeButton.textContent = '×';
            closeButton.style.cssText = `
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                padding: 0;
                width: 40px;
                height: 40px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: ${this.theme.textColor || '#333333'};
                opacity: 0.6;
                transition: all 0.2s;
                border-radius: 50%;
            `;
            
            closeButton.addEventListener('click', () => {
                this.hide('close');
            });
            
            closeButton.addEventListener('mouseenter', () => {
                closeButton.style.opacity = '1';
                closeButton.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
            });
            
            closeButton.addEventListener('mouseleave', () => {
                closeButton.style.opacity = '0.6';
                closeButton.style.backgroundColor = 'transparent';
            });
            
            header.appendChild(closeButton);
        }
        
        // Create content area
        const content = document.createElement('div');
        content.className = 'agentlet-fullscreen-content';
        content.style.cssText = `
            padding: 30px;
            color: ${this.theme.textColor || '#333333'};
            line-height: 1.6;
            font-size: 16px;
            flex: 1;
            display: flex;
            flex-direction: column;
            ${config.scrollable ? 'overflow-y: auto;' : 'overflow: hidden;'}
        `;
        
        // Add main message if provided
        if (config.message) {
            const message = document.createElement('div');
            message.className = 'agentlet-fullscreen-message';
            message.style.cssText = `
                margin-bottom: 20px;
            `;
            
            if (config.allowHtml) {
                message.innerHTML = config.message;
            } else {
                message.textContent = config.message;
            }
            
            content.appendChild(message);
        }
        
        // Add custom content if provided
        if (config.customContent) {
            const customDiv = document.createElement('div');
            customDiv.className = 'agentlet-fullscreen-custom';
            customDiv.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
            `;
            
            if (typeof config.customContent === 'string') {
                if (config.allowHtml) {
                    customDiv.innerHTML = config.customContent;
                } else {
                    customDiv.textContent = config.customContent;
                }
            } else if (config.customContent instanceof HTMLElement) {
                customDiv.appendChild(config.customContent);
            }
            
            content.appendChild(customDiv);
        }
        
        // Create footer with buttons
        const footer = document.createElement('div');
        footer.className = 'agentlet-fullscreen-footer';
        footer.style.cssText = `
            padding: 24px 30px;
            border-top: 2px solid ${this.theme.borderColor || '#e0e0e0'};
            display: flex;
            gap: 15px;
            justify-content: flex-end;
            flex-shrink: 0;
            background: ${this.theme.footerBackground || 'rgba(248, 249, 250, 0.8)'};
            border-radius: 0 0 ${this.theme.borderRadius || '12px'} ${this.theme.borderRadius || '12px'};
        `;
        
        config.buttons.forEach(buttonConfig => {
            const button = document.createElement('button');
            button.textContent = buttonConfig.text;
            button.disabled = buttonConfig.disabled || false;
            
            let buttonStyle = `
                padding: 12px 24px;
                border: 2px solid ${this.theme.borderColor || '#ccc'};
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
                font-weight: 600;
                transition: all 0.2s;
                min-width: 100px;
            `;
            
            if (buttonConfig.primary) {
                buttonStyle += `
                    background: ${this.theme.primaryColor || '#007bff'};
                    color: white;
                    border-color: ${this.theme.primaryColor || '#007bff'};
                `;
                button.addEventListener('mouseenter', () => {
                    button.style.transform = 'translateY(-1px)';
                    button.style.boxShadow = '0 4px 12px rgba(0, 123, 255, 0.3)';
                });
                button.addEventListener('mouseleave', () => {
                    button.style.transform = 'translateY(0)';
                    button.style.boxShadow = 'none';
                });
            } else if (buttonConfig.danger) {
                buttonStyle += `
                    background: #dc3545;
                    color: white;
                    border-color: #dc3545;
                `;
                button.addEventListener('mouseenter', () => {
                    button.style.transform = 'translateY(-1px)';
                    button.style.boxShadow = '0 4px 12px rgba(220, 53, 69, 0.3)';
                });
                button.addEventListener('mouseleave', () => {
                    button.style.transform = 'translateY(0)';
                    button.style.boxShadow = 'none';
                });
            } else {
                buttonStyle += `
                    background: ${this.theme.actionButtonBackground || '#f8f9fa'};
                    color: ${this.theme.actionButtonText || '#333333'};
                `;
                button.addEventListener('mouseenter', () => {
                    button.style.backgroundColor = '#e9ecef';
                    button.style.transform = 'translateY(-1px)';
                });
                button.addEventListener('mouseleave', () => {
                    button.style.backgroundColor = this.theme.actionButtonBackground || '#f8f9fa';
                    button.style.transform = 'translateY(0)';
                });
            }
            
            button.style.cssText = buttonStyle;
            
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hide(buttonConfig.value);
            });
            
            footer.appendChild(button);
        });
        
        this.dialog.appendChild(header);
        this.dialog.appendChild(content);
        this.dialog.appendChild(footer);
        
        this.overlay.appendChild(this.dialog);
    }
    
    /**
     * Update progress dialog display
     */
    updateProgressDisplay() {
        if (!this.isActive || this.type !== 'progress') return;
        
        const progressFill = this.dialog?.querySelector('.agentlet-progress-fill');
        const percentage = this.dialog?.querySelector('.agentlet-progress-percentage');
        const eta = this.dialog?.querySelector('.agentlet-progress-eta');
        
        if (progressFill) {
            progressFill.style.width = `${this.currentProgress}%`;
        }
        
        if (percentage) {
            percentage.textContent = `${Math.round(this.currentProgress)}%`;
        }
        
        if (eta && this.startTime) {
            const elapsed = Date.now() - this.startTime;
            const rate = this.currentProgress / elapsed;
            const remaining = (100 - this.currentProgress) / rate;
            
            if (this.currentProgress > 5 && remaining > 0) {
                const seconds = Math.round(remaining / 1000);
                if (seconds < 60) {
                    eta.textContent = `ETA: ${seconds}s`;
                } else {
                    const minutes = Math.floor(seconds / 60);
                    const remainingSeconds = seconds % 60;
                    eta.textContent = `ETA: ${minutes}m ${remainingSeconds}s`;
                }
            } else {
                eta.textContent = 'Calculating...';
            }
        }
    }
    
    /**
     * Update progress percentage and message
     */
    updateProgress(percentage, message) {
        if (!this.isActive || this.type !== 'progress') {
            console.warn('No active progress dialog to update');
            return this;
        }
        
        this.currentProgress = Math.max(0, Math.min(100, percentage));
        
        if (message) {
            const messageElement = this.dialog?.querySelector('.agentlet-progress-message');
            if (messageElement) {
                messageElement.textContent = message;
            }
        }
        
        this.updateProgressDisplay();
        
        if (this.onProgress) {
            this.onProgress(this.currentProgress, message);
        }
        
        return this;
    }
    
    /**
     * Set current step in progress dialog
     */
    setStep(stepIndex, stepMessage) {
        if (!this.isActive || this.type !== 'progress') {
            console.warn('No active progress dialog to update');
            return this;
        }
        
        this.currentStep = stepIndex;
        
        // Update step visual indicators
        const steps = this.dialog?.querySelectorAll('.agentlet-progress-step');
        if (steps) {
            steps.forEach((step, index) => {
                const icon = step.querySelector('.agentlet-progress-step-icon');
                if (icon) {
                    if (index < stepIndex) {
                        icon.textContent = '✅';
                        step.style.color = '#28a745';
                    } else if (index === stepIndex) {
                        icon.textContent = '⏳';
                        step.style.color = this.theme.primaryColor || '#007bff';
                    } else {
                        icon.textContent = '⚪';
                        step.style.color = '#999999';
                    }
                }
            });
        }
        
        // Update main message if provided
        if (stepMessage) {
            const messageElement = this.dialog?.querySelector('.agentlet-progress-message');
            if (messageElement) {
                messageElement.textContent = stepMessage;
            }
        }
        
        // Update percentage based on step
        if (this.totalSteps > 0) {
            const stepProgress = (stepIndex / this.totalSteps) * 100;
            this.updateProgress(stepProgress);
        }
        
        return this;
    }
    
    /**
     * Complete progress dialog
     */
    completeProgress(message = 'Complete!') {
        if (!this.isActive || this.type !== 'progress') {
            console.warn('No active progress dialog to complete');
            return this;
        }
        
        this.updateProgress(100, message);
        
        // Mark all steps as complete
        const steps = this.dialog?.querySelectorAll('.agentlet-progress-step');
        if (steps) {
            steps.forEach(step => {
                const icon = step.querySelector('.agentlet-progress-step-icon');
                if (icon) {
                    icon.textContent = '✅';
                    step.style.color = '#28a745';
                }
            });
        }
        
        if (this.onComplete) {
            this.onComplete();
        }
        
        // Auto-close if enabled
        const config = this.dialog?.dataset?.autoClose !== 'false';
        if (config) {
            setTimeout(() => {
                if (this.isActive) {
                    this.hide('complete');
                }
            }, 2000);
        }
        
        return this;
    }
    
    /**
     * Add CSS animations for dialogs
     */
    addDialogStyles() {
        if (document.getElementById('agentlet-dialog-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'agentlet-dialog-styles';
        style.textContent = `
            @keyframes pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.1); opacity: 0.7; }
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes agentlet-progress-animate {
                0% { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    /**
     * Remove dialog element
     */
    removeDialog() {
        const $ = window.agentlet.$;
        if (this.dialog && $) {
            $(this.dialog).remove();
            this.dialog = null;
        }
    }
    
    /**
     * Add event listeners
     */
    addEventListeners() {
        document.addEventListener('keydown', this.handleKeydown);
        if (this.overlay) {
            this.overlay.addEventListener('click', this.handleOverlayClick);
        }
    }
    
    /**
     * Remove event listeners
     */
    removeEventListeners() {
        document.removeEventListener('keydown', this.handleKeydown);
        if (this.overlay) {
            this.overlay.removeEventListener('click', this.handleOverlayClick);
        }
    }
    
    /**
     * Handle keydown events
     */
    handleKeydown(event) {
        if (!this.isActive) return;
        
        if (event.key === 'Escape') {
            event.preventDefault();
            
            if (this.type === 'wait') {
                // Only allow escape in wait dialogs if cancel is allowed
                const config = this.dialog?.querySelector('.agentlet-wait-buttons');
                if (config && this.cancelCallback) {
                    this.cancelCallback();
                    this.hide(true);
                }
            } else if (this.type === 'input') {
                this.hide(null);
            } else if (this.type === 'command') {
                this.hide(null);
            } else {
                this.hide('cancel');
            }
        } else if (event.key === 'Enter') {
            event.preventDefault();
            
            if (this.type === 'input') {
                // For textarea, require Ctrl+Enter or Cmd+Enter
                if (this.activeInput?.tagName.toLowerCase() === 'textarea') {
                    if (event.ctrlKey || event.metaKey) {
                        this.hide(this.activeInput.value);
                    }
                } else {
                    this.hide(this.activeInput?.value);
                }
            } else if (this.type === 'command') {
                // For command prompt, Enter submits directly
                if (this.activeInput?.tagName.toLowerCase() === 'textarea') {
                    if (event.ctrlKey || event.metaKey) {
                        this.hide(this.activeInput.value.trim());
                    }
                } else {
                    this.hide(this.activeInput?.value.trim());
                }
            } else if (this.type === 'info') {
                // Click primary button if available
                const primaryButton = this.dialog?.querySelector(`button[style*="background: ${  this.theme.primaryColor || '#007bff'  }"]`);
                if (primaryButton && !primaryButton.disabled) {
                    primaryButton.click();
                }
            }
        }
    }
    
    /**
     * Handle overlay click
     */
    handleOverlayClick(event) {
        if (event.target === this.overlay) {
            if (this.type === 'input') {
                this.hide(null);
            } else if (this.type === 'command') {
                // Check if command dialog allows closing on overlay click
                const closeOnOverlay = this.dialog?.dataset?.closeOnOverlay !== 'false';
                if (closeOnOverlay) {
                    this.hide(null);
                }
            } else if (this.type === 'info') {
                this.hide('cancel');
            } else if (this.type === 'fullscreen') {
                // Check if fullscreen dialog allows closing on overlay click
                const config = this.dialog?.dataset?.closeOnOverlay !== 'false';
                if (config) {
                    this.hide('cancel');
                }
            }
            // Wait dialogs don't close on overlay click unless cancel is allowed
        }
    }
    
    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
}

// Export for ES modules
export default Dialog;

// Also export for global scope for compatibility
if (typeof window !== 'undefined') {
    window.Dialog = Dialog;
}