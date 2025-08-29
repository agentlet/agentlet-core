// Popup script for Agentlet Core extension

document.addEventListener('DOMContentLoaded', function() {
    // Activate button handler
    document.getElementById('activate').addEventListener('click', () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
                // Send message to background script to toggle Agentlet Core
                chrome.runtime.sendMessage({
                    type: 'TOGGLE_AGENTLET',
                    tabId: tabs[0].id
                }, (response) => {
                    if (response && response.success) {
                        console.log('Agentlet Core activation requested');
                        window.close(); // Close popup after activation
                    } else {
                        console.error('Failed to activate Agentlet Core:', response?.error);
                    }
                });
            }
        });
    });
    
    // Options button handler
    document.getElementById('options').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Handle logo loading error gracefully
    document.getElementById('logo').addEventListener('error', function() {
        // If logo-48.png doesn't exist, fall back to existing icon
        this.src = 'icons/icon-48.png';
    });
});