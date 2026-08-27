## 1. Prettier baseline

- [x] 1.1 Run `yarn prettier:check`, fix any offenders with `prettier --write` (adding `.prettierignore` entries only for generated/vendored paths), and verify the check passes cleanly

## 2. Workflow

- [x] 2.1 Add `.github/workflows/ci.yml` per the design (PR + main triggers, per-ref concurrency with cancel-in-progress, `contents: read` permissions, Node 22 with corepack-before-setup-node ordering and yarn cache, steps: `yarn install --immutable`, `yarn tsc`, `yarn lint:all`, `yarn prettier:check`, `CI=1 yarn test`, 20-minute timeout) and verify the YAML parses and each command succeeds locally in the same order
- [x] 2.2 Add a CI badge/note to the root README (or create a short section) mentioning the checks and the recommended required-check branch protection; verify the wording matches the workflow

## 3. Verification

- [x] 3.1 Full local dry run of the exact CI sequence from a clean state where feasible (`yarn install --immutable`, `yarn tsc`, `yarn lint:all`, `yarn prettier:check`, `CI=1 yarn test`) — all green
- [x] 3.2 After opening the pull request for this change, confirm the first CI run executes and is green on the PR before merging (the PR is the workflow's real verification)
