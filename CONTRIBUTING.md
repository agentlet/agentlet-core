# Contributing to Agentlet Core

Thank you for your interest in contributing to agentlet-core. Everyone taking part is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).

This project is developed with heavy use of Claude Code. [CLAUDE.md](CLAUDE.md) holds the conventions it follows (commit format, TypeScript rules, documentation style), and they apply to human contributors too.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue on GitHub with the following information:

- **Description**: A clear and concise description of the bug
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Expected Behavior**: What you expected to happen
- **Actual Behavior**: What actually happened
- **Environment**: Browser version, OS, and any relevant details
- **Screenshots**: If applicable, add screenshots to help explain the problem

### Suggesting Features

We welcome feature requests! Please create an issue with:

- **Feature Description**: A clear description of the feature you'd like to see
- **Use Case**: Why this feature would be useful
- **Proposed Implementation**: If you have ideas on how it could be implemented

### Contributing Code

1. **Fork the Repository**
   ```bash
   git clone https://github.com/agentlet/agentlet-core.git
   cd agentlet-core
   ```

2. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Make Your Changes**
   - Follow the existing code style and conventions
   - Add tests for new functionality when applicable
   - Update documentation if necessary

5. **Test Your Changes**
   ```bash
   npm run typecheck
   npm run lint
   npm test
   npm run build
   ```

