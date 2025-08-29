# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Agentlet Core, please report it by emailing security@agentlet.dev or by creating a private security advisory on GitHub.

## Known Security Issues

### Non-Critical Dependencies

The following dependencies have known security vulnerabilities that are accepted risks:

#### xlsx (SheetJS) - High Severity
- **CVE**: GHSA-4r6h-8v6p-xvw6 (Prototype Pollution)
- **CVE**: GHSA-5pgg-2g8v-p4x9 (Regular Expression Denial of Service)
- **Risk Assessment**: Low risk in our use case
- **Justification**: 
  - Used only for Excel export functionality in TableExtractor
  - Not exposed to untrusted user input in typical usage
  - Prototype pollution requires specific attack vectors unlikely in bookmarklet context
  - ReDoS requires malicious Excel files, which users control
- **Mitigation**: Excel export is optional functionality; users can disable if concerned
- **Status**: Monitoring for patches; considering alternative libraries

## Security Measures

- **Dependency Auditing**: CI/CD pipeline audits for critical vulnerabilities
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