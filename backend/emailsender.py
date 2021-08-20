""" Basic Email Sending Support"""

import os
import smtplib
import ssl


# pylint: disable=too-few-public-methods
class EmailSender:
    """SMTP Email Sender"""

    def __init__(self):
        self.sender = os.environ.get("EMAIL_SENDER")
        self.password = os.environ.get("EMAIL_PASSWORD")
        self.smtp_server = os.environ.get("EMAIL_SMTP_HOST")

        self.host = "http://localhost:8000/"

    def _send_encrypted(self, receiver, message):
        """Send Encrypted SMTP Message"""
        print(message)

        if not self.smtp_server:
            print("Email: No SMTP Server, not sending")
            return

        context = ssl.create_default_context()
        with smtplib.SMTP(self.smtp_server, 587) as server:
            server.ehlo()  # Can be omitted
            server.starttls(context=context)
            server.ehlo()  # Can be omitted
            server.login(self.sender, self.password)
            server.sendmail(self.sender, receiver, message)

    def send_user_validation(self, receiver_email, token):
        """Send email to validate registration email address"""
        message = f"""
Please verify your registration for Browsertrix Cloud for {receiver_email}

You can verify by clicking here: {self.host}/app/verify/{token}

The verification token is: {token}"""

        self._send_encrypted(receiver_email, message)

    def send_new_user_invite(self, receiver_email, sender, archive_name, token):
        """Send email to invite new user"""

        message = f"""
You are invited by {sender} to join their archive, {archive_name} on Browsertrix Cloud!

You can join by clicking here: {self.host}/app/join/{token}

The invite token is: {token}"""

        self._send_encrypted(receiver_email, message)
