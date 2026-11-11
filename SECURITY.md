# Security Policy — Astral Zero

Built for the **NASA International Space Apps Challenge 2026**.

Astral Zero is committed to maintaining a secure, reproducible, and robust software architecture across both its real-time simulation backend and client web application.

---

## Supported Versions

Only the latest release branch and current production deployments receive active security patches:

| Version | Supported          | Status |
| ------- | ------------------ | ------ |
| `1.x`   | :white_check_mark: | Active (Current Mainline) |
| `< 1.0` | :x:                | Deprecated (Prototypes) |

---

## Security Architecture & Controls

### 1. Zero Committed Secrets
- No API keys, credentials, private certificates, or access tokens are tracked in git history or committed files.
- Configuration is provided strictly through environment variables (`PORT`, `ALLOWED_ORIGINS`, `VITE_SERVER_URL`), with defaults documented in [`.env.example`](.env.example).
- `.env` and `.env.*` files are explicitly excluded via [`.gitignore`](.gitignore).

### 2. Input Validation & Sanitization
- All incoming HTTP and WebSocket payloads are validated against strict schema limits before processing.
- The server validates orbital parameters and rejects malformed or unwhitelisted properties.
- Socket.io connections are protected by a per-socket packet rate limiter (maximum 25 events/sec) to defend against packet flooding.

### 3. HTTP Security Headers & Helmet
- Express endpoints are shielded using [`helmet`](https://github.com/helmetjs/helmet) with a customized Content Security Policy (CSP), disabling cross-origin embedding vulnerabilities and locking connections to approved origins.

### 4. Rate Limiting
- Public API routes (`/api/*`) are throttled using [`express-rate-limit`](https://github.com/express-rate-limit/express-rate-limit) to a maximum of 100 requests per minute per IP address.

### 5. CORS Restrictions
- In production (`NODE_ENV=production`), wildcard origins (`*`) are disallowed. Only origins enumerated in `ALLOWED_ORIGINS` are granted access.

### 6. Dependency Scanning
- Dependabot is configured via [`.github/dependabot.yml`](.github/dependabot.yml) to perform automated weekly audits across both root and backend ecosystems.
- Production dependency trees are maintained at zero known high or critical vulnerabilities (`npm audit --omit=dev`).

---

## Reporting a Vulnerability

If you discover a potential security vulnerability in Astral Zero:

1. **Do not create a public issue.** Please do not disclose vulnerabilities in public issue trackers.
2. **Submit a report:** Email the maintainers directly with details of the vulnerability, steps to reproduce, and impact assessment.
3. **Acknowledgment:** You will receive an acknowledgment within 48 hours.
4. **Resolution Timeline:** Confirmed vulnerabilities will be patched within 7 business days, accompanied by a public advisory after mitigation is deployed.

Thank you for helping keep Astral Zero and orbital space clean and safe!
