/**
 * CSS keyframe animations shared by every dialog type (spinner, pulsing
 * wait icon, animated progress-bar stripes).
 */
const DIALOG_STYLE_ELEMENT_ID = 'agentlet-dialog-styles';

const DIALOG_STYLES_CSS = `
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

/**
 * Injects the shared dialog `<style>` element into `document.head` once.
 * Safe to call from every constructor/render path - it is a no-op if the
 * element (identified by {@link DIALOG_STYLE_ELEMENT_ID}) already exists.
 */
export function addDialogStyles(): void {
    if (document.getElementById(DIALOG_STYLE_ELEMENT_ID)) return;

    const style = document.createElement('style');
    style.id = DIALOG_STYLE_ELEMENT_ID;
    style.textContent = DIALOG_STYLES_CSS;

    document.head.appendChild(style);
}
