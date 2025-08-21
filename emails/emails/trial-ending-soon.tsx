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
  org_url: z.url().transform(trimTrailingSlash),
  trial_end_date: z.coerce.date(),
  behavior_on_trial_end: z.enum(["cancel", "continue"]).optional(),
  support_email: z.email().optional(),
});

export type TrialEndingSoonEmailProps = z.infer<typeof schema>;

export const TrialEndingSoonEmail = ({
  user_name,
  org_name,
  org_url,
  trial_end_date,
  behavior_on_trial_end = "continue",
  support_email,
}: TrialEndingSoonEmailProps) => {
  const date = formatDate(trial_end_date);
  const daysLeft = differenceInDays(new Date(trial_end_date));
  const relative = formatRelativeDate(daysLeft, "days");
  const relativeParts = formatRelativeDateToParts(daysLeft, "days");
  return (
    <Template
      preview={`Your Browsertrix trial ends ${relative}`}
      title={
        <>
          Your <strong className="text-stone-900">Browsertrix</strong> trial
          ends{" "}
          {relativeParts.map((part, index) =>
            part.value !== "in " ? (
              <strong key={part.value + index}>{part.value}</strong>
            ) : (
              part.value
            ),
          )}
        </>
      }
      disclaimer={
        <>
          If you were not expecting this email, please contact us{" "}
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
      linky={{
        version: "hello",
        caption: (
          <>
            Linky hopes you’ll
            <br /> stick around!
          </>
        ),
      }}
    >
      <Text className="text-base text-stone-700">
        Hello {user_name}, we hope you’ve been enjoying Browsertrix so far!
      </Text>

      <Text className="text-base text-stone-700">
        The trial for your organization “
        <strong className="text-stone-900">{org_name}</strong>” ends{" "}
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

      {behavior_on_trial_end === "cancel" ? (
        <>
          <Text className="text-base text-stone-700">
            If you’d like to continue using Browsertrix, you can continue your
            subscription at any time before the trial ends from your
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
          <Warning>
            If you opt to end your trial without continuing, all data hosted on
            Browsertrix under the{" "}
            <Link
              className="text-red-800 font-bold"
              href={org_url}
              style={{ textDecoration: "underline" }}
            >
              {org_name}
            </Link>{" "}
            organization will be deleted on{" "}
            <strong className="text-red-800">{date}</strong>.
          </Warning>
          <Text className="text-base text-stone-700">
            You can continue to use Browsertrix and download your data before
            this date. If you change your mind, you can resubscribe in your
            organization’s{" "}
            <Link
              className="text-cyan-600 font-bold"
              href={`${org_url}/settings/billing`}
              style={{ textDecoration: "underline" }}
            >
              billing settings
            </Link>{" "}
            at any time before{" "}
            <strong className="text-stone-900">{date}</strong>.
          </Text>
        </>
      ) : (
        <Text className="text-base text-stone-700">
          Your payment method on file will be charged for the next billing cycle
          on <strong className="text-stone-900">{date}</strong>. If you don't
          want to be charged, you can cancel your subscription in your{" "}
          <Link
            className="text-cyan-600 font-bold"
            href={`${org_url}/settings/billing`}
            style={{ textDecoration: "underline" }}
          >
            billing settings
          </Link>{" "}
          at any time before then.
        </Text>
      )}

      {support_email && (
        <Text className="mb-0 text-stone-700">
          If you have any questions or concerns, please don’t hesitate to reach
          out at{" "}
          <Link
            className="text-cyan-600"
            style={{ textDecoration: "underline" }}
            href={`mailto:${support_email}`}
          >
            {support_email}
          </Link>
          .
        </Text>
      )}
    </Template>
  );
};

TrialEndingSoonEmail.PreviewProps = {
  user_name: "Emma",
  org_name: "Emma’s Archives",
  trial_end_date: offsetDays(7),
  org_url: "https://dev.browsertrix.com/orgs/default-org",
  behavior_on_trial_end: "cancel",
  support_email: "support@webrecorder.net",
} satisfies TrialEndingSoonEmailProps;

export default TrialEndingSoonEmail;

export const subject = ({ trial_end_date }: TrialEndingSoonEmailProps) => {
  const date = formatDate(trial_end_date);
  const daysLeft = differenceInDays(new Date(trial_end_date));
  const relative = formatRelativeDate(daysLeft, "days");
  return `Your Browsertrix trial ends ${relative}`;
};
