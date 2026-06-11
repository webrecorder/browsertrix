"""Basic Email Sending Support"""

import os
import re
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Literal, Optional, Union
from uuid import UUID

import structlog
import aiohttp
from fastapi import HTTPException

from .models import (
    TYPE_AUTO_PAUSED_STATES,
    CreateReplicaJob,
    DeleteReplicaJob,
    InvitePending,
    Organization,
    Subscription,
)
from .utils import get_origin, is_bool, is_production

logger: structlog.stdlib.BoundLogger = structlog.get_logger(__name__)

# JWTs have three base64url parts separated by dots and always start with eyJ
_JWT_RE = re.compile(r"eyJ[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}\.[a-zA-Z0-9_-]{5,}")

# Invite URLs contain a UUID token after /join/ or /invite/accept/
_INVITE_UUID_RE = re.compile(
    r"(/join/|/invite/accept/)([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})",
    re.IGNORECASE,
)


def _redact_email_text(text: str) -> str:
    """Redact sensitive tokens from rendered email text before logging"""

    def _jwt_repl(match: "re.Match[str]") -> str:
        return "x" * len(match.group())

    def _uuid_repl(match: "re.Match[str]") -> str:
        return match.group(1) + "x" * len(match.group(2))

    text = _JWT_RE.sub(_jwt_repl, text)
    text = _INVITE_UUID_RE.sub(_uuid_repl, text)
    return text


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

        if self.smtp_server and self.log_sent_emails and is_production:
            logger.info(
                "email_logging_redaction",
                details="SMTP server is configured but LOG_SENT_EMAILS is enabled. Sensitive "
                "information such as invite tokens and password reset URLs will be redacted. "
                "Set `btrix_env` to 'development' to allow logging secrets as plain text.",
            )
        elif not self.smtp_server and self.log_sent_emails and is_production:
            logger.warning(
                "email_logging_redaction",
                details="SMTP server is not configured. Sensitive information such as invite  "
                "tokens and password reset URLs will be redacted. Set `btrix_env` to "
                "'development' to allow logging secrets as plain text.",
            )
        elif self.smtp_server and self.log_sent_emails and not is_production:
            logger.info(
                "email_logging_redaction",
                details="SMTP server is configured but LOG_SENT_EMAILS is enabled, and "
                "Browsertrix is not in production mode. Sensitive information such as "
                "invite tokens and password reset URLs will NOT be redacted in logs. "
                "Set `btrix_env` to 'production' to enable logging protections.",
            )
        elif not self.smtp_server and self.log_sent_emails and not is_production:
            logger.info(
                "email_logging_redaction",
                details="SMTP server is not configured, and Browsertrix is not in production "
                "mode. Sensitive information such as invite tokens and password reset "
                "URLs will NOT be redacted in logs. "
                "Set `btrix_env` to 'production' to enable logging protections.",
            )

        email_template_endpoint = os.environ.get("EMAIL_TEMPLATE_ENDPOINT")
        if not email_template_endpoint:
            raise ValueError(
                "Environment variable EMAIL_TEMPLATE_ENDPOINT is required but not set"
            )
        self.email_template_endpoint = email_template_endpoint

    async def _send_encrypted(self, receiver: str, name: str, **kwargs) -> None:
        """Send Encrypted SMTP Message using given template name"""

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.email_template_endpoint + "/" + name,
                    json=kwargs,
                ) as resp:
                    if resp.status != 200:
                        raise HTTPException(
                            status_code=resp.status,
                            detail=await resp.text(),
                        )

                    json = await resp.json()

                    html = json["html"]
                    text = json["plainText"]
                    subject = json["subject"]

                    if self.log_sent_emails:
                        if is_production:
                            log_text = _redact_email_text(text)
                        else:
                            log_text = text
                        logger.info(
                            "email_log",
                            email_text=log_text,
                        )

                    if not self.smtp_server:
                        logger.info(
                            "email_created_not_sent_no_smtp",
                            template_name=name,
                            receiver=receiver,
                            unstructured_message=f'Email: created "{name}" msg for "{receiver}", '
                            "but not sent (no SMTP server set)",
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
            logger.exception(
                "email_template_fetch_error",
                unstructured_message=f"Error fetching email template {exc}",
            )
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
        subscription: Optional[Subscription] = None,
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
            trial_end_date=(
                subscription.futureCancelDate.isoformat()
                if subscription and subscription.futureCancelDate
                else None
            ),
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
            job=job.model_dump(mode="json"),
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

    async def send_subscription_trial_ending_soon(
        self,
        trial_end_date: datetime,
        user_name: str,
        receiver_email: str,
        behavior_on_trial_end: Literal["cancel", "continue", "read-only"],
        org: Organization,
        headers=None,
    ):
        """Send email indicating subscription trial is ending soon"""

        origin = get_origin(headers)
        org_url = f"{origin}/orgs/{org.slug}/"

        await self._send_encrypted(
            receiver_email,
            "trialEndingSoon",
            user_name=user_name,
            org_name=org.name,
            org_url=org_url,
            trial_end_date=trial_end_date.isoformat(),
            behavior_on_trial_end=behavior_on_trial_end,
            support_email=self.support_email,
        )

    async def send_crawl_auto_paused(
        self,
        user_name: str,
        receiver_email: str,
        paused_reason: TYPE_AUTO_PAUSED_STATES,
        paused_expiry: datetime,
        cid: UUID,
        org: Organization,
        headers=None,
    ):
        """Send email indicating crawl was paused due to quota or disabled crawling"""

        origin = get_origin(headers)
        org_url = f"{origin}/orgs/{org.slug}"
        workflow_url = f"{org_url}/workflows/{cid}/latest"

        await self._send_encrypted(
            receiver_email,
            "crawlAutoPaused",
            org_name=org.name,
            user_name=user_name,
            paused_reason=paused_reason,
            paused_expiry=paused_expiry.isoformat(),
            org_url=org_url,
            workflow_url=workflow_url,
            support_email=self.support_email,
        )
