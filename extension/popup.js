// Popup script for the Agentlet Core extension

document.addEventListener('DOMContentLoaded', function () {
    const status = document.getElementById('status');

    function setStatus(text) {
        status.textContent = text;
    }

    document.getElementById('activate').addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || tab.id === undefined) {
            setStatus('No active tab found.');
            return;
        }
        try {
            const response = await chrome.runtime.sendMessage({ type: 'ACTIVATE_TAB', tabId: tab.id });
            if (response && response.success) {
                window.close();
            } else {
                setStatus('Could not run on this page: ' + ((response && response.error) || 'unknown error'));
            }
        } catch (error) {
            setStatus('Could not run on this page: ' + error.message);
        }
    });

    document.getElementById('options').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    // Fall back to the existing icon if the logo is missing
    document.getElementById('logo').addEventListener('error', function () {
        this.src = 'icons/icon-48.png';
    });
});
