/**
 * Shared Console and Status Utilities for Agentlet Examples
 * Provides consistent console logging, status updates, and statistics tracking
 */

class ConsoleUtils {
    constructor() {
        this.messageCount = 0;
        this.errorCount = 0;
        this.warningCount = 0;
        this.lastAction = 'None';
    }

    /**
     * Log a message to the console section with timestamp and type indicator
     * @param {string} message - The message to log
     * @param {string} type - Message type: 'info', 'success', 'warning', 'error'
     */
    log(message, type = 'info') {
        const consoleElement = document.getElementById('console');
        if (!consoleElement) {
            console.warn('Console element not found');
            return;
        }

        const timestamp = new Date().toLocaleTimeString();
        const prefix = this.getTypePrefix(type);
        
        consoleElement.textContent += `[${timestamp}] ${prefix} ${message}\n`;
        consoleElement.scrollTop = consoleElement.scrollHeight;
        
        this.messageCount++;
        if (type === 'error') this.errorCount++;
        if (type === 'warning') this.warningCount++;
        
        this.updateStats();
    }

    /**
     * Update the status section with a message and type
     * @param {string} message - Status message
     * @param {string} type - Status type: 'info', 'success', 'warning', 'error'
     */
    updateStatus(message, type = 'info') {
        const statusElement = document.getElementById('status');
        if (!statusElement) {
            console.warn('Status element not found');
            return;
        }

        statusElement.textContent = message;
        statusElement.className = `status-section ${type}`;
        
        this.lastAction = message;
        this.updateStats();
    }

    /**
     * Update statistics display
     */
    updateStats() {
        const elements = {
            messageCount: document.getElementById('messageCount'),
            errorCount: document.getElementById('errorCount'),
            warningCount: document.getElementById('warningCount'),
            lastAction: document.getElementById('lastAction')
        };

        if (elements.messageCount) elements.messageCount.textContent = this.messageCount;
        if (elements.errorCount) elements.errorCount.textContent = this.errorCount;
        if (elements.warningCount) elements.warningCount.textContent = this.warningCount;
        if (elements.lastAction) elements.lastAction.textContent = this.lastAction;
    }

    /**
     * Clear the console and reset statistics
     */
    clearConsole() {
        const consoleElement = document.getElementById('console');
        if (consoleElement) {
            consoleElement.textContent = '';
        }
        
        this.messageCount = 0;
        this.errorCount = 0;
        this.warningCount = 0;
        
        this.updateStats();
        this.updateStatus('Console cleared', 'info');
    }

    /**
     * Get the appropriate prefix for a message type
     * @param {string} type - Message type
     * @returns {string} Emoji prefix
     */
    getTypePrefix(type) {
        switch (type) {
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'success': return '✅';
            default: return 'ℹ️';
        }
    }

    /**
     * Set button loading state
     * @param {string} buttonId - ID of the button element
     * @param {boolean} loading - Whether to show loading state
     */
    setButtonLoading(buttonId, loading = true) {
        const button = document.getElementById(buttonId);
        if (!button) return;
        
        if (loading) {
            button.dataset.originalText = button.textContent;
            button.textContent = '⏳ Processing...';
            button.disabled = true;
            button.style.opacity = '0.7';
        } else {
            button.textContent = button.dataset.originalText || button.textContent;
            button.disabled = false;
            button.style.opacity = '1';
            delete button.dataset.originalText;
        }
    }
}

// Create global instance
window.consoleUtils = new ConsoleUtils();

// Convenience functions for global access
window.log = (message, type) => window.consoleUtils.log(message, type);
window.updateStatus = (message, type) => window.consoleUtils.updateStatus(message, type);
window.clearConsole = () => window.consoleUtils.clearConsole();
window.setButtonLoading = (buttonId, loading) => window.consoleUtils.setButtonLoading(buttonId, loading);

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
    window.consoleUtils.log('Console utilities loaded', 'success');
    window.consoleUtils.updateStatus('Ready', 'info');
});