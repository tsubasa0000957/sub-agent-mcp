# Contributing

Thanks for helping improve `sub-agent-mcp`.

Bug reports, documentation improvements, tests, and focused feature proposals are welcome. For a
substantial change, open an issue first so the approach and scope can be discussed before
implementation.

## Development setup

Requirements:

- Node.js 24 or later
- npm

```bash
cp .env.example .env
npm ci
npm run check
```

The default test suite does not call the OpenAI API. `npm run test:integration` is opt-in and makes
billable API requests, so run it only when the change requires live-provider verification.

## Pull requests

- Keep each pull request focused on one problem.
- Follow the existing TypeScript style and architecture.
- Add or update tests for behavior changes.
- Run `npm run check` before submitting.
- Update documentation when configuration or user-visible behavior changes.
- Never commit API keys, tokens, Access JWTs, private keys, or production hostnames.

Use a concise commit title that describes the outcome. In the pull-request description, explain
what changed, why it changed, and how it was verified.

## Security

Do not report security vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md) and use
GitHub's private vulnerability reporting instead.
