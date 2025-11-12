import { Link, Text } from "@react-email/components";

import { Template } from "../templates/btrix.js";
import {
  differenceInDays,
  formatDate,
  formatRelativeDate,
  formatRelativeDateToParts,
  offsetDays,
} from "../lib/date.js";
import { Warning } from "../components/warning.js";

import { z } from "zod";
import { trimTrailingSlash } from "../lib/url.js";


export const schema = z.object({
  user_name: z.string(),
  org_name: z.string(),
  paused_reason: z.enum(["paused_storage_quota_reached", "paused_time_quota_reached", "paused_org_readonly"]),
  paused_expiry: z.coerce.date(),
  workflow_url: z.url().transform(trimTrailingSlash),
  org_url: z.url().transform(trimTrailingSlash),
  support_email: z.email().optional(),
});

export type CrawlAutoPausedEmailProps = z.infer<typeof schema>;

export const CrawlAutoPausedEmail = ({
  user_name,
  org_name,
  paused_reason,
  paused_expiry,
  workflow_url,
  org_url,
  support_email
}: CrawlAutoPausedEmailProps) => {
  const date = formatDate(paused_expiry);
  const daysLeft = differenceInDays(new Date(paused_expiry));
  const relative = formatRelativeDate(daysLeft, "days");
  const relativeParts = formatRelativeDateToParts(daysLeft, "days");
  return (
    <Template
      preview={"Your Browsertrix crawl was automatically paused"}
      title={
        <>
          Your <strong className="text-stone-900">Browsertrix</strong> crawl
          has been automatically paused because your organization has{" "}
          {paused_reason === "paused_storage_quota_reached" ? (
            "reached its storage quota."
          ) : paused_reason === "paused_time_quota_reached" ? (
            "reached its execution time quota."
          ) : (
            "had archiving disabled."
          )}
        </>
      }
      disclaimer={
        <>
          If you were not expecting your organization to have crawling
          disabled, please contact us{" "}
          {support_email ? (
            <>
              at{" "}
              <Link
                className=" text-cyan-600"
                href={`mailto:${support_email}`}
                style={{ textDecoration: "underline" }}
              >
                {support_email}
              </Link>
              .
            </>
          ) : (
            "by replaying to this email."
          )}
        </>
      }
      linky={false}
    >
      <Text className="text-base text-stone-700">
        Hello {user_name}, we hope you’ve been enjoying Browsertrix so far!
      </Text>

      <Text className="text-base text-stone-700">
        This is a courtesy notice that{" "}
            <Link
              className="text-cyan-600 font-bold"
              href={`${workflow_url}`}
              style={{ textDecoration: "underline" }}
            >
              one of your crawls
            </Link> 
        {" "}in organization ”
        <strong className="text-stone-900">{org_name}</strong>” has been
        automatically paused because because your organization has{" "}
          {paused_reason === "paused_storage_quota_reached" ? (
            "reached its storage quota."
          ) : paused_reason === "paused_time_quota_reached" ? (
            "reached its execution time quota."
          ) : (
            "had archiving disabled."
          )}
      </Text>

      <Text className="text-base text-stone-700">
        The crawl will be stopped gracefully if it isn't resumed{" "}
        {relativeParts.map((part, index) =>
          part.value !== "in " ? (
            <strong key={part.value + index} className="text-stone-900">
              {part.value}
            </strong>
          ) : (
            part.value
          ),
        )}
        .
      </Text>

      {paused_reason === "paused_storage_quota_reached" ? (
        <>
          <Text className="text-base text-stone-700">
            In order to resume your crawl, you will need to free up storage
            space by either deleting archived items from your organization or
            upgrade your subscription to one with more storage space from your
            organization’s{" "}
            <Link
              className="text-cyan-600 font-bold"
              href={`${org_url}/settings/billing`}
              style={{ textDecoration: "underline" }}
            >
              billing settings
            </Link>
            .
          </Text>
        </>
      ) : paused_reason === "paused_time_quota_reached" ? (
        <Text className="text-base text-stone-700">
          In order to resume your crawl, you will need to either wait until your
          monthly execution time quota resets, upgrade your subscription to one
          with a higher monthly execution time quota, or purchase additional one-off
          execution minutes from your organization's{" "}
          <Link
            className="text-cyan-600 font-bold"
            href={`${org_url}/settings/billing`}
            style={{ textDecoration: "underline" }}
          >
            billing settings
          </Link>
          .
        </Text>
      ) : (
        <Text className="text-base text-stone-700">
          In order to resume your crawl, please reach out at{" "}
          <Link
            className="text-cyan-600"
            style={{ textDecoration: "underline" }}
            href={`mailto:${support_email}`}
          >
            {support_email}
          </Link>
          {" "}to inquire about re-enabling archiving in your organization.
        </Text>
      )}
    </Template>
  );
};

CrawlAutoPausedEmail.PreviewProps = {
  user_name: "Tessa",
  org_name: "Tessa’s Archives",
  paused_reason: "paused_storage_quota_reached",
  paused_expiry: offsetDays(7),
  workflow_url: "https://dev.browsertrix.com/orgs/default-org/workflows/d4a6cb18-eb54-4d25-a9e8-bb10a3eefa31/latest",
  org_url: "https://dev.browsertrix.com/orgs/default-org",
  support_email: "support@webrecorder.net",
} satisfies CrawlAutoPausedEmailProps;

export default CrawlAutoPausedEmail;

export const subject = () => "Your Browsertrix crawl was automatically paused";
