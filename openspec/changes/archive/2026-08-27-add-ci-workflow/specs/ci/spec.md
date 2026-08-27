## Purpose

Defines the repository's continuous integration contract: every change to the default branch is verified by the same checks contributors run locally, so a green run means the repo type-checks, lints, is formatted, and passes all tests.

## ADDED Requirements

### Requirement: CI runs on pull requests and the default branch

A GitHub Actions workflow SHALL run on every pull request targeting `main` and on every push to `main`. Superseded runs for the same pull request SHALL be cancelled rather than queued.

#### Scenario: Pull request opened or updated

- **WHEN** a pull request against `main` is opened or receives new commits
- **THEN** the CI workflow runs on the merge candidate and reports its status on the pull request

#### Scenario: Push to main

- **WHEN** commits land on `main`
- **THEN** the CI workflow runs on the new head

### Requirement: CI verifies install, types, lint, format, and tests

The workflow SHALL fail unless all of the following succeed against a clean checkout with the repository's pinned package manager and a supported Node.js version: dependency installation with an immutable lockfile, the repository type check, lint across all packages, the Prettier formatting check, and the test suites of all workspaces.

#### Scenario: A type error is introduced

- **WHEN** a pull request contains code that fails `yarn tsc`
- **THEN** the CI run fails at the type check step

#### Scenario: A test regression is introduced

- **WHEN** a pull request breaks any workspace's tests
- **THEN** the CI run fails at the test step

#### Scenario: Lockfile drift

- **WHEN** a pull request changes dependencies without updating the lockfile
- **THEN** the CI run fails at the install step

#### Scenario: Unformatted code

- **WHEN** a pull request adds files that violate the Prettier configuration
- **THEN** the CI run fails at the formatting step
