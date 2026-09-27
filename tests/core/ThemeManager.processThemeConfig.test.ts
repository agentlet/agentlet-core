/**
 * Unit tests for `ThemeManager.processThemeConfig()`'s dialog-header
 * pairing rule and its `contrastingTextColor()` safeguard.
 *
 * A dialog header's background and text colour must always come from the
 * same pair: either both dialog-specific (`dialogHeaderBackground`/
 * `dialogHeaderTextColor`) or both panel header values
 * (`headerBackground`/`headerTextColor`). Before this fix, a theme that
 * only set `headerBackground`/`headerTextColor` (e.g. a dark navy header
 * with white text) still fell back to the dialog-specific default text
 * colour (`#333333`, dark) against the customized background, which can be
 * unreadable - see src/utils/ui/dialog/*.ts and the Dialog builders that
 * read `theme.dialogHeaderBackground`/`theme.dialogHeaderTextColor`.
 */
import { ThemeManager, contrastingTextColor } from '../../src/core/ThemeManager';

describe('ThemeManager.processThemeConfig() - dialog header pairing', () => {
    it('inherits both dialogHeaderBackground and dialogHeaderTextColor from a theme that only sets headerBackground/headerTextColor', () => {
        const themeManager = new ThemeManager({
            theme: { headerBackground: '#0f3350', headerTextColor: '#ffffff' }
        });

        const theme = themeManager.getTheme();

        expect(theme.dialogHeaderBackground).toBe('#0f3350');
        expect(theme.dialogHeaderTextColor).toBe('#ffffff');
    });

    it('leaves an explicit dialogHeaderBackground/dialogHeaderTextColor pair untouched even when headerBackground/headerTextColor also differ', () => {
        const themeManager = new ThemeManager({
            theme: {
                headerBackground: '#0f3350',
                headerTextColor: '#ffffff',
                dialogHeaderBackground: '#123456',
                dialogHeaderTextColor: '#eeeeee'
            }
        });

        const theme = themeManager.getTheme();

        expect(theme.dialogHeaderBackground).toBe('#123456');
        expect(theme.dialogHeaderTextColor).toBe('#eeeeee');
    });

    it('never mixes a customized panel header background with the unrelated dialog-specific default text colour', () => {
        const themeManager = new ThemeManager({
            theme: { headerBackground: '#0f3350', headerTextColor: '#ffffff' }
        });

        const theme = themeManager.getTheme();

        // The pre-fix bug: background from the panel pair, text from the
        // dialog-specific default (#333333) - unreadable dark-on-navy.
        expect(theme.dialogHeaderTextColor).not.toBe('#333333');
    });

    it('derives a readable dialogHeaderTextColor by luminance when only a header background is customized (no text colour anywhere)', () => {
        const themeManager = new ThemeManager({
            theme: { headerBackground: '#0f3350' } // dark navy, no text colour given
        });

        const theme = themeManager.getTheme();

        expect(theme.dialogHeaderBackground).toBe('#0f3350');
        expect(theme.dialogHeaderTextColor).toBe('#ffffff');
    });

    it('derives black text for a light customized header background with no text colour given', () => {
        const themeManager = new ThemeManager({
            theme: { dialogHeaderBackground: '#f4a261' } // light orange
        });

        const theme = themeManager.getTheme();

        expect(theme.dialogHeaderTextColor).toBe('#000000');
    });

    it('does not touch dialog header colours when neither header pair is customized', () => {
        const themeManager = new ThemeManager({ theme: { primaryColor: '#ff0000' } });

        const theme = themeManager.getTheme();

        expect(theme.dialogHeaderBackground).toBe('#ffffff');
        expect(theme.dialogHeaderTextColor).toBe('#333333');
    });

    it('matches the exact site scenario: light theme (navy header, white text) and dark theme (orange header, navy text)', () => {
        const lightThemeManager = new ThemeManager({
            theme: { headerBackground: '#0f3350', headerTextColor: '#ffffff' }
        });
        const light = lightThemeManager.getTheme();
        expect(light.dialogHeaderBackground).toBe('#0f3350');
        expect(light.dialogHeaderTextColor).toBe('#ffffff');

        const darkThemeManager = new ThemeManager({
            theme: { headerBackground: '#f4a261', headerTextColor: '#0f3350' }
        });
        const dark = darkThemeManager.getTheme();
        expect(dark.dialogHeaderBackground).toBe('#f4a261');
        expect(dark.dialogHeaderTextColor).toBe('#0f3350');
    });
});

describe('contrastingTextColor()', () => {
    it('picks white text for a dark background', () => {
        expect(contrastingTextColor('#0f3350')).toBe('#ffffff');
        expect(contrastingTextColor('#000000')).toBe('#ffffff');
    });

    it('picks black text for a light background', () => {
        expect(contrastingTextColor('#f4a261')).toBe('#000000');
        expect(contrastingTextColor('#ffffff')).toBe('#000000');
    });

    it('expands a 3-digit hex colour before computing luminance', () => {
        expect(contrastingTextColor('#000')).toBe('#ffffff');
        expect(contrastingTextColor('#fff')).toBe('#000000');
    });

    it('falls back to the framework default for non-hex values (gradients, rgba(), named colours)', () => {
        expect(contrastingTextColor('linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)')).toBe('#333333');
        expect(contrastingTextColor('rgba(15, 51, 80, 1)')).toBe('#333333');
        expect(contrastingTextColor('navy')).toBe('#333333');
    });
});
