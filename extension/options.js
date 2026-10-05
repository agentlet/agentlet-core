// Options script for the Agentlet Core extension
import { BUNDLED_MODULES } from './bundled-modules.js';

const SETTINGS_KEY = 'agentletSettings';

document.addEventListener('DOMContentLoaded', async function () {
    const debugMode = document.getElementById('debugMode');
    const startMinimized = document.getElementById('startMinimized');
    const saved = document.getElementById('saved');

    document.getElementById('modules').textContent =
        BUNDLED_MODULES.length > 0 ? BUNDLED_MODULES.join(', ') : 'None.';

    const stored = await chrome.storage.sync.get(SETTINGS_KEY);
    const settings = stored[SETTINGS_KEY] || {};
    debugMode.checked = settings.debugMode === true;
    startMinimized.checked = settings.startMinimized === true;

    document.getElementById('save').addEventListener('click', async () => {
        await chrome.storage.sync.set({
            [SETTINGS_KEY]: {
                debugMode: debugMode.checked,
                startMinimized: startMinimized.checked
            }
        });
        saved.textContent = 'Saved. The settings apply the next time you activate the extension on a page.';
    });

    // Fall back to the existing icon if the logo is missing
    document.getElementById('logo').addEventListener('error', function () {
        this.src = 'icons/icon-128.png';
    });
});
