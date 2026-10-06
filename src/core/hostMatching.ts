/**
 * Host-based URL pattern matching, used by `Module.checkPattern()` when a
 * module sets `matchMode: 'host'`.
 *
 * A host pattern is `[scheme://]host[:port][/path-prefix]`. It matches when
 * the parsed URL host equals the pattern host or is a subdomain of it, so
 * `example.com` matches `example.com` and `app.example.com` but neither
 * `example.com.evil.test`, `notexample.com` nor `https://evil.test/?q=example.com`.
 * Both sides go through `new URL()`, which lowercases hosts and converts
 * internationalized names to punycode, so matching is case-insensitive and
 * IDN-safe. The port is ignored unless the pattern names one.
 */
import { isDebugMode, logger } from '../utils/system/Logger.js';

interface HostPattern {
    /** Required protocol including the colon (e.g. `https:`), or `null` for any. */
    protocol: string | null;
    /** Normalized host name; empty for a scheme-only pattern such as `file://`. */
    hostname: string;
    /** Required port, or `null` to ignore the port. */
    port: string | null;
    /** Path prefix without trailing slash, or `''` for no constraint. */
    pathPrefix: string;
    /** `true` for IP literals, which never match as a parent domain. */
    isIp: boolean;
}

const DEFAULT_PORTS: Record<string, string> = {
    'http:': '80',
    'https:': '443',
    'ws:': '80',
    'wss:': '443',
    'ftp:': '21'
};

const SCHEME_PREFIX = /^([a-z][a-z0-9+.-]*):\/\//i;

/** Shapes that look like a bare host (with optional port and path): `example.com`, `localhost:3000`, `10.0.0.1`, `https://app.example.com/x`. */
const HOST_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:localhost|(?:[a-z0-9-]+\.)+[a-z0-9-]+)(?::\d+)?(?:\/.*)?$/i;

const compiledCache = new Map<string, HostPattern | null>();

function stripTrailingDot(host: string): string {
    return host.endsWith('.') ? host.slice(0, -1) : host;
}

function compileHostPattern(raw: string): HostPattern | null {
    const cached = compiledCache.get(raw);
    if (cached !== undefined) {
        return cached;
    }
    const compiled = parseHostPattern(raw);
    compiledCache.set(raw, compiled);
    return compiled;
}

function parseHostPattern(raw: string): HostPattern | null {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.includes('*')) {
        return null;
    }

    let protocol: string | null = null;
    let rest = trimmed;
    const scheme = SCHEME_PREFIX.exec(trimmed);
    if (scheme) {
        protocol = `${scheme[1].toLowerCase()}:`;
        rest = trimmed.slice(scheme[0].length);
        if (rest === '') {
            // Scheme-only pattern such as 'file://': matches by protocol alone.
            return { protocol, hostname: '', port: null, pathPrefix: '', isIp: false };
        }
    }

    if (rest.startsWith('/')) {
        return null;
    }

    const authority = rest.split(/[/?#]/)[0];
    if (!authority || authority.includes('@')) {
        return null;
    }

    let parsed: URL;
    try {
        parsed = new URL(`http://${rest}`);
    } catch {
        return null;
    }

    const hostname = stripTrailingDot(parsed.hostname);
    if (!hostname) {
        return null;
    }

    // URL drops default ports ('example.com:80' -> ''), so read the explicit port from the text.
    const portMatch = /:(\d+)$/.exec(authority);
    const port = portMatch ? String(Number(portMatch[1])) : null;

    const pathPrefix = rest.slice(authority.length).startsWith('/')
        ? parsed.pathname.replace(/\/+$/, '')
        : '';

    return {
        protocol,
        hostname,
        port,
        pathPrefix,
        isIp: /^[\d.]+$/.test(hostname) || hostname.startsWith('[')
    };
}

/**
 * Whether `url` matches the host pattern `pattern`. Returns `false` for a
 * pattern that cannot be used as a host pattern (empty, containing `*` other
 * than a lone `'*'`, or not parsable) and for a `url` that is not a valid
 * absolute URL.
 */
export function matchesHostPattern(pattern: string, url: string): boolean {
    const compiled = compileHostPattern(pattern);
    if (!compiled) {
        return false;
    }

    let target: URL;
    try {
        target = new URL(url);
    } catch {
        return false;
    }

    if (compiled.protocol && target.protocol !== compiled.protocol) {
        return false;
    }
    if (compiled.hostname === '') {
        return true;
    }

    const host = stripTrailingDot(target.hostname);
    const hostMatches = host === compiled.hostname
        || (!compiled.isIp && host.endsWith(`.${compiled.hostname}`));
    if (!hostMatches) {
        return false;
    }

    if (compiled.port !== null) {
        const effectivePort = target.port || DEFAULT_PORTS[target.protocol] || '';
        if (effectivePort !== compiled.port) {
            return false;
        }
    }

    if (compiled.pathPrefix) {
        const path = target.pathname;
        if (path !== compiled.pathPrefix && !path.startsWith(`${compiled.pathPrefix}/`)) {
            return false;
        }
    }

    return true;
}

/** `true` when a plain string pattern looks like a bare host rather than a path or free-form fragment. */
export function looksLikeHostPattern(pattern: string): boolean {
    return HOST_LIKE.test(pattern.trim());
}

/** Patterns already reported by `warnSubstringHostPattern()`, so each is reported once per page load. */
const warnedSubstringPatterns = new Set<string>();

/**
 * One-time hint for a host-looking string pattern used in the default
 * substring mode. Gated by `debugMode`: warnings written to the host page's
 * console would be new noise on every existing 2.x deployment, and the
 * behaviour is unchanged until 3.0, so the hint is shown only to developers
 * who turned on debug mode. The same guidance is in the docs and changelog.
 */
export function warnSubstringHostPattern(moduleName: string, pattern: string): void {
    if (!isDebugMode() || warnedSubstringPatterns.has(pattern) || !looksLikeHostPattern(pattern)) {
        return;
    }
    warnedSubstringPatterns.add(pattern);
    logger.warn(
        `[${moduleName}] The pattern '${pattern}' matches any URL containing that text, ` +
        `including 'https://evil.test/?q=${pattern}' and 'https://${pattern}.evil.test/'. ` +
        'Set matchMode: \'host\' on the module to match the URL host (the host or a subdomain of it). ' +
        'Host matching becomes the default in agentlet-core 3.0; use matchMode: \'substring\' to keep today\'s behaviour.'
    );
}

/** Test helper: forget which patterns were already reported. */
export function resetSubstringHostWarnings(): void {
    warnedSubstringPatterns.clear();
}
