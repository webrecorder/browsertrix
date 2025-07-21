import { Link, Section, Text } from "@react-email/components";

import { Template } from "../templates/btrix.js";
import { Button } from "../components/button.js";

import { z } from "zod";

export const schema = z.object({
  receiver_email: z.email(),
  origin: z.url(),
  token: z.string(),
  support_email: z.email().optional(),
});

export type VerifyEmailProps = z.infer<typeof schema>;

export const VerifyEmail = ({
  receiver_email,
  origin,
  token,
  support_email,
}: VerifyEmailProps) => {
  const verifyURL = `${origin}/verify?token=${token}`;
  return (
    <Template
      preview={"Verify your Browsertrix account"}
      title={
        <>
          Verify your <strong className="text-stone-900">Browsertrix</strong>{" "}
          account
        </>
      }
      disclaimer={
        <>
          Not your email address? Please contact us{" "}
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
        version: "happy",
        caption: (
          <>
            Linky is glad to
            <br /> know you’re you!
          </>
        ),
      }}
    >
      <Text className="text-base text-center text-stone-700">
        Hello! We need to verify your Browsertrix registration for{" "}
        <strong className="text-stone-900">{receiver_email}</strong>. Please
        follow the link below:
      </Text>

      <Section className="mt-[32px] mb-[32px] text-center">
        <Button href={verifyURL}>Verify Your Email</Button>
      </Section>
      <Text className="text-sm text-stone-600 text-center">
        or copy and paste this URL into your browser: <br />
        <Link
          href={verifyURL}
          className="text-cyan-600"
          style={{ textDecoration: "none" }}
        >
          {verifyURL}
        </Link>
      </Text>
    </Template>
  );
};

VerifyEmail.PreviewProps = {
  receiver_email: "user@example.com",
  origin: "https://app.browsertrix.com",
  token: "1234567890",
  support_email: "support@webrecorder.net",
} satisfies VerifyEmailProps;

export default VerifyEmail;

export const subject = () => "Verify your Browsertrix account";
