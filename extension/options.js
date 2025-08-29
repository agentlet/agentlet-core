// Options script for Agentlet Core extension

document.addEventListener('DOMContentLoaded', function() {
    // Save button handler
    document.getElementById('save').addEventListener('click', () => {
        chrome.storage.sync.set({
            enabled: document.getElementById('enabled').checked
        });
    });
    
    // Load current settings
    chrome.storage.sync.get(['enabled'], (result) => {
        document.getElementById('enabled').checked = result.enabled || false;
    });

    // Handle logo loading error gracefully
    document.getElementById('logo').addEventListener('error', function() {
        // If logo-64.png doesn't exist, fall back to existing icon
        this.src = 'icons/icon-128.png';
    });
});