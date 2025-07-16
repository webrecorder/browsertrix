"""Basic Email Sending Support"""

from datetime import datetime
import os
import smtplib
import ssl
from uuid import UUID
from typing import Optional, Union

from email.message import EmailMessage
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import aiohttp

from .models import CreateReplicaJob, DeleteReplicaJob, Organization, InvitePending
from .utils import is_bool, get_origin


# pylint: disable=too-few-public-methods, too-many-instance-attributes
class EmailSender:
    """SMTP Email Sender"""

    sender: str
    password: str
    reply_to: str
    smtp_server: Optional[str]
    smtp_port: int
    smtp_use_tls: bool
    support_email: str
    survey_url: str

    email_template_endpoint: str

    log_sent_emails: bool

    def __init__(self):
        self.sender = os.environ.get("EMAIL_SENDER") or "Browsertrix admin"
        self.password = os.environ.get("EMAIL_PASSWORD") or ""
        self.reply_to = os.environ.get("EMAIL_REPLY_TO") or self.sender
        self.support_email = os.environ.get("EMAIL_SUPPORT") or self.reply_to
        self.survey_url = os.environ.get("USER_SURVEY_URL") or ""
        self.smtp_server = os.environ.get("EMAIL_SMTP_HOST")
        self.smtp_port = int(os.environ.get("EMAIL_SMTP_PORT", 587))
        self.smtp_use_tls = is_bool(os.environ.get("EMAIL_SMTP_USE_TLS"))

        self.log_sent_emails = is_bool(os.environ.get("LOG_SENT_EMAILS"))

        self.email_template_endpoint = os.environ.get("EMAIL_TEMPLATE_ENDPOINT") or ""

    async def _send_encrypted(self, receiver: str, name: str, **kwargs) -> None:
        """Send Encrypted SMTP Message using given template name"""

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.email_template_endpoint + "/" + name,
                    json=kwargs,
                ) as resp:
                    if resp.status != 200:
                        raise Exception(
                            f"Failed to fetch email template: {resp.status}",
                            await resp.text(),
                        )

                    json = await resp.json()

                    html = json["html"]
                    text = json["plainText"]
                    subject = json["subject"]

                    if self.log_sent_emails:
                        print(text, flush=True)

                    if not self.smtp_server:
                        print(
                            f'Email: created "{name}" msg for "{receiver}", '
                            f"but not sent (no SMTP server set)",
                            flush=True,
                        )
                        return

                    msg: Union[EmailMessage, MIMEMultipart]

                    if html:
                        msg = MIMEMultipart("alternative")
                        msg.attach(MIMEText(text.strip(), "plain"))
                        msg.attach(MIMEText(html.strip(), "html"))
                    else:
                        msg = EmailMessage()
                        msg.set_content(text.strip())

                    msg["Subject"] = subject.strip()
                    msg["From"] = self.reply_to
                    msg["To"] = receiver
                    msg["Reply-To"] = msg["From"]

                    context = ssl.create_default_context()
                    with smtplib.SMTP(self.smtp_server, self.smtp_port) as server:
                        if self.smtp_use_tls:
                            server.ehlo()
                            server.starttls(context=context)
                        server.ehlo()
                        if self.password:
                            server.login(self.sender, self.password)
                        server.send_message(msg)
                        # server.sendmail(self.sender, receiver, message)
        # pylint: disable=broad-exception-caught
        except Exception as exc:
            print("Error fetching email template", exc)
            raise exc

    async def send_user_validation(
        self, receiver_email: str, token: str, headers: Optional[dict] = None
    ):
        """Send email to validate registration email address"""

        origin = get_origin(headers)

        await self._send_encrypted(
            receiver_email,
            "verifyEmail",
            origin=origin,
            token=token,
            receiver_email=receiver_email,
        )

    # pylint: disable=too-many-arguments
    async def send_user_invite(
        self,
        invite: InvitePending,
        token: UUID,
        org_name: str,
        is_new: bool,
        headers: Optional[dict] = None,
    ):
        """Send email to invite new user"""

        origin = get_origin(headers)

        receiver_email = invite.email or ""

        invite_url = (
            f"{origin}/join/{token}?email={receiver_email}"
            if is_new
            else f"{origin}/invite/accept/{token}?email={receiver_email}"
        )

        await self._send_encrypted(
            receiver_email,
            "invite",
            invite_url=invite_url,
            is_new=is_new,
            sender=invite.inviterEmail if not invite.fromSuperuser else "",
            org_name=org_name,
            support_email=self.support_email,
        )

    async def send_user_forgot_password(self, receiver_email, token, headers=None):
        """Send password reset email with token"""
        origin = get_origin(headers)

        await self._send_encrypted(
            receiver_email,
            "passwordReset",
            origin=origin,
            token=token,
            support_email=self.support_email,
        )

    async def send_background_job_failed(
        self,
        job: Union[CreateReplicaJob, DeleteReplicaJob],
        finished: datetime,
        receiver_email: str,
        org: Optional[Organization] = None,
    ):
        """Send background job failed email to superuser"""
        await self._send_encrypted(
            receiver_email,
            "failedBgJob",
            job=job,
            org=str(org.id) if org else None,
            finished=finished.isoformat(),
        )

    async def send_subscription_will_be_canceled(
        self,
        cancel_date: datetime,
        user_name: str,
        receiver_email: str,
        org: Organization,
        headers=None,
    ):
        """Send email indicating subscription is cancelled and all org data will be deleted"""

        origin = get_origin(headers)
        org_url = f"{origin}/orgs/{org.slug}/"

        await self._send_encrypted(
            receiver_email,
            "subscriptionCancel",
            org_url=org_url,
            user_name=user_name,
            org_name=org.name,
            cancel_date=cancel_date.isoformat(),
            support_email=self.support_email,
            survey_url=self.survey_url,
        )
