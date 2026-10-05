/**
 * Tests for opt-in host matching (`matchMode: 'host'`) in Module.checkPattern()
 * and for the one-time substring-mode hint.
 */

import Module from '../../src/core/Module.js';
import {
    looksLikeHostPattern,
    matchesHostPattern,
    resetSubstringHostWarnings
} from '../../src/core/hostMatching.js';
import type { ModulePatternMatcher } from '../../src/types/public-api';
import { setDebugMode } from '../../src/utils/system/Logger.js';

function hostModule(patterns: ModulePatternMatcher | ModulePatternMatcher[]): Module {
    return new Module({ name: 'host-module', patterns, matchMode: 'host' });
}

describe('matchMode: host', () => {
    describe('exact host and subdomains', () => {
        const mod = hostModule('example.com');

        test.each([
            'https://example.com',
            'https://example.com/',
            'https://example.com/some/path?q=1#frag',
            'http://example.com',
            'https://app.example.com/',
            'https://a.b.example.com/path',
            'https://user:pass@example.com/'
        ])('matches %s', url => {
            expect(mod.checkPattern(url)).toBe(true);
        });

        test.each([
            'https://example.com.evil.test/',
            'https://notexample.com/',
            'https://evil.test/?q=example.com',
            'https://evil.test/example.com',
            'https://evil.test/#example.com',
            'https://evil.test/',
            'https://example.org/',
            'https://evil.test@example.com.evil.test/',
            'https://example.com@evil.test/',
            'not a url',
            ''
        ])('does not match %s', url => {
            expect(mod.checkPattern(url)).toBe(false);
        });

        test('treats the fully qualified form with a trailing dot as the same host', () => {
            expect(mod.checkPattern('https://example.com./')).toBe(true);
            expect(hostModule('example.com.').checkPattern('https://example.com/')).toBe(true);
        });

        test('does not match a host that only ends with the pattern text', () => {
            expect(mod.checkPattern('https://badexample.com/')).toBe(false);
            expect(mod.checkPattern('https://my-example.com/')).toBe(false);
        });
    });

    describe('case', () => {
        test('is insensitive on both the pattern and the URL', () => {
            expect(hostModule('Example.COM').checkPattern('https://APP.example.com/')).toBe(true);
            expect(hostModule('example.com').checkPattern('HTTPS://EXAMPLE.COM/Path')).toBe(true);
        });
    });

    describe('ports', () => {
        test('are ignored unless the pattern names one', () => {
            const mod = hostModule('localhost');
            expect(mod.checkPattern('http://localhost/')).toBe(true);
            expect(mod.checkPattern('http://localhost:3000/')).toBe(true);
            expect(mod.checkPattern('https://localhost:8443/x')).toBe(true);
        });

        test('must match when the pattern names one', () => {
            const mod = hostModule('localhost:3000');
            expect(mod.checkPattern('http://localhost:3000/')).toBe(true);
            expect(mod.checkPattern('http://localhost:3001/')).toBe(false);
            expect(mod.checkPattern('http://localhost/')).toBe(false);
        });

        test('compare against the default port of the scheme', () => {
            expect(hostModule('example.com:443').checkPattern('https://example.com/')).toBe(true);
            expect(hostModule('example.com:443').checkPattern('http://example.com/')).toBe(false);
            expect(hostModule('example.com:80').checkPattern('http://example.com/')).toBe(true);
            expect(hostModule('example.com:80').checkPattern('https://example.com:80/')).toBe(true);
        });

        test('apply to subdomains too', () => {
            expect(hostModule('example.com:8080').checkPattern('http://app.example.com:8080/')).toBe(true);
            expect(hostModule('example.com:8080').checkPattern('http://app.example.com:9090/')).toBe(false);
        });

        test('an out of range port in the pattern never matches', () => {
            expect(hostModule('example.com:99999').checkPattern('https://example.com/')).toBe(false);
        });
    });

    describe('internationalized domain names', () => {
        test('Unicode pattern matches the punycode URL and the reverse', () => {
            const unicode = hostModule('bücher.example');
            expect(unicode.checkPattern('https://xn--bcher-kva.example/')).toBe(true);
            expect(unicode.checkPattern('https://BÜCHER.example/')).toBe(true);
            expect(unicode.checkPattern('https://shop.bücher.example/')).toBe(true);

            const punycode = hostModule('xn--bcher-kva.example');
            expect(punycode.checkPattern('https://bücher.example/')).toBe(true);
        });

        test('a lookalike host does not match', () => {
            expect(hostModule('apple.com').checkPattern('https://xn--pple-43d.com/')).toBe(false);
        });
    });

    describe('IP addresses and IPv6', () => {
        test('IPv4 matches exactly', () => {
            const mod = hostModule('127.0.0.1');
            expect(mod.checkPattern('http://127.0.0.1:5000/')).toBe(true);
            expect(mod.checkPattern('http://127.0.0.10/')).toBe(false);
            expect(mod.checkPattern('http://1127.0.0.1/')).toBe(false);
        });

        test('IPv6 matches exactly', () => {
            const mod = hostModule('[::1]');
            expect(mod.checkPattern('http://[::1]:3000/')).toBe(true);
            expect(mod.checkPattern('http://[::2]/')).toBe(false);
        });
    });

    describe('scheme in the pattern', () => {
        test('is required to match when given', () => {
            const mod = hostModule('https://example.com');
            expect(mod.checkPattern('https://example.com/')).toBe(true);
            expect(mod.checkPattern('https://app.example.com/')).toBe(true);
            expect(mod.checkPattern('http://example.com/')).toBe(false);
        });

        test("'file://' matches any file URL and nothing else", () => {
            const mod = hostModule('file://');
            expect(mod.checkPattern('file:///Users/me/page.html')).toBe(true);
            expect(mod.checkPattern('https://example.com/file://')).toBe(false);
        });
    });

    describe('path prefix', () => {
        const mod = hostModule('example.com/app');

        test('matches whole path segments', () => {
            expect(mod.checkPattern('https://example.com/app')).toBe(true);
            expect(mod.checkPattern('https://example.com/app/')).toBe(true);
            expect(mod.checkPattern('https://example.com/app/users/1?x=1')).toBe(true);
            expect(mod.checkPattern('https://shop.example.com/app/x')).toBe(true);
        });

        test('does not match a longer segment, other paths or the query string', () => {
            expect(mod.checkPattern('https://example.com/apple')).toBe(false);
            expect(mod.checkPattern('https://example.com/')).toBe(false);
            expect(mod.checkPattern('https://example.com/other/app')).toBe(false);
            expect(mod.checkPattern('https://example.com/?next=/app')).toBe(false);
        });

        test('a trailing slash or a lone slash in the pattern is normalized', () => {
            expect(hostModule('example.com/app/').checkPattern('https://example.com/app')).toBe(true);
            expect(hostModule('example.com/').checkPattern('https://example.com/anything')).toBe(true);
        });

        test('combines with a port', () => {
            const withPort = hostModule('localhost:3000/admin');
            expect(withPort.checkPattern('http://localhost:3000/admin/users')).toBe(true);
            expect(withPort.checkPattern('http://localhost:3001/admin')).toBe(false);
            expect(withPort.checkPattern('http://localhost:3000/user')).toBe(false);
        });
    });

    describe('wildcard and unsupported patterns', () => {
        test("'*' alone still matches any non-empty URL", () => {
            const mod = hostModule('*');
            expect(mod.checkPattern('https://anything.example/')).toBe(true);
            expect(mod.checkPattern('')).toBe(false);
        });

        test.each(['*.example.com', 'localhost:*', 'example.*', '', '/just/a/path', 'user@example.com'])(
            'pattern %j never matches in host mode',
            pattern => {
                // An empty string pattern is dropped by the constructor filter only for a lone value, so wrap it.
                const mod = new Module({ name: 'm', patterns: ['https://never.test', pattern], matchMode: 'host' });
                expect(mod.checkPattern('https://app.example.com/')).toBe(false);
                expect(mod.checkPattern('http://localhost:3000/')).toBe(false);
            }
        );
    });

    describe('arrays and object patterns', () => {
        test('any pattern in the array may match', () => {
            const mod = hostModule(['example.com', 'localhost:3000', 'file://']);
            expect(mod.checkPattern('https://app.example.com/')).toBe(true);
            expect(mod.checkPattern('http://localhost:3000/')).toBe(true);
            expect(mod.checkPattern('file:///tmp/x.html')).toBe(true);
            expect(mod.checkPattern('https://evil.test/?q=example.com')).toBe(false);
        });

        test('regex, exact and includes objects are unaffected by matchMode', () => {
            const mod = hostModule([
                { type: 'regex', value: 'evil\\.test' },
                { type: 'exact', value: 'https://exact.test/page' },
                { type: 'includes', value: 'needle' }
            ]);
            expect(mod.checkPattern('https://evil.test/')).toBe(true);
            expect(mod.checkPattern('https://exact.test/page')).toBe(true);
            expect(mod.checkPattern('https://exact.test/page?x=1')).toBe(false);
            expect(mod.checkPattern('https://other.test/a?needle=1')).toBe(true);
            expect(mod.checkPattern('https://other.test/')).toBe(false);
        });

        test('a host string and an includes object can be mixed as the substring escape hatch', () => {
            const mod = hostModule(['example.com', { type: 'includes', value: '/internal/' }]);
            expect(mod.checkPattern('https://app.example.com/')).toBe(true);
            expect(mod.checkPattern('https://other.test/internal/tool')).toBe(true);
            expect(mod.checkPattern('https://other.test/?q=example.com')).toBe(false);
        });
    });
});

