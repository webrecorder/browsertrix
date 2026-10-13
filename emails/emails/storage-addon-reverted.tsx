import { Link, Text } from "react-email";

import { Template } from "../templates/btrix.js";
import { Warning } from "../components/warning.js";

import { z } from "zod";
import { trimTrailingSlash } from "../lib/url.js";
import { formatNumber } from "../lib/number.js";

export const schema = z.object({
  user_name: z.string(),
  org_name: z.string(),
  items_url: z.string().transform(trimTrailingSlash),
  /** Storage in GB included in the organization's plan, not counting any add-on */
  plan_storage_gb: z.coerce.number(),
  /** Add-on size (GB) the attempted change would have set. Only used to word the subject line. */
  requested_gb: z.coerce.number(),
  /** Add-on size (GB) the organization still has */
  retained_gb: z.coerce.number(),
  /** Storage (GB) the organization is using right now, rounded up */
  used_gb: z.coerce.number(),
  support_email: z.email().optional(),
});

export type StorageAddonRevertedEmailProps = z.infer<typeof schema>;

export const StorageAddonRevertedEmail = ({
  user_name,
  org_name,
  items_url,
  plan_storage_gb,
  retained_gb,
  used_gb,
  support_email,
}: StorageAddonRevertedEmailProps) => {
  const planStorage = `${formatNumber(plan_storage_gb)} GB`;
  const retained = `${formatNumber(retained_gb)} GB`;
  const used = `${formatNumber(used_gb)} GB`;
  // The smallest add-on that still covers what the organization is using.
  // `used_gb` is rounded up and `plan_storage_gb` down, so this is never below
  // the real minimum -- a smaller add-on would be rejected again.
  const minimum_gb = Math.max(0, used_gb - plan_storage_gb);
  const minimum = `${formatNumber(Math.ceil(minimum_gb))} GB`;
  // If the add-on is already at or below that minimum the organization is over
  // its limit as things stand, so there is nothing smaller to suggest.
  const options =
    retained_gb > minimum_gb
      ? ` and try again, or reduce your add-on from ${retained} to ${minimum} at your next renewal.`
      : " to free up space.";

  return (
    <Template
      preview={"Your requested storage change wasn’t applied"}
      title={
        <>
          Your <strong className="text-stone-900">Browsertrix</strong> storage
          <br /> change wasn’t applied
        </>
      }
      disclaimer={
        <>
          If you were not expecting this change, please contact us{" "}
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
            "by replying to this email."
          )}
        </>
      }
      linky={{
        version: "concerned",
        caption: (
          <>
            Linky caught
            <br /> a storage mix-up
          </>
        ),
      }}
    >
      <Text className="text-base text-stone-700">Hello {user_name},</Text>

      <Text className="text-base text-stone-700">
        A storage change for your “
        <strong className="text-stone-900">{org_name}</strong>” organization was{" "}
        <strong className="text-stone-900">not applied</strong>.
      </Text>

      <Warning>
        Your plan includes {planStorage} of storage and your organization is
        using {used}, so your storage add-on needs to be at least{" "}
        <strong className="text-red-800">{minimum}</strong>.
      </Warning>

      <Text className="text-base text-stone-700">
        You can{" "}
        <Link
          className="text-cyan-600 font-bold"
          href={items_url}
          style={{ textDecoration: "underline" }}
        >
          delete archived items you no longer need
        </Link>
        {options}
      </Text>

      <Text className="mb-0 text-stone-700">
        If you have any questions, or if this change wasn’t made by you, you can
        reach out at{" "}
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

StorageAddonRevertedEmail.PreviewProps = {
  user_name: "Emma",
  org_name: "Emma’s Archives",
  items_url: "https://dev.browsertrix.com/orgs/default-org/items",
  plan_storage_gb: 500,
  requested_gb: 0,
  retained_gb: 300,
  used_gb: 637.288383,
  support_email: "support@webrecorder.net",
} satisfies StorageAddonRevertedEmailProps;

export default StorageAddonRevertedEmail;

export const subject = ({ requested_gb }: StorageAddonRevertedEmailProps) =>
  requested_gb > 0
    ? "Your Browsertrix storage change wasn’t applied"
    : "Your Browsertrix storage cancellation wasn’t applied";
