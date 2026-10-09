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
import { ThemeManager, contrastingTextColor, readableToggleTextColor } from '../../src/core/ThemeManager';

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

    it('falls back to the framework default for values it does not parse (gradients, CSS variables, hsl(), named colours)', () => {
        expect(contrastingTextColor('linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)')).toBe('#333333');
        expect(contrastingTextColor('var(--brand-header-background)')).toBe('#333333');
        expect(contrastingTextColor('hsl(210, 76%, 19%)')).toBe('#333333');
        expect(contrastingTextColor('navy')).toBe('#333333');
    });

    it('parses #rgba and #rrggbbaa hex, ignoring the alpha channel', () => {
        expect(contrastingTextColor('#000f')).toBe('#ffffff'); // black, full alpha
        expect(contrastingTextColor('#0003')).toBe('#ffffff'); // black, low alpha - still read as opaque black
        expect(contrastingTextColor('#0f3350ff')).toBe('#ffffff'); // navy, full alpha
        expect(contrastingTextColor('#f4a26180')).toBe('#000000'); // orange, half alpha
    });

    it('parses rgb()/rgba() functional notation, comma- or space-separated, ignoring alpha', () => {
        expect(contrastingTextColor('rgb(15, 51, 80)')).toBe('#ffffff'); // navy
        expect(contrastingTextColor('rgba(15, 51, 80, 1)')).toBe('#ffffff'); // navy, explicit alpha
        expect(contrastingTextColor('rgb(15 51 80)')).toBe('#ffffff'); // CSS Color 4 space syntax
        expect(contrastingTextColor('rgb(15 51 80 / 50%)')).toBe('#ffffff'); // space syntax with alpha
        expect(contrastingTextColor('rgba(244, 162, 97, 0.8)')).toBe('#000000'); // orange
        expect(contrastingTextColor('rgb(0%, 0%, 0%)')).toBe('#ffffff'); // percentage channels
    });
});

describe('readableToggleTextColor()', () => {
    it('picks white for a dark background', () => {
        expect(readableToggleTextColor('#0f3350')).toBe('#ffffff');
        expect(readableToggleTextColor('#000000')).toBe('#ffffff');
        expect(readableToggleTextColor('#1E3A8A')).toBe('#ffffff');
    });

    it('picks near-black for a light background', () => {
        expect(readableToggleTextColor('#ffffff')).toBe('#111111');
        expect(readableToggleTextColor('#f8f9fa')).toBe('#111111');
        expect(readableToggleTextColor('#fde68a')).toBe('#111111');
    });

    it('chooses by WCAG contrast ratio, not by a fixed brightness cut-off', () => {
        // The default orange has a WCAG contrast of about 2.8 with white and about 7 with near-black
        expect(readableToggleTextColor('#F97316')).toBe('#111111');
        // A saturated mid blue has a higher contrast with white
        expect(readableToggleTextColor('#2563eb')).toBe('#ffffff');
        // Pure red: 4.0 with white, 5.2 with near-black
        expect(readableToggleTextColor('#ff0000')).toBe('#111111');
    });

    it('expands short hex and ignores the alpha digits', () => {
        expect(readableToggleTextColor('#fff')).toBe('#111111');
        expect(readableToggleTextColor('#000')).toBe('#ffffff');
        expect(readableToggleTextColor('#fffa')).toBe('#111111');
        expect(readableToggleTextColor('#0f335080')).toBe('#ffffff');
    });

    it('reads rgb() and rgba() notation', () => {
        expect(readableToggleTextColor('rgb(255, 255, 255)')).toBe('#111111');
        expect(readableToggleTextColor('rgba(15, 51, 80, 0.5)')).toBe('#ffffff');
        expect(readableToggleTextColor('rgb(250 250 250 / 40%)')).toBe('#111111');
        expect(readableToggleTextColor('  RGB(0, 0, 0)  ')).toBe('#ffffff');
    });

    it('falls back to white for values it cannot parse', () => {
        expect(readableToggleTextColor('var(--brand-secondary)')).toBe('#ffffff');
        expect(readableToggleTextColor('white')).toBe('#ffffff');
        expect(readableToggleTextColor('hsl(0, 0%, 100%)')).toBe('#ffffff');
        expect(readableToggleTextColor('linear-gradient(#fff, #eee)')).toBe('#ffffff');
        expect(readableToggleTextColor('#12')).toBe('#ffffff');
        expect(readableToggleTextColor('')).toBe('#ffffff');
    });
});

describe('ThemeManager.processThemeConfig() - toggleTextColor', () => {
    it('derives a dark arrow for the default orange secondaryColor', () => {
        expect(new ThemeManager({}).getTheme().toggleTextColor).toBe('#111111');
        expect(new ThemeManager({}).processThemeConfig('legacy-name').toggleTextColor).toBe('#111111');
    });

    it('derives a dark arrow when secondaryColor is light', () => {
        const theme = new ThemeManager({ theme: { secondaryColor: '#f8f9fa' } }).getTheme();
        expect(theme.toggleTextColor).toBe('#111111');
    });

    it('derives a white arrow when secondaryColor is dark', () => {
        const theme = new ThemeManager({ theme: { secondaryColor: '#0f3350' } }).getTheme();
        expect(theme.toggleTextColor).toBe('#ffffff');
    });

    it('falls back to white when secondaryColor cannot be parsed', () => {
        const theme = new ThemeManager({ theme: { secondaryColor: 'var(--brand-secondary)' } }).getTheme();
        expect(theme.toggleTextColor).toBe('#ffffff');
    });

    it('keeps an explicit toggleTextColor even if it would be unreadable', () => {
        const theme = new ThemeManager({ theme: { secondaryColor: '#ffffff', toggleTextColor: '#ff00ff' } }).getTheme();
        expect(theme.toggleTextColor).toBe('#ff00ff');
    });

    it('re-derives the colour when the theme is updated', () => {
        const manager = new ThemeManager({ theme: { secondaryColor: '#000000' } });
        expect(manager.getTheme().toggleTextColor).toBe('#ffffff');
        expect(manager.updateTheme({ secondaryColor: '#ffffff' }).toggleTextColor).toBe('#111111');
    });
});
