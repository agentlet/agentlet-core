'use strict';

/**
 * Pure helpers for turning esbuild metafiles into a CycloneDX SBOM that
 * describes what agentlet-core actually SHIPS in its bundles, as opposed to
 * everything listed in package-lock.json.
 *
 * esbuild inlines every bundled dependency into a single file, so a
 * container/filesystem scanner (syft et al.) finds zero components in
 * dist/ or in the npm pack tarball. The metafile esbuild can emit
 * (`metafile: true`, see tools/build.js) lists every source file it read
 * to produce the bundle, including everything under node_modules/, which
 * is the only reliable way to know what a given bundle actually contains.
 *
 * No network access, no filesystem access beyond what callers pass in -
 * kept pure and synchronous so it is easy to unit test (see
 * tests/tools/security/sbom-core.test.js).
 */

/**
 * Given an esbuild metafile input path such as:
 *   node_modules/xlsx/xlsx.js
 *   node_modules/@scope/pkg/dist/index.js
 *   node_modules/foo/node_modules/@scope/bar/index.js
 * return the name of the nearest npm package that owns it, or null if the
 * path is not under any node_modules directory.
 */
function packageNameFromPath(inputPath) {
    const marker = 'node_modules/';
    const lastIndex = inputPath.lastIndexOf(marker);
    if (lastIndex === -1) {
        return null;
    }

    const rest = inputPath.slice(lastIndex + marker.length);
    const parts = rest.split('/').filter(Boolean);
    if (parts.length === 0) {
        return null;
    }

    if (parts[0].startsWith('@')) {
        if (parts.length < 2) {
            return null;
        }
        return `${parts[0]}/${parts[1]}`;
    }

    return parts[0];
}

/**
 * Given an esbuild metafile input path, return the relative directory of
 * the nearest owning npm package (e.g. "node_modules/xlsx" or
 * "node_modules/foo/node_modules/@scope/bar"), so callers can read that
 * exact package's package.json - not just any installed copy of the name,
 * which matters when nested node_modules pin different versions of the
 * same package. Returns null if the path is not under node_modules.
 */
function packageDirFromPath(inputPath) {
    const marker = 'node_modules/';
    const lastIndex = inputPath.lastIndexOf(marker);
    if (lastIndex === -1) {
        return null;
    }

    const prefix = inputPath.slice(0, lastIndex + marker.length);
    const rest = inputPath.slice(lastIndex + marker.length);
    const parts = rest.split('/').filter(Boolean);
    if (parts.length === 0) {
        return null;
    }

    if (parts[0].startsWith('@')) {
        if (parts.length < 2) {
            return null;
        }
        return `${prefix}${parts[0]}/${parts[1]}`;
    }

    return `${prefix}${parts[0]}`;
}

/**
 * Collect the set of distinct package directories (see packageDirFromPath)
 * referenced by one or more esbuild metafiles.
 */
function collectPackageDirs(metafiles) {
    const dirs = new Set();
    for (const metafile of metafiles) {
        if (!metafile || !metafile.inputs) {
            continue;
        }
        for (const inputPath of Object.keys(metafile.inputs)) {
            const dir = packageDirFromPath(inputPath);
            if (dir) {
                dirs.add(dir);
            }
        }
    }
    return [...dirs].sort();
}

/**
 * Deduplicate resolved package descriptors by name+version (the same
 * package/version can be reached through multiple bundles or multiple
 * node_modules locations).
 */
function dedupePackages(packages) {
    const byKey = new Map();
    for (const pkg of packages) {
        byKey.set(`${pkg.name}@${pkg.version}`, pkg);
    }
    return [...byKey.values()];
}

/**
 * Collect the set of npm package names referenced by one or more esbuild
 * metafiles (as parsed JSON objects, each with an `inputs` map).
 */
function collectPackageNames(metafiles) {
    const names = new Set();
    for (const metafile of metafiles) {
        if (!metafile || !metafile.inputs) {
            continue;
        }
        for (const inputPath of Object.keys(metafile.inputs)) {
            const name = packageNameFromPath(inputPath);
            if (name) {
                names.add(name);
            }
        }
    }
    return [...names].sort();
}

/**
 * purl for an npm package, handling the scoped-package escaping rule from
 * the purl spec (https://github.com/package-url/purl-spec): the `@` and
 * `/` in the namespace are kept literal, but the whole name is otherwise
 * left as-is for npm (npm names are already URL-safe once split this way).
 */
function npmPurl(name, version) {
    if (name.startsWith('@')) {
        const [scope, pkg] = name.split('/');
        return `pkg:npm/${encodeURIComponent(scope)}/${pkg}@${version}`;
    }
    return `pkg:npm/${name}@${version}`;
}

/**
 * Build one CycloneDX component from a resolved package descriptor.
 * `pkg` is { name, version, license, description? }.
 */
function componentFromPackage(pkg) {
    const purl = npmPurl(pkg.name, pkg.version);
    const component = {
        type: 'library',
        'bom-ref': purl,
        name: pkg.name,
        version: pkg.version,
        purl
    };
    if (pkg.description) {
        component.description = pkg.description;
    }
    if (pkg.license) {
        component.licenses = [{ license: { id: pkg.license } }];
    }
    return component;
}

/**
 * Build a full CycloneDX 1.5 SBOM document.
 *
 * @param {object} options
 * @param {{name: string, version: string, description?: string}} options.rootComponent
 *   The agentlet-core package itself (metadata.component).
 * @param {Array<{name: string, version: string, license?: string}>} options.packages
 *   Resolved package descriptors for every bundled dependency (already
 *   deduplicated by name+version).
 * @param {string} [options.timestamp] ISO timestamp, defaults to now.
 * @param {string} [options.serialNumber] urn:uuid:... serial, omitted if not given.
 */
function buildSbom({ rootComponent, packages, timestamp, serialNumber }) {
    const components = packages
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))
        .map(componentFromPackage);

    const rootPurl = npmPurl(rootComponent.name, rootComponent.version);

    const sbom = {
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        version: 1,
        metadata: {
            timestamp: timestamp || new Date().toISOString(),
            component: {
                type: 'library',
                'bom-ref': rootPurl,
                name: rootComponent.name,
                version: rootComponent.version,
                purl: rootPurl,
                ...(rootComponent.description ? { description: rootComponent.description } : {})
            }
        },
        components
    };

    if (serialNumber) {
        sbom.serialNumber = serialNumber;
    }

    return sbom;
}

module.exports = {
    packageNameFromPath,
    packageDirFromPath,
    collectPackageNames,
    collectPackageDirs,
    dedupePackages,
    npmPurl,
    componentFromPackage,
    buildSbom
};
