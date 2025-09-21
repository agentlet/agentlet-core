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