6. **Commit Your Changes**
   
   This repository enforces [Conventional Commits](https://www.conventionalcommits.org/) specification.
   
   **Format:**
   ```
   <type>(<scope>): <description>
   
   [optional body]
   
   [optional footer(s)]
   ```
   
   **Types:**
   - `feat`: New feature
   - `fix`: Bug fix
   - `docs`: Documentation changes
   - `style`: Code style changes
   - `refactor`: Code refactoring
   - `perf`: Performance improvements
   - `test`: Adding/updating tests
   - `build`: Build system changes
   - `ci`: CI/CD changes
   - `chore`: Maintenance tasks
   - `disable`: Disabling features
   - `simplify`: Code simplification
   
   **Examples:**
   ```bash
   git commit -m "feat: add table extraction API"
   git commit -m "fix: resolve DOM manipulation issue"
   git commit -m "docs: update API documentation"
   ```

7. **Push to Your Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

8. **Create a Pull Request**
   - Go to the GitHub repository and create a pull request
   - Provide a clear description of your changes
   - Reference any related issues

## Development Guidelines

### Code Style

- Indent with 4 spaces
- Write modern ES modules and TypeScript
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

### TypeScript

All of `src/` is TypeScript (`.ts`). The following rules apply to any PR that touches `src/`:

- Write every new file under `src/` in TypeScript.
- Avoid `any`. `typescript-eslint` rejects explicit `any` in `.ts` files as an error. When a value is genuinely dynamic, use `unknown` (or a precise union) and add a one-line comment explaining why. If `any` is truly unavoidable, suppress it locally with `eslint-disable-next-line` and a reason on the same line, rather than disabling the rule broadly.
- You never have to write TypeScript to build an agentlet on top of this library: agentlets consume the published declarations (see [TypeScript support](https://agentlet.io/docs/guides/typescript/)) and can stay plain JavaScript.
- Keep the `.js` extension in relative imports even though the target file is `.ts` (e.g. `import { EventBus } from './EventBus.js'`). esbuild, `tsc` (`moduleResolution: bundler`), and Jest's `moduleNameMapper` all resolve it.
- Share option and shape types with the public API instead of redefining them: import them from `src/types/public-api.d.ts` with `import type`, and update the conformance checks in `tests/types/public-api.test-d.ts` whenever a public class's shape changes.
- Declare optional or duck-typed members (hooks the core detects with `typeof x === 'function'`) through a declaration merge, for example `interface Module { getPanelTitle?(): string }`, not as an uninitialized class field. An uninitialized field can become an own property set to `undefined` depending on the transpiler, which would shadow a subclass's implementation.
- Run `npm run typecheck` to type-check the project with `tsc`; it must pass, together with `npm test`, `npm run build`, and `npm run lint`, before you commit.
- esbuild compiles `.ts` sources natively, so no extra build step is needed.
- Tests may be written in `.ts` or `.js`; Jest transforms both with babel-jest.

### Public API declarations (dist/agentlet-core.d.ts)

`src/types/public-api.d.ts` is hand-written and copied as-is to `dist/agentlet-core.d.ts` by `tools/build.js` (`copyTypeDeclarations()`). This is deliberate, not a gap to fill in with `tsc --emitDeclarationOnly`:

- The published surface (`AgentletAPI`, driving the `window.agentlet` global augmentation) does not correspond to any single class in `src/`. It is a curated view assembled from many internal managers, several of which are typed narrower on purpose (for example `ShortcutManagerAPI`/`LibrarySetupAPI` intentionally omit the framework-internal `init()`/wiring methods that the concrete `ShortcutManager`/`LibrarySetup` classes still need). A compiler-generated declaration reflects the concrete classes verbatim, internal members included, and has no way to know which members are author-facing.
- We tried it: running `tsc --declaration --emitDeclarationOnly` over `src/` does compile cleanly, but it emits one `.d.ts` per source file (46 files for the current tree, no single `AgentletAPI`/`window.agentlet` shape) and declares `AgentletCore` as a constructible class rather than the singleton instance surface agentlet authors actually use. Turning that output into something equivalent to today's `public-api.d.ts` would need both a bundler (`dts-bundle-generator`, `rollup-plugin-dts`, or API Extractor) and hand-curation on top of it, at which point the manual file is simpler to maintain and review than the generation pipeline.
- `tests/types/public-api.test-d.ts` (checked by `npm run typecheck`) is the conformance contract: it imports both `public-api.d.ts` and the real implementation classes and asserts they stay compatible in both directions. Keep it up to date whenever a public class's shape changes; that is what protects the hand-written declarations from drifting out of sync with the code, not code generation.
- As a cheap guard rail, `npm run build` compiles a small standalone consumer file against the built `dist/agentlet-core.d.ts` (see `tools/verify-dist-types.mjs`) to catch a declarations file that fails to parse or load, without requiring a full generation pipeline.

### Dependency maintenance

- Almost every dependency is a normal npm registry package and gets its usual update tooling.
- `xlsx` (SheetJS) is the one exception: SheetJS stopped publishing to the npm registry after 0.18.5, so `package.json` points `xlsx` at a tarball URL on the project's own CDN (`https://cdn.sheetjs.com/xlsx-<version>/xlsx-<version>.tgz`) instead of a registry version range. Automated dependency update tooling (Dependabot, Renovate, `npm outdated`, etc.) does not see new SheetJS releases through this pin, so upgrades have to be done by hand:
  - Check the latest version at [sheetjs.com](https://sheetjs.com/) (or the CDN listing at `cdn.sheetjs.com`).
  - Run `npm install --save https://cdn.sheetjs.com/xlsx-<version>/xlsx-<version>.tgz`, replacing `<version>` with the version you want.
  - Review the SheetJS changelog for breaking changes, then run the full verification suite (`npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run verify:dist-types`, `npm run verify:node-import`, `npm run verify:tarball-import`) before committing.

### Dependency vulnerability scanning

The `security.yml` workflow checks what agentlet-core's published bundles
actually ship against known vulnerabilities and blocks on high/critical
findings with a fix or KEV listing. It uses the shared
[dependency-scan](https://github.com/agentlet/.github/tree/main/actions/dependency-scan)
and `sbom-from-esbuild` actions, so there is no scanner code in this
repository. See `.github/WORKFLOWS.md`'s "Dependency vulnerability
scanning" section for the design and the commands to run the scan locally
(`brew install osv-scanner`, then `npm run build` and the CLIs from a clone
of `agentlet/.github`). Do not add a bundled runtime dependency
without checking this passes, and never widen
`security/vulnerability-exceptions.json` without a real owner and a
realistic expiry date.

### Module Development

When creating new modules:

- Extend the `Module` class (`window.agentlet.Module`, also exported as `Module` from the package)
- Follow the existing module patterns and conventions
- Include proper error handling
- Add appropriate lifecycle hooks
- Test your module thoroughly
- Remember that modules are not sandboxed: they run with the host page's privileges. See [SECURITY.md](SECURITY.md)

### Testing

- Write tests for new functionality
- Ensure all existing tests continue to pass
- Test in multiple browsers when possible
- For UI changes, try the built bundle as a bookmarklet on a real page (see the Quick start in the README). The browser extension in `extension/` is an unpublished experiment

### Documentation

- Update the README.md if you change functionality
- Add JSDoc comments for new functions and classes
- Include examples in your documentation
- Keep documentation up to date with code changes

## Project Structure

```
agentlet-core/
├── src/                    # Source code
│   ├── core/               # Core framework classes (AgentletCore, Module, ModuleRegistry, ...)
│   ├── ui/                 # User interface components
│   ├── utils/               # Utility functions
│   ├── libraries/           # Third-party library loading
│   └── types/               # Public TypeScript declarations
├── extension/             # Browser extension files
├── examples/              # Example modules
├── tools/                 # Build and development tools
└── dist/                  # Built files (generated)
```

## Sharing modules

There is no public module registry. If you build a module for others, publish it as its own package or repository. Modules are not sandboxed: a module runs with the host page's privileges and can read everything the page can, so review any third-party module before you load it. See [SECURITY.md](SECURITY.md) for the threat model.

## Getting Help

- **GitHub Issues**: For bug reports and feature requests
- **Documentation**: [agentlet.io/docs](https://agentlet.io/docs/), the README and the inline documentation
- **Security problems**: Use the [security advisory form](https://github.com/agentlet/agentlet-core/security/advisories/new), not a public issue

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating you agree to abide by it.

## License

By contributing to agentlet-core, you agree that your contributions will be licensed under the MIT License.
