import { createBackend } from '@backstage/backend-defaults';
import { mockServices } from '@backstage/backend-test-utils';
import { catalogServiceMock } from '@backstage/plugin-catalog-node/testUtils';

// Standalone development backend for the jira plugin.
//
// Start it with `yarn start` in this package, configure a Jira connection in
// an app-config, then try:
//
//   curl 'http://localhost:7007/api/jira/v1/issues?entityRef=component:default/sample' \
//     -H 'Authorization: Bearer mock-service-token'

const backend = createBackend();

backend.add(mockServices.auth.factory());
backend.add(mockServices.httpAuth.factory());

backend.add(
  catalogServiceMock.factory({
    entities: [
      {
        apiVersion: 'backstage.io/v1alpha1',
        kind: 'Component',
        metadata: {
          name: 'sample',
          title: 'Sample Component',
          annotations: {
            'jira/project-key': 'PROJ',
          },
        },
        spec: {
          type: 'service',
        },
      },
    ],
  }),
);

backend.add(import('../src'));

backend.start();
