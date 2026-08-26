import { useCallback, useMemo, useState } from 'react';
import useAsyncRetry from 'react-use/esm/useAsyncRetry';
import { useApi } from '@backstage/frontend-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import {
  Button,
  Cell,
  CellText,
  Flex,
  Link,
  Select,
  Table,
  Text,
} from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import { jiraApiRef } from '../../api';
import { JiraFilterInfo, JiraIssue } from '../../types';

type IssueRow = JiraIssue & { id: string };

const columnConfig: readonly ColumnConfig<IssueRow>[] = [
  {
    id: 'key',
    label: 'Key',
    cell: issue => (
      <Cell>
        <Link href={issue.url} target="_blank" rel="noopener">
          {issue.key}
        </Link>
      </Cell>
    ),
  },
  {
    id: 'summary',
    label: 'Summary',
    cell: issue => <CellText title={issue.summary} />,
  },
  {
    id: 'type',
    label: 'Type',
    cell: issue => <CellText title={issue.type.name ?? '—'} />,
  },
  {
    id: 'status',
    label: 'Status',
    cell: issue => <CellText title={issue.status.name ?? '—'} />,
  },
  {
    id: 'priority',
    label: 'Priority',
    cell: issue => <CellText title={issue.priority.name ?? '—'} />,
  },
  {
    id: 'assignee',
    label: 'Assignee',
    cell: issue => (
      <CellText title={issue.assignee?.displayName ?? 'Unassigned'} />
    ),
  },
  {
    id: 'updated',
    label: 'Updated',
    cell: issue => (
      <CellText
        title={issue.updated ? new Date(issue.updated).toLocaleString() : '—'}
      />
    ),
  },
];

export const JiraContent = () => {
  const { entity } = useEntity();
  const jiraApi = useApi(jiraApiRef);
  const entityRef = stringifyEntityRef(entity);

  // undefined until the user picks one; the backend then applies its default.
  const [filterId, setFilterId] = useState<string | undefined>(undefined);
  // The last seen filter list, so the control stays rendered while reloading.
  const [filters, setFilters] = useState<JiraFilterInfo[]>([]);

  const { value, loading, error, retry } = useAsyncRetry(async () => {
    const response = await jiraApi.getIssues({ entityRef, filter: filterId });
    setFilters(response.filters);
    return response;
  }, [jiraApi, entityRef, filterId]);

  const selectedFilter =
    filterId ?? value?.appliedFilter ?? filters.find(f => f.default)?.id;

  const filterOptions = useMemo(
    () => filters.map(f => ({ id: f.id, label: f.name })),
    [filters],
  );

  const onFilterChange = useCallback((key: string | number | null) => {
    if (typeof key === 'string') {
      setFilterId(key);
    }
  }, []);

  const rows: IssueRow[] | undefined = value?.issues.map(issue => ({
    ...issue,
    id: issue.key,
  }));

  if (error && !loading) {
    return (
      <Flex direction="column" align="start" gap="4" p="4">
        <Text>Failed to load Jira issues: {error.message}</Text>
        <Button onPress={retry}>Retry</Button>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="4" p="4">
      {filterOptions.length > 0 && (
        <Flex align="center" gap="2" style={{ maxWidth: 320 }}>
          <Select
            name="jira-filter"
            label="Filter"
            options={filterOptions}
            selectedKey={selectedFilter ?? null}
            onSelectionChange={onFilterChange}
          />
        </Flex>
      )}
      <Table<IssueRow>
        columnConfig={columnConfig}
        data={rows}
        isPending={loading && !rows}
        isStale={loading && !!rows}
        pagination={{ type: 'none' }}
        emptyState={<Text>No issues match the current filter.</Text>}
      />
    </Flex>
  );
};
