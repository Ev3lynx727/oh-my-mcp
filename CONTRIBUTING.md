# Contributing to oh-my-mcp

Thanks for wanting to help. PRs, bug reports, and feature requests are welcome.

## Branch strategy

Two branches with separated concerns:

- **main** — source only, pristine, release-ready. Tags/releases go here.
- **develop** — active workbench. Audit files, planning docs, experiments, todos.

All contributions target **develop**. Maintainer cherry-picks only source commits to `main` after review. Tags and releases are created only when commits land on `main` — pushing to `develop` never triggers a tag or release.

| Action | Branch |
|--------|--------|
| Open a PR | `develop` |
| File a bug | `main` (tagged issue, no branch needed) |
| Urgent hotfix | `main` ➜ hotfix branch ➜ merge to `main` + cherry-pick to `develop` |

## Getting Started

```bash
git clone https://github.com/Ev3lynx727/oh-my-mcp.git
cd oh-my-mcp
npm install
```

## Running Tests

```bash
npm test
```

All tests must pass before submitting a PR.

## PR Guidelines

1. Fork the repo and create a feature branch off `develop`:
   ```bash
   git checkout develop
   git checkout -b feat/my-thing
   ```
2. Write your code
3. Add or update tests if applicable
4. Run tests — everything must pass
5. Commit with a clear message following [conventional commits](https://www.conventionalcommits.org/):
   - `feat: add frontmatter validator`
   - `fix: handle empty heading edge case`
   - `docs: update README examples`
   - `chore: bump dependencies`
   - **Keep source and .md commits separate** — never mix `src/` changes with `.md` changes in the same commit
6. Push to your fork and open a PR against `develop`

## Code Style

- **Language**: TypeScript (Node >=18)
- **Naming**: camelCase for functions/variables, PascalCase for classes/types
- **Lint**: `npm run lint` — zero warnings before commit
- **Dependencies**: Minimize. No new deps without discussion.

## Architecture Decisions

If you're planning a significant change, open an issue first. Key decisions documented in `docs/` and `CE.md` (develop-only).

## License

MIT — your contributions will be released under the same license.
