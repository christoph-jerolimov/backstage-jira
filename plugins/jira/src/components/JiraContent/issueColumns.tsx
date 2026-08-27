import { Cell, CellText, Link } from '@backstage/ui';
import type { ColumnConfig } from '@backstage/ui';
import { JiraIssue, SORT_FIELDS, SortField } from '../../types';

export type IssueRow = JiraIssue & { id: string };

const sortable = (id: string) =>
  SORT_FIELDS.includes(id as SortField) ? { isSortable: true } : {};

export const issueColumnConfig: readonly ColumnConfig<IssueRow>[] = [
  {
    id: 'key',
    label: 'Key',
    isRowHeader: true,
    ...sortable('key'),
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
    ...sortable('summary'),
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
    ...sortable('status'),
    cell: issue => <CellText title={issue.status.name ?? '—'} />,
  },
  {
    id: 'priority',
    label: 'Priority',
    ...sortable('priority'),
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
    ...sortable('updated'),
    cell: issue => (
      <CellText
        title={issue.updated ? new Date(issue.updated).toLocaleString() : '—'}
      />
    ),
  },
];

export function toIssueRows(issues: JiraIssue[] | undefined): IssueRow[] | undefined {
  return issues?.map(issue => ({ ...issue, id: issue.key }));
}
