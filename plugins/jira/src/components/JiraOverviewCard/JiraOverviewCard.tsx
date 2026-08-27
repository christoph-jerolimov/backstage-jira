import useAsyncRetry from 'react-use/esm/useAsyncRetry';
import { useApi } from '@backstage/frontend-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { Link } from '@backstage/core-components';
import {
  Card,
  CardBody,
  CardHeader,
  Flex,
  Skeleton,
  Text,
} from '@backstage/ui';
import { jiraApiRef } from '../../api';

export const JiraOverviewCard = () => {
  const { entity } = useEntity();
  const jiraApi = useApi(jiraApiRef);
  const entityRef = stringifyEntityRef(entity);

  const { value, loading, error } = useAsyncRetry(
    () => jiraApi.getStatusCounts({ entityRef }),
    [jiraApi, entityRef],
  );

  return (
    <Card>
      <CardHeader>
        <Flex align="center" justify="between">
          <Text weight="bold">Jira</Text>
          <Link to="jira">View issues</Link>
        </Flex>
      </CardHeader>
      <CardBody>
        {loading && <Skeleton height={48} />}
        {!loading && error && (
          <Text color="secondary">Failed to load Jira issue counts.</Text>
        )}
        {!loading && !error && value && (
          <Flex justify="between" gap="4">
            {value.categories.map(category => (
              <Flex key={category.id} direction="column" align="center" gap="1">
                <Text variant="title-medium" weight="bold">
                  {category.count}
                </Text>
                <Text color="secondary">{category.name}</Text>
              </Flex>
            ))}
            <Flex direction="column" align="center" gap="1">
              <Text variant="title-medium" weight="bold">
                {value.total}
              </Text>
              <Text color="secondary">Total</Text>
            </Flex>
          </Flex>
        )}
      </CardBody>
    </Card>
  );
};
