const {
    packageNameFromPath,
    packageDirFromPath,
    collectPackageNames,
    collectPackageDirs,
    dedupePackages,
    npmPurl,
    componentFromPackage,
    buildSbom
} = require('../../../tools/security/lib/sbom-core.js');

describe('packageNameFromPath', () => {
    test('resolves a plain top-level package', () => {
        expect(packageNameFromPath('node_modules/xlsx/xlsx.js')).toBe('xlsx');
    });

    test('resolves a scoped package', () => {
        expect(packageNameFromPath('node_modules/@scope/pkg/dist/index.js')).toBe('@scope/pkg');
    });

    test('resolves the innermost package in nested node_modules', () => {
        expect(packageNameFromPath('node_modules/foo/node_modules/@scope/bar/index.js')).toBe('@scope/bar');
    });

    test('returns null for source files not under node_modules', () => {
        expect(packageNameFromPath('src/index.ts')).toBeNull();
    });
});

describe('packageDirFromPath', () => {
    test('keeps the full prefix up to and including the package directory', () => {
        expect(packageDirFromPath('node_modules/foo/node_modules/@scope/bar/index.js'))
            .toBe('node_modules/foo/node_modules/@scope/bar');
    });

    test('resolves a plain top-level package directory', () => {
        expect(packageDirFromPath('node_modules/xlsx/xlsx.js')).toBe('node_modules/xlsx');
    });

    test('returns null outside node_modules', () => {
        expect(packageDirFromPath('src/index.ts')).toBeNull();
    });
});

describe('collectPackageNames / collectPackageDirs', () => {
    const metafiles = [
        {
            inputs: {
                'src/index.ts': {},
                'node_modules/xlsx/xlsx.js': {},
                'node_modules/@scope/pkg/index.js': {}
            }
        },
        {
            inputs: {
                'node_modules/xlsx/xlsx.js': {},
                'node_modules/foo/node_modules/@scope/pkg/index.js': {}
            }
        }
    ];

    test('deduplicates package names across multiple metafiles', () => {
        expect(collectPackageNames(metafiles)).toEqual(['@scope/pkg', 'xlsx']);
    });

    test('keeps distinct nested directories separate even when the name repeats', () => {
        expect(collectPackageDirs(metafiles)).toEqual([
            'node_modules/@scope/pkg',
            'node_modules/foo/node_modules/@scope/pkg',
            'node_modules/xlsx'
        ]);
    });

    test('ignores metafiles with no inputs', () => {
        expect(collectPackageNames([null, {}, { inputs: {} }])).toEqual([]);
    });
});

describe('dedupePackages', () => {
    test('keeps one entry per name+version', () => {
        const result = dedupePackages([
            { name: 'xlsx', version: '0.18.5' },
            { name: 'xlsx', version: '0.18.5' },
            { name: 'xlsx', version: '0.20.3' }
        ]);
        expect(result).toHaveLength(2);
    });
});

describe('npmPurl', () => {
    test('builds an unscoped purl', () => {
        expect(npmPurl('xlsx', '0.18.5')).toBe('pkg:npm/xlsx@0.18.5');
    });

    test('builds a scoped purl', () => {
        expect(npmPurl('@scope/pkg', '1.2.3')).toBe('pkg:npm/%40scope/pkg@1.2.3');
    });
});

describe('componentFromPackage', () => {
    test('includes purl, bom-ref and license', () => {
        const component = componentFromPackage({ name: 'xlsx', version: '0.18.5', license: 'Apache-2.0' });
        expect(component.purl).toBe('pkg:npm/xlsx@0.18.5');
        expect(component['bom-ref']).toBe('pkg:npm/xlsx@0.18.5');
        expect(component.licenses).toEqual([{ license: { id: 'Apache-2.0' } }]);
    });

    test('omits licenses when unknown', () => {
        const component = componentFromPackage({ name: 'xlsx', version: '0.18.5' });
        expect(component.licenses).toBeUndefined();
    });
});

describe('buildSbom', () => {
    test('produces a CycloneDX 1.5 document with a root component and sorted components', () => {
        const sbom = buildSbom({
            rootComponent: { name: 'agentlet-core', version: '2.1.0' },
            packages: [
                { name: 'xlsx', version: '0.18.5', license: 'Apache-2.0' },
                { name: 'hotkeys-js', version: '3.13.15', license: 'MIT' }
            ],
            timestamp: '2026-01-01T00:00:00.000Z'
        });

        expect(sbom.bomFormat).toBe('CycloneDX');
        expect(sbom.specVersion).toBe('1.5');
        expect(sbom.metadata.component.name).toBe('agentlet-core');
        expect(sbom.metadata.component.purl).toBe('pkg:npm/agentlet-core@2.1.0');
        expect(sbom.components.map(c => c.name)).toEqual(['hotkeys-js', 'xlsx']);
    });
});