describe('matchMode: default and validation', () => {
    test("defaults to 'substring' and keeps the existing behaviour", () => {
        const mod = new Module({ name: 'legacy', patterns: 'example.com' });
        expect(mod.matchMode).toBe('substring');
        expect(mod.checkPattern('https://example.com.evil.test/')).toBe(true);
        expect(mod.checkPattern('https://evil.test/?q=example.com')).toBe(true);
    });

    test("an explicit 'substring' behaves like the default, globs included", () => {
        const mod = new Module({ name: 'legacy', patterns: ['localhost:*/admin'], matchMode: 'substring' });
        expect(mod.checkPattern('http://localhost:3000/admin')).toBe(true);
    });

    describe('unknown values', () => {
        let warnSpy: jest.SpyInstance;

        beforeEach(() => {
            warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
        });

        afterEach(() => {
            warnSpy.mockRestore();
        });

        test.each(['includes', 'exact', 'regex'])(
            "the legacy scaffold value %s is accepted silently and means substring",
            legacy => {
                // @ts-expect-error not part of the public type; older scaffolded projects pass it
                const mod = new Module({ name: 'scaffolded', patterns: 'example.com', matchMode: legacy });
                expect(mod.matchMode).toBe('substring');
                expect(mod.checkPattern('https://example.com.evil.test/')).toBe(true);
                expect(warnSpy).not.toHaveBeenCalled();
            }
        );

        test('a likely typo falls back to substring and warns, without throwing', () => {
            // @ts-expect-error deliberately invalid value, as a JavaScript caller could pass
            const mod = new Module({ name: 'typo', patterns: 'example.com', matchMode: 'hots' });
            expect(mod.matchMode).toBe('substring');
            expect(warnSpy).toHaveBeenCalledTimes(1);
            expect(String(warnSpy.mock.calls[0][0])).toContain("Unknown matchMode \"hots\"");
        });
    });
});

