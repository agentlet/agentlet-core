# Contributing to Agentlet Core

Thank you for your interest in contributing to Agentlet Core! We welcome contributions from the community and are grateful for any help you can provide.

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
   npm run build
   npm run test
   npm run lint
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

- Use consistent indentation (2 spaces)
- Follow JavaScript ES6+ conventions
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

### TypeScript

agentlet-core is migrating to TypeScript gradually, file by file. `src/` and `tests/` accept `.ts` files side by side with the existing `.js` files, and the following rules apply to any PR that touches `src/`:

- Write every new file under `src/` in TypeScript (`.ts`). This keeps the amount of untyped code from growing while the migration is in progress.
- If your PR touches an existing `.js` file under `src/` and that file is under 300 lines, convert it to `.ts` in the same PR: rename it with `git mv`, add strict types, and keep the behaviour and existing tests unchanged. Larger files can stay JavaScript for now; convert them in a dedicated PR instead of bundling a large rewrite with an unrelated change.
- Avoid `any`. `typescript-eslint` rejects explicit `any` in `.ts` files as an error. When a value is genuinely dynamic, use `unknown` (or a precise union) and add a one-line comment explaining why. If `any` is truly unavoidable, suppress it locally with `eslint-disable-next-line` and a reason on the same line, rather than disabling the rule broadly.
- You never have to write TypeScript to build an agentlet on top of this library: agentlets consume the published declarations (see [TypeScript support](docs/typescript.md)) and can stay plain JavaScript.
- Keep the `.js` extension in relative imports even after a file is converted to `.ts` (e.g. `import { EventBus } from './EventBus.js'`). esbuild, `tsc` (`moduleResolution: bundler`), and Jest's `moduleNameMapper` all resolve it, so imports do not need to change when a file is converted.
- Share option and shape types with the public API instead of redefining them: import them from `src/types/public-api.d.ts` with `import type`, and update the conformance checks in `tests/types/public-api.test-d.ts` whenever a public class's shape changes.
- Declare optional or duck-typed members (hooks the core detects with `typeof x === 'function'`) through a declaration merge, for example `interface Module { getPanelTitle?(): string }`, not as an uninitialized class field. An uninitialized field can become an own property set to `undefined` depending on the transpiler, which would shadow a subclass's implementation.
- Run `npm run typecheck` to type-check the project with `tsc`; it must pass, together with `npm test`, `npm run build`, and `npm run lint`, before you commit.
- esbuild compiles `.ts` sources natively, so no extra build step is needed.
- Tests may be written in `.ts`; Jest transforms them with babel-jest, the same as `.js` tests.

### Module Development

When creating new modules:

- Extend the `BaseModule` or `BaseSubmodule` classes
- Follow the existing module patterns and conventions
- Include proper error handling
- Add appropriate lifecycle hooks
- Test your module thoroughly

### Testing

- Write tests for new functionality
- Ensure all existing tests continue to pass
- Test in multiple browsers when possible
- Test both as a bookmarklet and browser extension

### Documentation

- Update the README.md if you change functionality
- Add JSDoc comments for new functions and classes
- Include examples in your documentation
- Keep documentation up to date with code changes

## Project Structure

```
agentlet-core/
├── src/                    # Source code
│   ├── core/              # Core framework classes
│   ├── plugin-system/     # Module loading system
│   ├── ui/                # User interface components
│   └── utils/             # Utility functions
├── extension/             # Browser extension files
├── examples/              # Example modules
├── tools/                 # Build and development tools
└── dist/                  # Built files (generated)
```

## Module Registry

If you're creating modules for the community:

1. **Publish to npm** with the `agentlet-module` keyword
2. **Submit to the registry** by creating an issue with your module details
3. **Follow security guidelines** - modules are sandboxed but should still be secure
4. **Provide documentation** and examples for your module

## Getting Help

- **GitHub Issues**: For bug reports and feature requests
- **Discussions**: For questions and community support
- **Documentation**: Check the README.md and inline documentation

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## License

By contributing to Agentlet Core, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in the project's README.md and release notes. Thank you for helping make Agentlet Core better!