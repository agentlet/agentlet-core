const {
    compareVersions,
    satisfiesConstraint,
    parseRange,
    satisfiesRange,
    upperBoundFromRange
} = require('../../../tools/security/lib/semver-lite.js');

describe('compareVersions', () => {
    test('compares major/minor/patch numerically, not lexically', () => {
        expect(compareVersions('0.9.0', '0.10.0')).toBeLessThan(0);
        expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
        expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    });

    test('treats a missing patch/minor as 0', () => {
        expect(compareVersions('1.2', '1.2.0')).toBe(0);
        expect(compareVersions('2', '2.0.0')).toBe(0);
    });

    test('a version with a prerelease sorts before the same version without one', () => {
        expect(compareVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0);
        expect(compareVersions('1.0.0', '1.0.0-beta')).toBeGreaterThan(0);
    });

    test('compares prerelease identifiers, numeric ones numerically', () => {
        expect(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.10')).toBeLessThan(0);
        expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0);
    });
});

describe('satisfiesConstraint', () => {
    test('supports <, <=, >, >=, =', () => {
        expect(satisfiesConstraint('0.18.5', '<', '0.19.3')).toBe(true);
        expect(satisfiesConstraint('0.20.3', '<', '0.19.3')).toBe(false);
        expect(satisfiesConstraint('0.19.3', '<=', '0.19.3')).toBe(true);
        expect(satisfiesConstraint('0.19.4', '>', '0.19.3')).toBe(true);
        expect(satisfiesConstraint('0.19.3', '>=', '0.19.3')).toBe(true);
        expect(satisfiesConstraint('0.19.3', '=', '0.19.3')).toBe(true);
    });
});

describe('parseRange', () => {
    test('parses a single constraint', () => {
        expect(parseRange('< 0.19.3')).toEqual([{ operator: '<', version: '0.19.3' }]);
    });

    test('parses compound comma-separated constraints', () => {
        expect(parseRange('>= 1.0.0, < 2.0.0')).toEqual([
            { operator: '>=', version: '1.0.0' },
            { operator: '<', version: '2.0.0' }
        ]);
    });

    test('returns an empty array for unparseable text', () => {
        expect(parseRange('unknown')).toEqual([]);
    });
});

describe('satisfiesRange', () => {
    test('the real xlsx GHSA-4r6h-8v6p-xvw6 range excludes the patched version', () => {
        expect(satisfiesRange('0.18.5', '< 0.19.3')).toBe(true);
        expect(satisfiesRange('0.20.3', '< 0.19.3')).toBe(false);
    });

    test('the real xlsx GHSA-5pgg-2g8v-p4x9 range excludes the patched version', () => {
        expect(satisfiesRange('0.18.5', '< 0.20.2')).toBe(true);
        expect(satisfiesRange('0.20.3', '< 0.20.2')).toBe(false);
    });

    test('ANDs compound constraints', () => {
        expect(satisfiesRange('1.5.0', '>= 1.0.0, < 2.0.0')).toBe(true);
        expect(satisfiesRange('2.0.0', '>= 1.0.0, < 2.0.0')).toBe(false);
        expect(satisfiesRange('0.9.0', '>= 1.0.0, < 2.0.0')).toBe(false);
    });

    test('returns null when the range text has no recognisable constraint', () => {
        expect(satisfiesRange('1.0.0', 'not a range')).toBeNull();
    });
});

describe('upperBoundFromRange', () => {
    test('extracts the version from a "<" range', () => {
        expect(upperBoundFromRange('< 0.19.3')).toBe('0.19.3');
    });

    test('extracts the tightest of several "<"/"<=" bounds', () => {
        expect(upperBoundFromRange('< 2.0.0, <= 1.5.0')).toBe('1.5.0');
    });

    test('returns null when there is no upper bound', () => {
        expect(upperBoundFromRange('>= 1.0.0')).toBeNull();
        expect(upperBoundFromRange('not a range')).toBeNull();
    });
});
