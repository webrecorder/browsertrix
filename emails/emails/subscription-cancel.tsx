import { Link, Text } from "@react-email/components";

import { Template } from "../templates/btrix.js";
import { formatDate, offsetDays } from "../lib/date.js";
import { Warning } from "../components/warning.js";
import { Card } from "../components/card.js";

import { z } from "zod";
import { trimTrailingSlash } from "../lib/url.js";

export const schema = z.object({
  user_name: z.string(),
  org_name: z.string(),
  org_url: z.string().transform(trimTrailingSlash),
  cancel_date: z.coerce.date(),
  survey_url: z.string().optional(),
  support_email: z.email().optional(),
});

export type SubscriptionCancelEmailProps = z.infer<typeof schema>;

export const SubscriptionCancelEmail = ({
  user_name,
  org_name,
  org_url,
  cancel_date,
  survey_url,
  support_email,
}: SubscriptionCancelEmailProps) => {
  const date = formatDate(cancel_date);
  return (
    <Template
      preview={"Your Browsertrix subscription is cancelling"}
      title={
        <>
          Your <strong className="text-stone-900">Browsertrix</strong>{" "}
          subscription will be
          <br /> cancelled on <strong className="text-stone-900">{date}</strong>
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
              </Link>{" "}
              immediately.
            </>
          ) : (
            "by replaying to this email."
          )}
        </>
      }
      linky={{
        version: "concerned",
        caption: (
          <>
            Linky is sad
            <br /> to see you go
          </>
        ),
      }}
    >
      <Text className="text-base text-stone-700">Hello {user_name},</Text>

      <Text className="text-base text-stone-700">
        The Browsertrix subscription for your organization “
        <strong className="text-stone-900">{org_name}</strong>” is scheduled to
        be cancelled at the end of this subscription period.
      </Text>

      <Warning>
        All data hosted on Browsertrix under the{" "}
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
        You can continue to use Browsertrix and download your data before this
        date. If you change your mind, you can resubscribe in your{" "}
        <Link
          className="text-cyan-600 font-bold"
          href={`${org_url}/settings/billing`}
          style={{ textDecoration: "underline" }}
        >
          billing settings
        </Link>{" "}
        at any time before <strong className="text-stone-900">{date}</strong>.
      </Text>

      <Text className="text-base text-stone-700">
        We’re sorry to see you go. We hope you enjoyed using Browsertrix!
      </Text>

      {survey_url && (
        <Card
          href={survey_url}
          title="Help Us Improve Browsertrix"
          linkText="Take the survey"
        >
          To help us make Browsertrix better, we would be very grateful if you
          could complete a quick survey about your experience.
        </Card>
      )}

      <Text className="mb-0 text-stone-700">
        If you’d like us to keep your data longer or have other questions, you
        can reach out at{" "}
        <Link
          className="text-cyan-600"
          style={{ textDecoration: "underline" }}
          href={`mailto:${support_email}`}
        >
          {support_email}
        </Link>
        .
      </Text>
    </Template>
  );
};

SubscriptionCancelEmail.PreviewProps = {
  user_name: "Emma",
  org_name: "Emma’s Archives",
  cancel_date: offsetDays(7),
  survey_url: "https://example.com/survey",
  org_url: "https://dev.browsertrix.com/orgs/default-org",
  support_email: "support@webrecorder.net",
} satisfies SubscriptionCancelEmailProps;

export default SubscriptionCancelEmail;

export const subject = ({ cancel_date }: SubscriptionCancelEmailProps) => {
  const date = formatDate(cancel_date);
  return `Your Browsertrix subscription will be cancelled on ${date}`;
};
