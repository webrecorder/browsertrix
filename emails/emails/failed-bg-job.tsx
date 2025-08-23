import z from "zod";
import { Template } from "../templates/btrix.js";
import { formatDateTime } from "../lib/date.js";
import { CodeInline } from "@react-email/components";

export const schema = z.object({
  org: z.string().optional(),
  job: z.object({
    id: z.string(),
    oid: z.string().optional(),
    type: z.string(),
    started: z.coerce.date(),
    object_type: z.string().optional(),
    object_id: z.string().optional(),
    file_path: z.string().optional(),
    replica_storage: z.string().optional(),
  }),
  finished: z.coerce.date(),
});

export type FailedBgJobEmailProps = z.infer<typeof schema>;

const DataRow = ({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) => (
  <tr>
    <td className="text-base font-semibold">{label}</td>
    <td className="text-base">{children}</td>
  </tr>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <CodeInline className="rounded-md text-stone-800 bg-stone-50 px-1 py-0.5 text-sm">
    {children}
  </CodeInline>
);

export const FailedBgJobEmail = ({
  org,
  job,
  finished,
}: FailedBgJobEmailProps) => {
  return (
    <Template
      title={
        <>
          Failed <strong>{job.type}</strong> background job
        </>
      }
      preview={`Failed background job: ${job.id}`}
      linky={{ version: "concerned", caption: false }}
    >
      <table align="center" width="100%">
        <DataRow label="Started At">{formatDateTime(job.started)}</DataRow>
        <DataRow label="Finished At">{formatDateTime(finished)}</DataRow>
        {org && (
          <DataRow label="Organization">
            <Code>{org}</Code>
          </DataRow>
        )}
        <DataRow label="Job ID">
          <Code>{job.id}</Code>
        </DataRow>
        <DataRow label="Job Type">
          <Code>{job.type}</Code>
        </DataRow>

        {job.object_type && (
          <DataRow label="Object Type">
            <Code>{job.object_type}</Code>
          </DataRow>
        )}
        {job.object_id && (
          <DataRow label="Object ID">
            <Code>{job.object_id}</Code>
          </DataRow>
        )}
        {job.file_path && (
          <DataRow label="File Path">
            <Code>{job.file_path}</Code>
          </DataRow>
        )}
        {job.replica_storage && (
          <DataRow label="Replica Storage">
            <Code>{job.replica_storage}</Code>
          </DataRow>
        )}
      </table>
    </Template>
  );
};

FailedBgJobEmail.PreviewProps = {
  org: "abc123",
  job: {
    id: "1234567890",
    oid: "1234567890",
    type: "type",
    started: new Date(),
    object_type: "object_type",
    object_id: "object_id",
    file_path: "file_path",
    replica_storage: "replica_storage",
  },
  finished: new Date(),
} satisfies FailedBgJobEmailProps;

export default FailedBgJobEmail;

export const subject = () => "Failed Browsertrix background job";
