""" Basic Email Sending Support"""

import os
import smtplib
import ssl

from email.message import EmailMessage


# pylint: disable=too-few-public-methods
class EmailSender:
    """SMTP Email Sender"""

    def __init__(self):
        self.sender = os.environ.get("EMAIL_SENDER")
        self.password = os.environ.get("EMAIL_PASSWORD")
        self.reply_to = os.environ.get("EMAIL_REPLY_TO") or self.sender
        self.smtp_server = os.environ.get("EMAIL_SMTP_HOST")

        self.default_origin = os.environ.get("APP_ORIGIN")

    def _send_encrypted(self, receiver, subject, message):
        """Send Encrypted SMTP Message"""
        print(message, flush=True)

        if not self.smtp_server:
            print("Email: No SMTP Server, not sending", flush=True)
            return

        msg = EmailMessage()
        msg["Subject"] = subject
        msg["From"] = self.reply_to
        msg["To"] = receiver
        msg["Reply-To"] = msg["From"]
        msg.set_content(message)

        context = ssl.create_default_context()
        with smtplib.SMTP(self.smtp_server, 587) as server:
            server.ehlo()  # Can be omitted
            server.starttls(context=context)
            server.ehlo()  # Can be omitted
            server.login(self.sender, self.password)
            server.send_message(msg)
            # server.sendmail(self.sender, receiver, message)

    def get_origin(self, headers):
        """Return origin of the received request"""
        if not headers:
            return self.default_origin

        scheme = headers.get("X-Forwarded-Proto")
        host = headers.get("Host")
        if not scheme or not host:
            return self.default_origin

        return scheme + "://" + host

    def send_user_validation(self, receiver_email, token, headers=None):
        """Send email to validate registration email address"""

        origin = self.get_origin(headers)

        message = f"""
Please verify your registration for Browsertrix Cloud for {receiver_email}

You can verify by clicking here: {origin}/verify?token={token}

The verification token is: {token}"""

        self._send_encrypted(
            receiver_email,
            "Welcome to Browsertrix Cloud, Verify your Registration",
            message,
        )

    # pylint: disable=too-many-arguments
    def send_new_user_invite(
        self, receiver_email, sender, org_name, token, headers=None
    ):
        """Send email to invite new user"""

        origin = self.get_origin(headers)

        message = f"""
You are invited by {sender} to join their organization, "{org_name}" on Browsertrix Cloud!

You can join by clicking here: {origin}/join/{token}?email={receiver_email}

The invite token is: {token}"""

        self._send_encrypted(
            receiver_email,
            f'You\'ve been invited to join "{org_name}" on Browsertrix Cloud',
            message,
        )

    # pylint: disable=too-many-arguments
    def send_existing_user_invite(
        self, receiver_email, sender, org_name, token, headers=None
    ):
        """Send email to invite new user"""
        origin = self.get_origin(headers)

        message = f"""
You are invited by {sender} to join their organization, "{org_name}" on Browsertrix Cloud!

You can join by clicking here: {origin}/invite/accept/{token}?email={receiver_email}

The invite token is: {token}"""

        self._send_encrypted(
            receiver_email,
            f'You\'ve been invited to join "{org_name}" on Browsertrix Cloud',
            message,
        )

    def send_user_forgot_password(self, receiver_email, token, headers=None):
        """Send password reset email with token"""
        origin = self.get_origin(headers)

        message = f"""
We received your password reset request. Please click here: {origin}/reset-password?token={token}
to create a new password
        """

        self._send_encrypted(receiver_email, "Password Reset", message)
