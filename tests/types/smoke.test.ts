import { isAgentletVersion, normalizeAgentletVersion } from '../../src/types/smoke';

describe('TypeScript tooling smoke test', () => {
    it('accepts valid semver strings', () => {
        expect(isAgentletVersion('2.0.0')).toBe(true);
        expect(isAgentletVersion('2.0.0-beta.1')).toBe(true);
    });

    it('rejects non-semver values', () => {
        expect(isAgentletVersion('not-a-version')).toBe(false);
        expect(isAgentletVersion(2)).toBe(false);
        expect(isAgentletVersion(undefined)).toBe(false);
    });

    it('normalizes invalid versions to the fallback', () => {
        expect(normalizeAgentletVersion('1.2.3')).toBe('1.2.3');
        expect(normalizeAgentletVersion('bogus')).toBe('0.0.0');
        expect(normalizeAgentletVersion('bogus', '9.9.9')).toBe('9.9.9');
    });
});
