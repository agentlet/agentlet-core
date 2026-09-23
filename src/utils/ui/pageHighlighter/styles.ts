/**
 * CSS injection for PageHighlighter overlays, highlights and their
 * decorations (arrows, stickers, tooltips, progress bars).
 */
import { Z_INDEX } from '../ZIndex.js';
import type { PageHighlighterContext } from './types.js';

const STYLES = `
    /* Base overlay styles */
    .agentlet-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        z-index: ${Z_INDEX.DIALOG_OVERLAY};
        pointer-events: auto;
        transition: opacity 0.3s ease;
    }

    .agentlet-overlay.fade-in {
        opacity: 0;
        animation: agentletFadeIn 0.3s ease forwards;
    }

    .agentlet-overlay.fade-out {
        animation: agentletFadeOut 0.3s ease forwards;
    }

    /* Message overlay container - full width banners that stick to viewport */
    .agentlet-message-overlay {
        position: fixed;
        left: 0;
        right: 0;
        width: 100%;
        z-index: ${Z_INDEX.DIALOG_OVERLAY};
        pointer-events: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .agentlet-message-overlay.top {
        top: 0;
    }

    .agentlet-message-overlay.bottom {
        bottom: 0;
    }

    .agentlet-message-overlay.center {
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: auto;
        max-width: 90%;
        min-width: 400px;
    }

    /* Message content - full width banner style */
    .agentlet-message-content {
        background: #007bff;
        color: white;
        padding: 16px 24px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        text-align: center;
        font-size: 16px;
        font-weight: 500;
        line-height: 1.4;
        position: relative;
        animation: agentletSlideIn 0.4s ease forwards;
    }

    /* Center style gets different styling */
    .agentlet-message-overlay.center .agentlet-message-content {
        border-radius: 12px;
        padding: 24px 32px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
        background: white;
        color: #333;
    }

    /* Type-specific styling for banner messages */
    .agentlet-message-content.info {
        background: #007bff;
        color: white;
    }

    .agentlet-message-content.success {
        background: #28a745;
        color: white;
    }

    .agentlet-message-content.warning {
        background: #ffc107;
        color: #333;
    }

    .agentlet-message-content.error {
        background: #dc3545;
        color: white;
    }

    /* Center overlays keep their original styling */
    .agentlet-message-overlay.center .agentlet-message-content.info {
        background: white;
        color: #333;
        border-left: 4px solid #007cba;
    }

    .agentlet-message-overlay.center .agentlet-message-content.success {
        background: white;
        color: #333;
        border-left: 4px solid #28a745;
    }

    .agentlet-message-overlay.center .agentlet-message-content.warning {
        background: white;
        color: #333;
        border-left: 4px solid #ffc107;
    }

    .agentlet-message-overlay.center .agentlet-message-content.error {
        background: white;
        color: #333;
        border-left: 4px solid #dc3545;
    }

    /* Close button */
    .agentlet-message-close {
        position: absolute;
        top: 50%;
        right: 16px;
        transform: translateY(-50%);
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 14px;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s ease;
    }

    .agentlet-message-close:hover {
        background: rgba(255, 255, 255, 0.3);
    }

    /* Close button for center overlays */
    .agentlet-message-overlay.center .agentlet-message-close {
        background: rgba(0, 0, 0, 0.1);
        color: #666;
    }

    .agentlet-message-overlay.center .agentlet-message-close:hover {
        background: rgba(0, 0, 0, 0.2);
    }

    /* Close button for warning banners */
    .agentlet-message-content.warning .agentlet-message-close {
        background: rgba(0, 0, 0, 0.1);
        color: #333;
    }

    .agentlet-message-content.warning .agentlet-message-close:hover {
        background: rgba(0, 0, 0, 0.2);
    }

    .agentlet-message-text {
        font-size: 18px;
        font-weight: 500;
        color: inherit;
        margin: 0;
        line-height: 1.4;
    }

    /* Progress bar styles */
    .agentlet-progress-container {
        margin-top: 16px;
        width: 100%;
    }

    .agentlet-progress-bar {
        width: 100%;
        height: 16px;
        background: rgba(0, 0, 0, 0.2);
        border-radius: 8px;
        overflow: hidden;
        border: 2px solid rgba(255, 255, 255, 0.6);
        margin: 8px 0;
    }

    .agentlet-progress-fill {
        height: 100%;
        background: #ffffff;
        border-radius: 6px;
        transition: width 0.3s ease;
        min-width: 4px;
        box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    .agentlet-progress-text {
        font-size: 14px;
        color: rgba(255, 255, 255, 0.9);
        margin-top: 8px;
        font-weight: 500;
    }

    /* Progress bar styling for center overlays (original style) */
    .agentlet-message-overlay.center .agentlet-progress-bar {
        background: #e9ecef;
    }

    .agentlet-message-overlay.center .agentlet-progress-fill {
        background: #007cba;
    }

    .agentlet-message-overlay.center .agentlet-progress-text {
        color: #666;
    }

    /* Specific progress styling for warning banners */
    .agentlet-message-content.warning .agentlet-progress-bar {
        background: rgba(0, 0, 0, 0.1);
    }

    .agentlet-message-content.warning .agentlet-progress-fill {
        background: rgba(0, 0, 0, 0.6);
    }

    .agentlet-message-content.warning .agentlet-progress-text {
        color: #333;
    }

    /* Element highlight styles */
    .agentlet-highlight-container {
        position: absolute;
        pointer-events: none;
        z-index: ${Z_INDEX.HIGHLIGHT_BACKDROP};
        transition: all 0.3s ease;
    }

    .agentlet-highlight-border {
        position: absolute;
        border: 3px solid #007cba;
        border-radius: 8px;
        pointer-events: none;
        animation: agentletPulse 2s infinite;
    }

    .agentlet-highlight-border.primary {
        border-color: #007cba;
    }

    .agentlet-highlight-border.success {
        border-color: #28a745;
    }

    .agentlet-highlight-border.warning {
        border-color: #ffc107;
    }

    .agentlet-highlight-border.danger {
        border-color: #dc3545;
    }

    /* Arrow pointer */
    .agentlet-arrow {
        position: absolute;
        z-index: ${Z_INDEX.HOVER_HIGHLIGHT};
        pointer-events: none;
    }

    .agentlet-arrow::before {
        content: '';
        position: absolute;
        width: 0;
        height: 0;
        border-style: solid;
    }

    .agentlet-arrow.top::before {
        border-left: 12px solid transparent;
        border-right: 12px solid transparent;
        border-bottom: 16px solid #007cba;
        top: -16px;
        left: 50%;
        transform: translateX(-50%);
    }

    .agentlet-arrow.bottom::before {
        border-left: 12px solid transparent;
        border-right: 12px solid transparent;
        border-top: 16px solid #007cba;
        bottom: -16px;
        left: 50%;
        transform: translateX(-50%);
    }

    .agentlet-arrow.left::before {
        border-top: 12px solid transparent;
        border-bottom: 12px solid transparent;
        border-right: 16px solid #007cba;
        right: -16px;
        top: 50%;
        transform: translateY(-50%);
    }

    .agentlet-arrow.right::before {
        border-top: 12px solid transparent;
        border-bottom: 12px solid transparent;
        border-left: 16px solid #007cba;
        left: -16px;
        top: 50%;
        transform: translateY(-50%);
    }

    /* Message tooltip */
    .agentlet-tooltip {
        position: absolute;
        background: #333;
        color: white;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 14px;
        white-space: nowrap;
        z-index: ${Z_INDEX.ACTIVE_SELECTION};
        pointer-events: none;
        animation: agentletFadeIn 0.3s ease;
    }

    .agentlet-tooltip::after {
        content: '';
        position: absolute;
        width: 0;
        height: 0;
        border-style: solid;
    }

    .agentlet-tooltip.top::after {
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-top: 6px solid #333;
        bottom: -6px;
        left: 50%;
        transform: translateX(-50%);
    }

    .agentlet-tooltip.bottom::after {
        border-left: 6px solid transparent;
        border-right: 6px solid transparent;
        border-bottom: 6px solid #333;
        top: -6px;
        left: 50%;
        transform: translateX(-50%);
    }

    /* Sticker/badge styles */
    .agentlet-sticker {
        position: absolute;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #007cba;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        font-size: 16px;
        z-index: ${Z_INDEX.HOVER_HIGHLIGHT};
        animation: agentletBounce 1s infinite;
        cursor: pointer;
    }

    .agentlet-sticker.success {
        background: #28a745;
    }

    .agentlet-sticker.warning {
        background: #ffc107;
    }

    .agentlet-sticker.danger {
        background: #dc3545;
    }

    /* Animations */
    @keyframes agentletFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    @keyframes agentletFadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
    }

    @keyframes agentletSlideIn {
        from {
            opacity: 0;
            transform: translateY(-20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    @keyframes agentletPulse {
        0%, 100% {
            transform: scale(1);
            opacity: 1;
        }
        50% {
            transform: scale(1.05);
            opacity: 0.8;
        }
    }

    @keyframes agentletBounce {
        0%, 20%, 50%, 80%, 100% {
            transform: translateY(0);
        }
        40% {
            transform: translateY(-10px);
        }
        60% {
            transform: translateY(-5px);
        }
    }

    @keyframes agentletProgressShimmer {
        0% {
            background-position: -200px 0;
        }
        100% {
            background-position: calc(200px + 100%) 0;
        }
    }

    /* Clickable highlights */
    .agentlet-highlight-clickable {
        pointer-events: auto;
        cursor: pointer;
    }

    .agentlet-highlight-clickable:hover {
        transform: scale(1.02);
    }

    /* Responsive adjustments */
    @media (max-width: 768px) {
        .agentlet-message-content {
            padding: 20px 24px;
            margin: 0 16px;
        }

        .agentlet-message-text {
            font-size: 16px;
        }

        .agentlet-tooltip {
            font-size: 12px;
            padding: 6px 10px;
        }
    }
`;

/**
 * Injects PageHighlighter's stylesheet into `<head>` once per instance.
 * `context.styleInjected` only guards re-injection on the *same* instance -
 * a second PageHighlighter instance injects its own separate `<style>`
 * element, matching the original per-instance (not global) dedup.
 */
export function ensureStyles(context: PageHighlighterContext): void {
    if (context.styleInjected) return;

    const styleElement = document.createElement('style');
    styleElement.textContent = STYLES;
    document.head.appendChild(styleElement);
    context.styleInjected = true;
}
