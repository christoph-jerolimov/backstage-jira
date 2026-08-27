# [Backstage](https://backstage.io)

[![CI](https://github.com/christoph-jerolimov/backstage-jira/actions/workflows/ci.yml/badge.svg)](https://github.com/christoph-jerolimov/backstage-jira/actions/workflows/ci.yml)

This is your newly scaffolded Backstage App, Good Luck!

## Continuous integration

Every pull request and push to `main` runs the [CI workflow](.github/workflows/ci.yml):
immutable dependency install, type check (`yarn tsc`), lint (`yarn lint:all`),
Prettier formatting check (`yarn prettier:check`), and all workspace tests
(`yarn test`). Recommended repository setting: mark the `ci` check as required
on `main` via branch protection.

To start the app, run:

```sh
yarn install
yarn start
```
