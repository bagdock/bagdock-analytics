# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| < Latest | :x:               |

Only the most recent published release receives security patches.
If you are using an older version, please upgrade before reporting.

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email **security@bagdock.com** with:

1. A description of the vulnerability and its potential impact.
2. Steps to reproduce or a proof-of-concept (if possible).
3. The affected version(s) and any relevant configuration details.
4. Your name/handle if you would like to be credited.

### What to Expect

| Step | Timeline |
| --- | --- |
| Acknowledgement of your report | Within 48 hours |
| Initial triage and severity assessment | Within 5 business days |
| Status update with remediation plan | Within 10 business days |
| Fix released (critical/high severity) | Within 30 days |
| Public disclosure | 90 days after report, or upon fix release (whichever is first) |

If you have not received an acknowledgement within 48 hours, please follow up
to confirm we received the original report.

## Disclosure Policy

We follow **coordinated disclosure**:

- We will work with you to understand and resolve the issue before any public
  disclosure.
- We ask that you give us a reasonable window (up to 90 days) to release a fix
  before publishing details.
- We will coordinate with you on the disclosure timeline and credit.

## Scope

The following are considered security issues:

- Remote code execution
- Authentication or authorization bypass
- Credential or secret exposure
- Injection vulnerabilities (command, path, etc.)
- Denial-of-service with minimal resources
- Supply-chain risks (dependency confusion, malicious packages)

The following are **not** in scope — please open a regular GitHub issue instead:

- Bugs that do not have a security impact
- Feature requests
- Performance issues without a denial-of-service component
- Social engineering attacks against Bagdock personnel

## Credit

We appreciate responsible disclosure. With your permission, we will credit you
by name or handle in the release notes for the fix. Let us know your preference
when reporting.

## PGP Key

If you need to send an encrypted report, request our PGP public key by emailing
security@bagdock.com with the subject line "PGP Key Request".