describe('matchesHostPattern()', () => {
    test('is usable directly', () => {
        expect(matchesHostPattern('example.com', 'https://app.example.com/')).toBe(true);
        expect(matchesHostPattern('example.com', 'https://example.com.evil.test/')).toBe(false);
    });
});

describe('looksLikeHostPattern()', () => {
    test.each(['example.com', 'app.example.co.uk', 'localhost', 'localhost:3000', '127.0.0.1', 'example.com/app', 'https://example.com'])(
        'treats %s as a host',
        pattern => {
            expect(looksLikeHostPattern(pattern)).toBe(true);
        }
    );

    test.each(['*', '/admin', 'checkout', 'localhost:*', '?q=1', 'a b.com', 'file://'])(
        'does not treat %s as a host',
        pattern => {
            expect(looksLikeHostPattern(pattern)).toBe(false);
        }
    );
});

describe('substring mode hint', () => {
    let warnSpy: jest.SpyInstance;

    beforeEach(() => {
        resetSubstringHostWarnings();
        warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        setDebugMode(false);
        warnSpy.mockRestore();
    });

    test('warns once per pattern in debug mode and points to matchMode', () => {
        setDebugMode(true);
        const first = new Module({ name: 'first', patterns: 'example.com' });
        const second = new Module({ name: 'second', patterns: ['example.com', 'other.test'] });

        first.checkPattern('https://example.com/');
        first.checkPattern('https://example.com/again');
        second.checkPattern('https://nomatch.test/');

        const messages = warnSpy.mock.calls.map(call => String(call[0]));
        expect(messages).toHaveLength(2);
        expect(messages[0]).toContain("'example.com'");
        expect(messages[0]).toContain("matchMode: 'host'");
        expect(messages[0]).toContain('3.0');
        expect(messages[1]).toContain("'other.test'");
    });

    test('is silent when debug mode is off', () => {
        setDebugMode(false);
        new Module({ name: 'quiet', patterns: 'example.com' }).checkPattern('https://example.com/');
        expect(warnSpy).not.toHaveBeenCalled();
    });

    test('is silent in host mode, for non-host patterns and for object patterns', () => {
        setDebugMode(true);
        hostModule('example.com').checkPattern('https://example.com/');
        new Module({ name: 'a', patterns: ['*', '/admin', 'checkout', { type: 'includes', value: 'example.com' }] })
            .checkPattern('https://example.com/admin');
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
