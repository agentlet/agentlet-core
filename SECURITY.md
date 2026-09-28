# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| 1.0.x   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability in Agentlet Core, please report it by emailing security@agentlet.dev or by creating a private security advisory on GitHub.

## Known Security Issues

### Resolved

#### xlsx (SheetJS)
- **CVE**: GHSA-4r6h-8v6p-xvw6 (Prototype Pollution) - fixed upstream in 0.19.3
- **CVE**: GHSA-5pgg-2g8v-p4x9 (Regular Expression Denial of Service) - fixed upstream in 0.20.2
- **Status**: Resolved. `xlsx` is upgraded to 0.20.3, which includes both fixes. The npm registry's last published release is 0.18.5, so 0.20.3 is installed from the SheetJS project's own CDN (cdn.sheetjs.com) rather than from npm.

## Security Measures

- **Dependency Auditing**: dependency vulnerability scanning in CI is being added; it is not yet part of the pipeline today
- **Content Security Policy**: Respects CSP headers in target applications
- **Cross-Origin Security**: Implements proper CORS handling
- **Input Validation**: Form filling includes value validation
- **Safe DOM Operations**: All DOM operations are scoped to prevent collisions

## Security Best Practices

When using Agentlet Core:

1. **Deploy from trusted domains**: Host agentlet JavaScript from domains allowed by your CSP
2. **Use HTTPS**: Always serve agentlet code over HTTPS
3. **Validate API endpoints**: Ensure your backend APIs implement proper authentication
4. **Sanitize form data**: Validate and sanitize any data before sending to your APIs
5. **Regular updates**: Keep Agentlet Core updated to the latest version

## Contact

For security questions or concerns, please contact us at security@agentlet.dev.