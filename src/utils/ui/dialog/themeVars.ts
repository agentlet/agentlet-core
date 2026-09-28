/**
 * Theme-driven inline style values shared by the dialog builders.
 *
 * Each helper wraps its resolved value in `var(--agentlet-*, fallback)`.
 * `StyleInjector` keeps the `--agentlet-*` custom properties on `:root` in
 * sync with the current theme (see `generateCSSProperties()`), and
 * `AgentletCore.setTheme()` re-injects them on every call
 * (`regenerateStyles()`). Custom properties are inherited and not stopped
 * by a shadow boundary, so an *already open* dialog built with one of
 * these values keeps following `setTheme()` live, with no DOM walk needed:
 * the browser re-evaluates `var(...)` the moment the `:root` value changes.
 *
 * The fallback (used when no such custom property is in scope, e.g. a
 * standalone `new Dialog()` with no mounted `AgentletCore`/StyleInjector
 * around it) is a plain literal computed from the theme object passed at
 * build time, matching the dialog's previous (non-reactive) behaviour.
 */
import type { DialogTheme } from './types';

const DEFAULT_HEADER_BACKGROUND = 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)';
const DEFAULT_HEADER_TEXT_COLOR = '#333333';
const DEFAULT_BACKGROUND = '#ffffff';
const DEFAULT_TEXT_COLOR = '#333333';

function cssVar(name: string, fallback: string): string {
    return `var(${name}, ${fallback})`;
}

/**
 * A dialog header's background and text colour must come from the same
 * pair (see `ThemeManager.processThemeConfig()`, which normalizes
 * `dialogHeaderBackground`/`dialogHeaderTextColor` to inherit from
 * `headerBackground`/`headerTextColor` together when a caller only sets
 * the panel pair). Reading `theme.dialogHeaderBackground` here first, with
 * `theme.headerBackground` only as a fallback for a `DialogTheme` that
 * never went through `ThemeManager`, keeps that pairing intact.
 */
export function dialogHeaderBackground(theme: DialogTheme): string {
    return cssVar(
        '--agentlet-dialog-header-background',
        theme.dialogHeaderBackground || theme.headerBackground || DEFAULT_HEADER_BACKGROUND
    );
}

export function dialogHeaderTextColor(theme: DialogTheme): string {
    return cssVar(
        '--agentlet-dialog-header-text-color',
        theme.dialogHeaderTextColor || theme.headerTextColor || DEFAULT_HEADER_TEXT_COLOR
    );
}

/** A dialog's own wrapper background (every dialog type uses `backgroundColor`, the same key the side panel uses - see `--agentlet-background-color`). */
export function dialogBackground(theme: DialogTheme): string {
    return cssVar('--agentlet-background-color', theme.backgroundColor || DEFAULT_BACKGROUND);
}

/** A dialog's main text colour (message/content, not the header - see `dialogHeaderTextColor()`). */
export function dialogTextColor(theme: DialogTheme): string {
    return cssVar('--agentlet-text-color', theme.textColor || DEFAULT_TEXT_COLOR);
}
