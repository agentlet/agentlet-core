// Welcome page script for the Agentlet Core extension

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('settings-btn').addEventListener('click', (event) => {
        event.preventDefault();
        chrome.runtime.openOptionsPage();
    });
});
