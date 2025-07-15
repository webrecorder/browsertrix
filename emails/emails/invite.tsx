import { Heading, Hr, Link, Section, Text } from "@react-email/components";

import { Template } from "../templates/btrix.js";
import {
  formatDate,
  formatRelativeDateToParts,
  offsetDays,
} from "../lib/date.js";
import { formatNumber } from "../lib/number.js";
import { Button } from "../components/button.js";
import { Card } from "../components/card.js";
import z from "zod";

export const schema = z.object({
  is_new: z.boolean().optional(),
  sender: z.string().optional(),
  org_name: z.string().optional(),
  invite_url: z.string().url(),
  support_email: z.string().email().optional(),
  validity_period_days: z.number().int().positive().optional(),
  trial_remaining_days: z.number().int().optional(),
});

export type InviteUserEmailProps = z.infer<typeof schema>;

export const InviteUserEmail = ({
  is_new,
  sender,
  org_name,
  invite_url,
  support_email,
  validity_period_days = 7,
  trial_remaining_days,
}: InviteUserEmailProps) => {
  const previewText = `Join ${org_name} on Browsertrix`;

  return (
    <Template
      preview={previewText}
      title={
        <>
          {sender || org_name ? (
            <>
              {" "}
              Join{" "}
              <strong className="text-stone-900">
                {sender || org_name}
              </strong>{" "}
              on
            </>
          ) : (
            "Get started with"
          )}{" "}
          <strong className="text-stone-900">Browsertrix</strong>
        </>
      }
      disclaimer="Not expecting this invitation? You can safely ignore it. If you
    have any questions or concerns, please reply to this email to get
    in touch with us."
    >
      <Text className="text-base text-center text-stone-700">
        Hello
        {is_new && (
          <>
            , and welcome to{" "}
            <strong className="text-stone-900">Browsertrix</strong>
          </>
        )}
        !
      </Text>
      {sender && org_name ? (
        <Text className="text-base text-center text-stone-700">
          <strong className="text-stone-900">{sender}</strong> has invited you
          to join the <strong className="text-stone-900">{org_name}</strong>{" "}
          organization.
        </Text>
      ) : org_name ? (
        <Text className="text-base text-center text-stone-700">
          You’ve been invited to join the{" "}
          <strong className="text-stone-900">{org_name}</strong> organization.
        </Text>
      ) : null}

      {is_new ? (
        <Text className="text-base text-center text-stone-700">
          We’re excited to have you. Let’s get you all set up.
        </Text>
      ) : null}

      <Section className="mt-[32px] mb-[32px] text-center">
        <Button href={invite_url}>
          {is_new ? "Create Your Account" : "Accept this Invitation"}
        </Button>
      </Section>
      <Text className="text-sm text-stone-600 text-center">
        or copy and paste this URL into your browser: <br />
        <Link
          href={invite_url}
          className="text-cyan-600"
          style={{ textDecoration: "underline" }}
        >
          {invite_url}
        </Link>
      </Text>
      <Text className="text-sm text-stone-600 text-center max-w-[360px] mx-auto">
        This link will expire in {formatNumber(validity_period_days)}{" "}
        {validity_period_days === 1 ? "day" : "days"} (
        {formatDate(offsetDays(validity_period_days))}). Please contact us{" "}
        {support_email ? (
          <>
            {" "}
            at{" "}
            <Link
              className="text-cyan-600"
              style={{ textDecoration: "underline" }}
              href={`mailto:${support_email}`}
            >
              {support_email}
            </Link>
          </>
        ) : (
          "by replying to this email"
        )}{" "}
        if you need more time.
      </Text>
      <Hr className="mx-0 my-[26px] w-full border border-stone-600/20 rounded border-solid" />
      <Heading as="h2">How does this work?</Heading>
      <Card
        href={invite_url}
        title={is_new ? "Create Your Account" : "Accept this Invitation"}
        linkText={
          is_new
            ? "Create your account and get started"
            : "Accept this invitation and get started"
        }
      >
        {is_new ? (
          <>
            Set up your account on{" "}
            <strong className="text-stone-900">Browsertrix</strong>. You'll pick
            a password
            {org_name ? (
              sender ? (
                org_name ? (
                  <>
                    {" "}
                    and join {sender}’s{" "}
                    <strong className="text-stone-900">{org_name}</strong>{" "}
                    organization.
                  </>
                ) : (
                  <>
                    {" "}
                    and join{" "}
                    <strong className="text-stone-900">{sender}</strong>
                    ’s organization.
                  </>
                )
              ) : (
                <>
                  {" "}
                  and join{" "}
                  <strong className="text-stone-900">{org_name}</strong>.
                </>
              )
            ) : (
              " and set up your new organization."
            )}
          </>
        ) : (
          <>
            {org_name ? (
              sender ? (
                <>
                  Accept ${sender}’s invitation to join the{" "}
                  <strong className="text-stone-900">{org_name}</strong>{" "}
                  organization
                </>
              ) : (
                <>
                  Accept the invitation to join the{" "}
                  <strong className="text-stone-900">{org_name}</strong>{" "}
                  organization
                </>
              )
            ) : (
              "Accept this invitation to set up this new organization"
            )}{" "}
            on <strong className="text-stone-900">Browsertrix</strong>.
          </>
        )}
      </Card>

      <Text className="text-stone-700">
        {is_new
          ? org_name
            ? "After your set up your account and org"
            : "After you set up your account"
          : "When you first access your account"}
        , you’ll be directed to your Dashboard. It contains information you may
        want to view frequently, including storage usage, crawling info, and
        collections.
      </Text>
      <Text className="text-stone-700">From there, you may want to...</Text>
      <Card
        href="https://docs.browsertrix.com/user-guide/"
        title="Review the Browsertrix User Guide"
        linkText={
          <>
            Read the <b className="font-semibold">User Guide</b>
          </>
        }
      >
        We’ve got a more detailed guide to help you get started, as well as
        in-depth tutorials and resources to help you get the most out of
        Browsertrix.
      </Card>
      <Card
        href="https://docs.browsertrix.com/user-guide/workflow-setup/"
        title="Crawl Your First Website"
        linkText={
          <>
            Create your first{" "}
            <strong className="font-semibold">Crawl Workflow</strong>
          </>
        }
      >
        Start your first crawl for a single page or a whole domain, or anything
        in between. Learn how to configure crawl settings to grab exactly what
        you need.
      </Card>
      <Card
        href="https://docs.browsertrix.com/user-guide/browser-profiles/"
        title="Set Up a Browser Profile"
        linkText={
          <>
            Crawl as a logged-in user with{" "}
            <strong className="font-semibold">Browser Profiles</strong>
          </>
        }
      >
        Browser Profiles allow you to customize the browser settings for your
        crawls, letting you save log-ins and get behind paywalls.
      </Card>
      {is_new && !sender ? (
        <Card
          href="https://docs.browsertrix.com/user-guide/org-settings/"
          title="Invite Additional Users"
          linkText="Learn how to invite users"
        >
          Add users to your organization to collaborate on crawling and
          curation.
        </Card>
      ) : null}
      <Card
        href="https://docs.browsertrix.com/user-guide/org-settings/#billing"
        title="Manage Your Billing and Plan"
        linkText={
          <>
            View <strong className="font-semibold">Billing Details</strong>
          </>
        }
      >
        View and update your plan, billing information, payment methods, and
        usage history.{" "}
        {trial_remaining_days && (
          <>
            Your trial ends{" "}
            {formatRelativeDateToParts(trial_remaining_days, "days").map(
              (part, index) =>
                part.value !== "in " ? (
                  <strong key={part.value + index}>{part.value}</strong>
                ) : (
                  part.value
                ),
            )}
            , so you may want to double check your billing information and
            payment methods before the trial ends.
          </>
        )}
      </Card>
      <Card
        href="https://docs.browsertrix.com/user-guide/archived-items/#exporting-files"
        title="Export Archived Items"
        linkText={
          <>
            Download your{" "}
            <strong className="font-semibold">Archived Items</strong>
          </>
        }
      >
        Browsertrix stores crawled data in a secure and scalable manner using
        the standardized <abbr title="Web Archive Collection Zipped">WACZ</abbr>{" "}
        format. At any time you can export your archived items for use
        elsewhere.
      </Card>

      <Text className="text-stone-700">
        If you need any assistance, please direct your questions to the{" "}
        <Link
          href="https://github.com/webrecorder/browsertrix"
          className="text-cyan-600"
          style={{ textDecoration: "underline" }}
        >
          Browsertrix GitHub repo
        </Link>{" "}
        or the{" "}
        <Link
          href="https://forum.webrecorder.net"
          className="text-cyan-600"
          style={{ textDecoration: "underline" }}
        >
          Webrecorder Community Forum
        </Link>
        .
      </Text>

      {support_email && (
        <Text className="text-stone-700">
          If you’re having trouble accessing the service, or if dedicated
          support is included in your plan, you can also contact us at{" "}
          <Link
            className=" text-cyan-600"
            href={`mailto:${support_email}`}
            style={{ textDecoration: "underline" }}
          >
            {support_email}
          </Link>
          .
        </Text>
      )}
    </Template>
  );
};

InviteUserEmail.PreviewProps = {
  is_new: true,
  // sender: "Emma",
  // org_name: "Emma’s Test Org",
  invite_url: "https://app.browsertrix.com/invite-url-123-demo",
  support_email: "support@webrecorder.net",
  validity_period_days: 7,
  trial_remaining_days: 7,
} satisfies InviteUserEmailProps;

export default InviteUserEmail;

export const subject = ({
  trial_remaining_days,
  org_name,
  sender,
}: InviteUserEmailProps) => {
  if (trial_remaining_days != null) {
    return "Start your Browsertrix trial";
  }
  return sender || org_name
    ? `Join ${sender || org_name} on Browsertrix`
    : `Get started with Browsertrix`;
};
