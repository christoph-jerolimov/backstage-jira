# jira-connection Specification

## Purpose
Defines how the Jira backend obtains Jira hosts and credentials from the Backstage connections configuration (BEP-0014 `connections` array), keeping credentials central and out of plugin-private config.

## Requirements

### Requirement: Jira connection is declared in connections config

The Jira backend SHALL read its Jira connectivity from entries of the top-level `connections` array in app-config with `type: jira`. Each entry SHALL follow the connections framework shape: a required `host` (the Jira hostname), an optional `title`, an optional `apiBaseUrl` (defaulting to `https://<host>` REST API), and a non-empty `auth` array of auth-method entries. The backend SHALL NOT read Jira credentials from any other configuration location.

#### Scenario: Valid connection entry

- **WHEN** app-config contains a `connections` entry `{ type: jira, host: example.atlassian.net, auth: [{ method: basic, email: bot@example.com, apiToken: <secret> }] }`
- **THEN** the backend uses `https://example.atlassian.net` as the Jira base URL and authenticates requests with the given credentials

#### Scenario: No jira entry configured

- **WHEN** the `connections` array has no `type: jira` entry
- **THEN** issue lookups fail with a configuration error naming the `connections` config, and the rest of the backend keeps working

### Requirement: Supported auth methods

Jira connections SHALL support the auth methods `basic` (email/username plus API token, for Jira Cloud) and `token` (bearer personal access token, for Jira Data Center / Server). A connection entry whose `auth` array is empty, or that contains an unknown method or a method entry missing required fields, SHALL be rejected at startup with an error naming the offending entry (without echoing secret values).

#### Scenario: Basic auth

- **WHEN** a jira connection has auth method `basic` with `email` and `apiToken`
- **THEN** outgoing Jira requests carry HTTP Basic authorization derived from email and apiToken

#### Scenario: Bearer token auth

- **WHEN** a jira connection has auth method `token` with `token`
- **THEN** outgoing Jira requests carry a `Bearer` authorization header

#### Scenario: Invalid auth entry

- **WHEN** a jira connection entry has an empty `auth` array or an unknown auth method
- **THEN** the backend reports a configuration error that names the connection and the problem but never includes secret values

### Requirement: Multiple Jira hosts

Multiple `type: jira` connection entries SHALL be supported, distinguished by `host`. An entity MAY select a host with an optional `jira/instance` annotation naming a connection host; without the annotation the sole configured connection is used, and when several are configured and none is selected the lookup SHALL fail with an error asking for disambiguation.

#### Scenario: Single connection, no annotation

- **WHEN** exactly one jira connection is configured and an entity has no `jira/instance` annotation
- **THEN** that connection is used

#### Scenario: Host selected by annotation

- **WHEN** two jira connections with hosts `a.atlassian.net` and `b.atlassian.net` are configured and the entity has annotation `jira/instance: b.atlassian.net`
- **THEN** the connection with host `b.atlassian.net` is used

### Requirement: Credentials never leave the backend

Jira credentials from the connections configuration SHALL be marked secret in the config schema, SHALL never be included in API responses, log lines, or error messages, and SHALL never be sent to the frontend.

#### Scenario: Error path does not leak secrets

- **WHEN** a Jira request fails and the failure is logged and returned as an error
- **THEN** neither the log entry nor the response body contains the configured token or apiToken values
