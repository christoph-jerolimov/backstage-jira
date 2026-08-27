# Add CI Workflow

## Why

Six pull requests have merged into `main` with zero automated checks — every verification so far ran only on a developer machine. Nothing protects the default branch from a change that breaks the type check, lint, or the 161-test suite, and outside contributions would arrive with no signal at all.

## What Changes

- A GitHub Actions workflow (`.github/workflows/ci.yml`) that runs on every pull request and on pushes to `main`: dependency install (immutable lockfile), type check (`yarn tsc`), lint over all packages (`yarn lint:all`), Prettier formatting check, and the full test suite for every workspace.
- Repository files are brought into Prettier compliance where needed so the formatting check starts green.
- No runtime behavior changes; the app, plugins, and configuration are untouched except for formatting.

## Capabilities

### New Capabilities

- `ci`: the repository's continuous integration contract — which checks run, on which events, and what a green run guarantees.

### Modified Capabilities

_None._

## Impact

- **New files**: `.github/workflows/ci.yml`.
- **Possibly reformatted files**: whatever `prettier --check .` currently flags.
- **No new dependencies** beyond standard GitHub Actions (`actions/checkout`, `actions/setup-node`).
- The workflow verifies itself: the pull request introducing it triggers the first run, so it is proven green before merging.
