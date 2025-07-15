import { Link, Section, Text } from "@react-email/components";

import { Template } from "../templates/btrix.js";
import { Button } from "../components/button.js";

import { z } from "zod";

export const schema = z.object({
  origin: z.string().url(),
  token: z.string().uuid(),
  support_email: z.string().email().optional(),
});

export type PasswordResetEmailProps = z.infer<typeof schema>;

export const PasswordResetEmail = ({
  origin,
  token,
  support_email,
}: PasswordResetEmailProps) => {
  const resetURL = `${origin}/reset-password?token=${token}`;
  return (
    <Template
      preview={"Reset your Browsertrix password"}
      title={
        <>
          Reset your <strong className="text-stone-900">Browsertrix</strong>{" "}
          password
        </>
      }
      disclaimer={
        <>
          If you were not expecting a password reset, please contact us{" "}
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
      linky={false}
    >
      <Text className="text-base text-center text-stone-700">
        Either we received your password reset request, or you were locked out
        of your account and this request was sent automatically. Please follow
        the link below to reset your password:
      </Text>

      <Section className="mt-[32px] mb-[32px] text-center">
        <Button href={resetURL}>Reset Your Password</Button>
      </Section>
      <Text className="text-sm text-stone-600 text-center">
        or copy and paste this URL into your browser: <br />
        <Link
          href={resetURL}
          className="text-cyan-600"
          style={{ textDecoration: "none" }}
        >
          {resetURL}
        </Link>
      </Text>
    </Template>
  );
};

PasswordResetEmail.PreviewProps = {
  origin: "https://app.browsertrix.com",
  token: "1234567890",
  support_email: "support@webrecorder.net",
} satisfies PasswordResetEmailProps;

export default PasswordResetEmail;

export const subject = () => "Reset your Browsertrix password";
