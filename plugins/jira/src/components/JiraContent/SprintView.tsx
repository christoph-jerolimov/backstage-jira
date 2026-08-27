import useAsyncRetry from 'react-use/esm/useAsyncRetry';
import { useApi } from '@backstage/frontend-plugin-api';
import { Button, Flex, Table, Tag, TagGroup, Text } from '@backstage/ui';
import { jiraApiRef } from '../../api';
import { issueColumnConfig, toIssueRows } from './issueColumns';

const dateRange = (start?: string, end?: string) => {
  if (!start && !end) {
    return undefined;
  }
  const format = (value?: string) =>
    value ? new Date(value).toLocaleDateString() : '…';
  return `${format(start)} – ${format(end)}`;
};

/** The active sprint of the entity's annotated board, with its issues. */
export const SprintView = (props: {
  entityRef: string;
  onIssueClick: (issueKey: string) => void;
}) => {
  const { entityRef, onIssueClick } = props;
  const jiraApi = useApi(jiraApiRef);

  const { value, loading, error, retry } = useAsyncRetry(
    () => jiraApi.getSprint({ entityRef }),
    [jiraApi, entityRef],
  );

  if (error && !loading) {
    return (
      <Flex direction="column" align="start" gap="4">
        <Text>Failed to load the sprint: {error.message}</Text>
        <Button onPress={retry}>Retry</Button>
      </Flex>
    );
  }

  if (!loading && value && value.sprint === null) {
    return <Text>The board has no active sprint.</Text>;
  }

  const sprint = value?.sprint;
  const range = dateRange(sprint?.startDate, sprint?.endDate);

  return (
    <Flex direction="column" gap="4">
      {sprint && (
        <Flex direction="column" gap="1">
          <Flex align="center" gap="2">
            <Text variant="title-small" weight="bold">
              {sprint.name}
            </Text>
            <TagGroup aria-label="Sprint state">
              <Tag id="state">{sprint.state}</Tag>
            </TagGroup>
            {range && <Text color="secondary">{range}</Text>}
          </Flex>
          {sprint.goal && <Text color="secondary">{sprint.goal}</Text>}
        </Flex>
      )}
      <Table
        columnConfig={issueColumnConfig}
        data={toIssueRows(value?.issues)}
        isPending={loading && !value}
        isStale={loading && !!value}
        pagination={{ type: 'none' }}
        rowConfig={{ onClick: row => onIssueClick(row.key) }}
        emptyState={<Text>The sprint has no issues.</Text>}
      />
    </Flex>
  );
};
