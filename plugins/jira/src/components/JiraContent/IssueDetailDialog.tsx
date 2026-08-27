import useAsync from 'react-use/esm/useAsync';
import { useApi } from '@backstage/frontend-plugin-api';
import {
  Dialog,
  DialogBody,
  DialogHeader,
  Flex,
  Link,
  Skeleton,
  Tag,
  TagGroup,
  Text,
} from '@backstage/ui';
import { jiraApiRef } from '../../api';

const preWrap: React.CSSProperties = { whiteSpace: 'pre-wrap' };

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <Flex direction="column" gap="1">
      <Text color="secondary" variant="body-small">
        {label}
      </Text>
      <Text>{value ?? '—'}</Text>
    </Flex>
  );
}

/**
 * In-page detail view of a single issue. Description and comments are raw
 * Jira text rendered literally inside text nodes - never as markup.
 */
export const IssueDetailDialog = (props: {
  entityRef: string;
  issueKey: string | undefined;
  onClose: () => void;
}) => {
  const { entityRef, issueKey, onClose } = props;
  const jiraApi = useApi(jiraApiRef);

  const { value, loading, error } = useAsync(async () => {
    if (!issueKey) {
      return undefined;
    }
    return jiraApi.getIssueDetail({ entityRef, issueKey });
  }, [jiraApi, entityRef, issueKey]);

  return (
    <Dialog
      isOpen={issueKey !== undefined}
      onOpenChange={open => {
        if (!open) {
          onClose();
        }
      }}
      isDismissable
      width={640}
    >
      <DialogHeader>{issueKey ?? ''}</DialogHeader>
      <DialogBody>
        {loading && <Skeleton height={160} />}
        {!loading && error && (
          <Text>Failed to load issue details: {error.message}</Text>
        )}
        {!loading && !error && value && (
          <Flex direction="column" gap="4">
            <Text variant="title-small" weight="bold">
              {value.summary}
            </Text>
            <Flex gap="6" style={{ flexWrap: 'wrap' }}>
              <Field label="Type" value={value.type.name} />
              <Field label="Status" value={value.status.name} />
              <Field label="Priority" value={value.priority.name} />
              <Field label="Reporter" value={value.reporter?.displayName} />
              <Field
                label="Assignee"
                value={value.assignee?.displayName ?? 'Unassigned'}
              />
              <Field
                label="Updated"
                value={
                  value.updated
                    ? new Date(value.updated).toLocaleString()
                    : undefined
                }
              />
            </Flex>
            {value.labels.length > 0 && (
              <TagGroup aria-label="Labels">
                {value.labels.map(label => (
                  <Tag key={label} id={label}>
                    {label}
                  </Tag>
                ))}
              </TagGroup>
            )}
            <Flex direction="column" gap="1">
              <Text color="secondary" variant="body-small">
                Description
              </Text>
              <Text as="p" style={preWrap}>
                {value.description || '—'}
              </Text>
            </Flex>
            <Flex direction="column" gap="2">
              <Text color="secondary" variant="body-small">
                {value.commentTotal > value.comments.length
                  ? `Comments (${value.comments.length} of ${value.commentTotal})`
                  : `Comments (${value.commentTotal})`}
              </Text>
              {value.comments.length === 0 && <Text>No comments.</Text>}
              {value.comments.map((comment, index) => (
                <Flex key={index} direction="column" gap="1">
                  <Text variant="body-small" weight="bold">
                    {comment.author ?? 'Unknown'}
                    {comment.created
                      ? ` · ${new Date(comment.created).toLocaleString()}`
                      : ''}
                  </Text>
                  <Text as="p" style={preWrap}>
                    {comment.body}
                  </Text>
                </Flex>
              ))}
            </Flex>
            <Link href={value.url} target="_blank" rel="noopener">
              Open in Jira
            </Link>
          </Flex>
        )}
      </DialogBody>
    </Dialog>
  );
};
