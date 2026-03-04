# Contributing to oh-my-mcp

Thank you for considering contributing! This document outlines the development workflow, coding standards, and expectations.

---

## Code of Conduct

Be respectful and inclusive. Harassment or abuse will not be tolerated.

---

## Getting Started

1. **Fork** the repository on GitHub.
2. **Clone** your fork locally.
3. **Create a branch** for your feature/fix: `git checkout -b my-feature`
4. **Install dependencies**: `npm ci`
5. **Make changes** and add tests.
6. **Run tests** and ensure they pass: `npm test`
7. **Lint**: `npm run lint` (fix any warnings/errors)
8. **Commit** with clear messages: `git commit -m "feat: ..."`
9. **Push** to your fork: `git push origin my-feature`
10. **Open a Pull Request** against `main`.

---

## Branch Naming

- Features: `feature/short-description`
- Bugfixes: `fix/issue-description`
- Docs: `docs/update-description`
- Refactors: `refactor/description`

---

## Coding Style

- **TypeScript**: Strict mode enabled. Avoid `any`; prefer explicit types.
- **Formatting**: Use Prettier if configured (not yet). For now, follow existing style: 2-space indent, semicolons.
- **Naming**: camelCase for variables/functions; PascalCase for classes; UPPER_SNAKE for constants.
- **Imports**: Use relative imports within the project (`./`, `../`). Prefer explicit file extensions (`.js`) for ESM compatibility.
- **Error handling**: Use try/catch appropriately; log errors with context.
- **Logging**: Use `getLogger()` from `src/logger.js`. Include structured fields, not just strings.

---

## Testing

- All new features must include **unit tests** (Vitest).
- **Integration tests** are encouraged for end-to-end scenarios.
- Aim for high coverage, but prioritize meaningful tests.
- Place tests in `test/` mirroring the source structure.

Run tests with `npm test`. Use `--run` for CI mode: `npm test -- --run`.

---

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): subject

body (optional)
```

Types:
- `feat`: new feature
- `fix`: bug fix
- `docs`: documentation only
- `style`: formatting, no code change
- `refactor`: code change that neither fixes a bug nor adds a feature
- `perf`: performance improvement
- `test`: adding or fixing tests
- `build`: changes to build system
- `ci`: CI/CD changes
- `chore`: other changes that don't modify src or tests

Example: `feat(gateway): add Server-Id header support`

---

## Pull Request Process

1. **Open Draft PR** early to get feedback.
2. **Describe** the problem and solution. Reference any related issues.
3. **Ensure CI passes** (typecheck, lint, tests, coverage).
4. **Request review** from maintainers.
5. Address review comments, push additional commits as needed.
6. **Squash** commits if requested.
7. Maintainer merges.

---

## Release Process

- Maintainers handle version bumps and GitHub Releases.
- Changelog is generated from conventional commits.
- After merge, a new version may be published.

---

## Architecture Notes

- **Domain layer** should remain pure (no infrastructure dependencies).
- **DI** via `src/di/modules/app.module.ts`; register new bindings there.
- **Transport abstraction**: implement `ServerTransport` for new backends.
- **Middleware**: add to `src/index.ts` pipeline. Keep concerns separated.
- **Configuration**: extend `ConfigSchema` in `src/config.ts`.

---

## Communication

- For bugs/feature requests: use GitHub Issues.
- For discussion: join our Discord (link in README).

---

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.

---

Thank you for making oh-my-mcp better! 🎉
