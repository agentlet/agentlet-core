// Welcome page script for Agentlet Core extension

document.addEventListener('DOMContentLoaded', function() {
    // Get started button handler
    document.getElementById('get-started-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        
        // Open a new tab and activate Agentlet Core
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url && !tab.url.startsWith('chrome://')) {
            // Switch to the tab and activate
            await chrome.tabs.update(tab.id, { active: true });
            window.close();
        } else {
            // Open a demo page
            await chrome.tabs.create({ 
                url: 'https://example.com',
                active: true
            });
            window.close();
        }
    });
    
    // Settings button handler
    document.getElementById('settings-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        await chrome.tabs.create({ 
            url: chrome.runtime.getURL('options.html'),
            active: true
        });
        window.close();
    });
});