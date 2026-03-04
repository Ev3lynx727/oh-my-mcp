# Security Policy

## Supported Versions

Only the latest version is actively maintained and receives security updates.

| Version | Supported          |
|---------|-------------------|
| 0.1.x   | ✅ (current)      |
| < 0.1   | ❌                |

---

## Reporting a Vulnerability

We take security seriously. If you discover a vulnerability, please report it responsibly.

**Please do NOT open a public GitHub issue** for security issues.

Instead, contact us via GitHub Security Advisory:

- Go to the repository's **Security** tab → **Report a vulnerability**
- Or email: security@ev3lynx.dev (if you prefer encrypted, include your GPG key)

Include:
- Detailed description of the issue
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

We will acknowledge receipt within **48 hours** and provide a timeline for a fix.

---

## Disclosure Process

1. Reporter submits vulnerability privately.
2. Maintainers confirm and assess severity.
3. A fix is developed and prepared for release.
4. Reporter is asked to verify the patch.
5. A new version is published and a GitHub Security Advisory is issued (if needed).
6. Public disclosure is coordinated with the reporter (usually within 30 days of fix).

---

## Security Best Practices for Deployments

- Run oh-my-mcp behind a TLS-terminating reverse proxy; do not expose directly to the internet.
- Use strong bearer tokens for API authentication; rotate periodically.
- Limit network access to the gateway and management ports (firewall, security groups).
- Keep Node.js and dependencies updated (`npm audit`).
- Monitor logs and metrics for suspicious activity.
- Use read-only file systems for containerized deployments where possible.
- Isolate MCP server processes; avoid running as root.

---

## PGP Key (optional)

Primary maintainer PGP key available on request.

---

Thank you for helping keep oh-my-mcp and its users safe!
