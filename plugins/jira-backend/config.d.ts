export interface Config {
  /**
   * Connections to external systems, following the shapes of the
   * `@backstage/connections` framework (BEP-0014). The Jira backend reads
   * entries with `type: jira`.
   */
  connections?: Array<
    | {
        /** Jira connection. */
        type: 'jira';
        /** Display title for this connection. */
        title?: string;
        /** Hostname of the Jira instance, e.g. `example.atlassian.net`. */
        host: string;
        /**
         * Base URL for REST API calls when it differs from `https://<host>`,
         * e.g. for a Jira Data Center behind a context path.
         */
        apiBaseUrl?: string;
        /** Auth methods; the first entry is used. */
        auth: Array<
          | {
              /** Jira Cloud basic auth: account email plus API token. */
              method: 'basic';
              title?: string;
              email: string;
              /**
               * Jira API token.
               * @visibility secret
               */
              apiToken: string;
            }
          | {
              /** Jira Data Center / Server personal access token. */
              method: 'token';
              title?: string;
              /**
               * Personal access token sent as a bearer token.
               * @visibility secret
               */
              token: string;
            }
        >;
      }
    | {
        /** Connection entries of other types are ignored by this plugin. */
        type: string;
        [key: string]: unknown;
      }
  >;

  jira?: {
    /**
     * Named issue filters offered in the Jira entity tab, in display order.
     * When omitted, built-in `unresolved` (default) and `all` filters apply.
     */
    filters?: Array<{
      /** Unique filter id, referenced by `jira.defaultFilter` and the API. */
      id: string;
      /** Display name shown in the filter control. */
      name: string;
      /**
       * JQL fragment ANDed onto the entity's project constraint. Omit for an
       * unconstrained "all issues" filter.
       */
      jql?: string;
    }>;
    /** Id of the filter applied by default. Defaults to the first filter. */
    defaultFilter?: string;
  };
}
