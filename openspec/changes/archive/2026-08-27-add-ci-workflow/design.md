# Design: Add CI Workflow

## Context

- The repo is a Yarn 4.13 workspace (`packageManager: yarn@4.13.0`, `yarnPath` checked in, `nodeLinker: node-modules`) with `engines.node: 22 || 24`. There is no `.github/` directory yet.
- Existing root scripts: `tsc`, `lint:all` (`backstage-cli repo lint`), `prettier:check` (`prettier --check .`), `test` (`backstage-cli repo test`), `test:all` (with coverage). The `lint`/`test` defaults use `--since origin/master`, which is wrong for this repo (default branch is `main`) — CI must use the `--all`-style variants and not the `--since` ones.
- Local verification throughout the project has been: `yarn tsc`, `yarn lint:all`, per-workspace `yarn test`. `prettier --check .` has never been run in this session — files added by the six merged rounds may not be compliant.

## Goals / Non-Goals

**Goals:**

- One workflow, one job, mirroring exactly what a contributor runs locally; green from its very first run (the PR that introduces it).
- Fast enough to be tolerable (~ a few minutes): dependency cache, cancelled superseded runs.

**Non-Goals:**

- Branch protection rules (a repository setting, not a file — noted in the README for the owner to enable).
- E2E/Playwright jobs (no app build in CI yet), release/publish pipelines, coverage upload, or a build matrix over Node versions.

## Decisions

### D1: Single job, sequential steps

One `ci` job on `ubuntu-latest` with steps: checkout → `actions/setup-node` (Node 22, `cache: yarn`) → `corepack enable` → `yarn install --immutable` → `yarn tsc` → `yarn lint:all` → `yarn prettier:check` → `CI=1 yarn test` (backstage-cli repo test runs all workspaces' suites when not given `--since`). Sequential steps in one job share the install cost and give a precise failing step name; splitting into parallel jobs would triple the install time for a repo this size.

`test` over `test:all`: coverage collection roughly doubles test time and nobody consumes the report; the plain run is the same assertion set.

### D2: Yarn via corepack, cache via setup-node

`corepack enable` activates the pinned Yarn 4.13 from `packageManager`; `actions/setup-node` with `cache: yarn` caches the Yarn cache directory keyed on `yarn.lock`. `--immutable` makes lockfile drift a hard failure (the spec's lockfile scenario). Note the ordering quirk: `setup-node`'s cache resolution invokes yarn, so `corepack enable` must run *before* `setup-node` — the design places it accordingly (checkout → corepack → setup-node).

### D3: Concurrency group per ref

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

Rapid pushes to a PR cancel the outdated run. Pushes to `main` share a group per-ref too; cancelling a superseded `main` run is acceptable since the newer head subsumes it.

### D4: Make Prettier green first, don't weaken the check

`prettier --check .` runs over the repo as-is. If current files fail, the fix is `prettier --write` on the offenders in this change (plus a `.prettierignore` entry only for generated/vendored paths like `dist-types`, if Prettier trips over them) — not dropping the step. Formatting-only diffs are reviewed as part of this change.

### D5: Timeout and permissions

`timeout-minutes: 20` (generous over the expected ~5) and `permissions: contents: read` — the job needs nothing else, keeping the token minimal.

## Risks / Trade-offs

- **[First run happens on the PR, not locally]** → Mitigated by running every step locally in the same order first; the PR then serves as the real verification gate before merge.
- **[`repo test` behavior differences under CI]** → `CI=1` forces single-run (non-watch) mode; the same invocation has been used per-workspace throughout the project.
- **[Prettier reformat may touch many files]** → Formatting-only, no logic changes; kept in a separate commit within the change so the diff is easy to skim.

## Migration Plan

Additive file(s). Merge activates CI for all future PRs. Recommended follow-up for the repo owner (settings, not files): mark the `ci` check as required on `main`. Rollback: delete the workflow file.
