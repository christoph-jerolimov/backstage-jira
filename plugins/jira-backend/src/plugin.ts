import {
  coreServices,
  createBackendPlugin,
} from '@backstage/backend-plugin-api';
import { catalogServiceRef } from '@backstage/plugin-catalog-node';
import { createRouter } from './router';
import { JiraClient } from './services/JiraClient';
import { JiraConnectionsReader } from './services/JiraConnectionsReader';
import { readFilterConfig } from './services/filterConfig';

/**
 * Backend plugin serving Jira issues for catalog entities.
 *
 * @public
 */
export const jiraPlugin = createBackendPlugin({
  pluginId: 'jira',
  register(env) {
    env.registerInit({
      deps: {
        logger: coreServices.logger,
        config: coreServices.rootConfig,
        httpAuth: coreServices.httpAuth,
        httpRouter: coreServices.httpRouter,
        catalog: catalogServiceRef,
      },
      async init({ logger, config, httpAuth, httpRouter, catalog }) {
        // Both throw InputError on invalid configuration, failing startup.
        const connections = JiraConnectionsReader.fromConfig(config);
        const filterConfig = readFilterConfig(config);

        httpRouter.use(
          await createRouter({
            logger,
            httpAuth,
            catalog,
            connections,
            filterConfig,
            jiraClient: new JiraClient({ logger }),
          }),
        );
      },
    });
  },
});
