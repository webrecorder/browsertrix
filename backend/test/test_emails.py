"""Tests for the email sending functionality in emailsender.py & email templating microservice"""

import asyncio
import logging
import os
import uuid
from datetime import datetime
from typing import cast

import aiohttp
import pytest

from btrixcloud.emailsender import EmailSender
from btrixcloud.models import (
    CreateReplicaJob,
    EmailStr,
    InvitePending,
    Organization,
    StorageRef,
)
from btrixcloud.utils import dt_now

EMAILS_HOST_PREFIX = (
    os.environ.get("EMAIL_TEMPLATE_ENDPOINT") or "http://127.0.0.1:30872"
)


@pytest.fixture(scope="class")
def email_service_available():
    """Check if email service is available, skip tests if not"""
    endpoint = EMAILS_HOST_PREFIX
    if not endpoint:
        pytest.skip(
            "Email template service not configured - set EMAIL_TEMPLATE_ENDPOINT"
        )

    async def check_service():
        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=5)
            ) as session:
                health_url = endpoint.rstrip("/") + "/health"

                async with session.get(health_url) as resp:
                    return resp.status == 200
        except Exception:
            return False

    try:
        return asyncio.run(check_service())
    except Exception:
        return False


@pytest.fixture
def mock_env_vars(monkeypatch):
    """Set up mock environment variables for testing"""
    # Test with valid SMTP configuration
    monkeypatch.setenv("EMAIL_SENDER", "test@browsertrix.com")
    monkeypatch.setenv("EMAIL_PASSWORD", "testpassword")
    monkeypatch.setenv("EMAIL_REPLY_TO", "noreply@browsertrix.com")
    monkeypatch.setenv("EMAIL_SUPPORT", "support@browsertrix.com")
    monkeypatch.setenv("USER_SURVEY_URL", "https://survey.browsertrix.com")

    # Enable email logging but disable actual SMTP
    monkeypatch.setenv("LOG_SENT_EMAILS", "true")
    monkeypatch.setenv("EMAIL_SMTP_HOST", "")  # Skip SMTP for tests

    # Point to the test email template service
    monkeypatch.setenv(
        "EMAIL_TEMPLATE_ENDPOINT",
        f"{EMAILS_HOST_PREFIX}/api/emails",
    )


@pytest.fixture
def email_sender(mock_env_vars):
    """Create an EmailSender instance for testing"""
    return EmailSender()


@pytest.fixture
def sample_org():
    """Create a sample organization for testing"""
    return Organization(
        id=uuid.uuid4(),
        name="Test Organization",
        slug="test-org",
        storage=StorageRef(name="test-storage"),
    )


@pytest.fixture
def sample_invite():
    """Create a sample invite for testing"""
    return InvitePending(
        id=uuid.uuid4(),
        created=datetime.now(),
        tokenHash="hashed_token_example",
        inviterEmail=cast(EmailStr, "inviter@example.com"),
        fromSuperuser=False,
        email=cast(EmailStr, "test@example.com"),
    )


def test_email_sender_initialization(email_sender):
    """Test that EmailSender correctly initializes from environment variables"""
    assert email_sender.sender == "test@browsertrix.com"
    assert email_sender.password == "testpassword"
    assert email_sender.reply_to == "noreply@browsertrix.com"
    assert email_sender.support_email == "support@browsertrix.com"
    assert email_sender.survey_url == "https://survey.browsertrix.com"
    assert email_sender.log_sent_emails is True


@pytest.mark.asyncio
async def test_send_user_validation(email_sender, caplog):
    """Test sending user validation email"""
    test_email = "newuser@example.com"
    test_token = "abc123def456"
    test_headers = {"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"}

    caplog.set_level(logging.DEBUG)
    await email_sender.send_user_validation(
        receiver_email=test_email, token=test_token, headers=test_headers
    )

    # Check log output
    assert "email_created_not_sent_no_smtp" in caplog.text
    info_record = next(
        r for r in caplog.records if r.getMessage() == "email_created_not_sent_no_smtp"
    )
    assert info_record.template_name == "verifyEmail"
    assert info_record.receiver == test_email


@pytest.mark.asyncio
async def test_send_user_invite_new_user(
    email_sender, sample_invite, sample_org, caplog
):
    """Test sending user invite for new user"""
    test_token = uuid.uuid4()

    caplog.set_level(logging.DEBUG)
    await email_sender.send_user_invite(
        invite=sample_invite,
        token=test_token,
        org_name=sample_org.name,
        is_new=True,
        headers={"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"},
    )

    # Check log output
    assert "email_created_not_sent_no_smtp" in caplog.text
    info_record = next(
        r for r in caplog.records if r.getMessage() == "email_created_not_sent_no_smtp"
    )
    assert info_record.template_name == "invite"
    assert info_record.receiver == sample_invite.email


@pytest.mark.asyncio
async def test_send_user_invite_existing_user(
    email_sender, sample_invite, sample_org, caplog
):
    """Test sending user invite for existing user"""
    test_token = uuid.uuid4()

    caplog.set_level(logging.DEBUG)
    await email_sender.send_user_invite(
        invite=sample_invite,
        token=test_token,
        org_name=sample_org.name,
        is_new=False,
        headers={"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"},
    )

    # Check log output
    assert "email_created_not_sent_no_smtp" in caplog.text
    info_record = next(
        r for r in caplog.records if r.getMessage() == "email_created_not_sent_no_smtp"
    )
    assert info_record.template_name == "invite"
    assert info_record.receiver == sample_invite.email


@pytest.mark.asyncio
async def test_send_password_reset(email_sender, caplog):
    """Test sending password reset email"""
    test_email = "existinguser@example.com"
    test_token = uuid.uuid4()

    caplog.set_level(logging.DEBUG)
    await email_sender.send_user_forgot_password(
        receiver_email=test_email,
        token=str(test_token),
        headers={"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"},
    )

    # Check log output
    assert "email_created_not_sent_no_smtp" in caplog.text
    info_record = next(
        r for r in caplog.records if r.getMessage() == "email_created_not_sent_no_smtp"
    )
    assert info_record.template_name == "passwordReset"
    assert info_record.receiver == test_email


@pytest.mark.asyncio
async def test_send_background_job_failed(email_sender, sample_org, caplog):
    """Test sending background job failure notification"""
    job = CreateReplicaJob(
        id="fake-create-replica-job",
        oid=sample_org.id,
        success=False,
        started=dt_now(),
        file_path="path/to/file.wacz",
        object_type="crawl",
        object_id="sample-crawl-id",
        replica_storage=StorageRef(name="test-storage"),
    )

    caplog.set_level(logging.DEBUG)
    await email_sender.send_background_job_failed(
        job=job, finished=dt_now(), receiver_email="admin@example.com", org=sample_org
    )

    # Check log output
    assert "email_created_not_sent_no_smtp" in caplog.text
    info_record = next(
        r for r in caplog.records if r.getMessage() == "email_created_not_sent_no_smtp"
    )
    assert info_record.template_name == "failedBgJob"
    assert info_record.receiver == "admin@example.com"


@pytest.mark.asyncio
async def test_send_subscription_cancellation(email_sender, sample_org, caplog):
    """Test sending subscription cancellation notification"""
    cancel_date = datetime.now()

    caplog.set_level(logging.DEBUG)
    await email_sender.send_subscription_will_be_canceled(
        cancel_date=cancel_date,
        user_name="Test User",
        receiver_email="admin@example.com",
        org=sample_org,
        headers={"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"},
    )

    # Check log output
    assert "email_created_not_sent_no_smtp" in caplog.text
    info_record = next(
        r for r in caplog.records if r.getMessage() == "email_created_not_sent_no_smtp"
    )
    assert info_record.template_name == "subscriptionCancel"
    assert info_record.receiver == "admin@example.com"


@pytest.mark.asyncio
async def test_email_sender_no_smtp_configured(monkeypatch, caplog):
    """Test graceful handling when no SMTP server is configured"""
    # Mock environment with LOG_SENT_EMAILS set to True
    monkeypatch.setenv("LOG_SENT_EMAILS", "true")
    monkeypatch.setenv("EMAIL_SMTP_HOST", "")

    # Point to the test email template service
    monkeypatch.setenv(
        "EMAIL_TEMPLATE_ENDPOINT",
        f"{EMAILS_HOST_PREFIX}/api/emails",
    )

    test_headers = {"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"}

    sender = EmailSender()

    caplog.set_level(logging.DEBUG)
    await sender.send_user_validation(
        receiver_email="test@example.com", token="test_token", headers=test_headers
    )

    assert "email_created_not_sent_no_smtp" in caplog.text


@pytest.mark.asyncio
async def test_email_sender_error_handling(monkeypatch, email_sender):
    """Test error handling when template service is unavailable"""
    # Point to invalid template service
    monkeypatch.setattr(
        email_sender,
        "email_template_endpoint",
        "http://invalid-url-that-does-not-exist",
    )

    with pytest.raises(Exception):
        await email_sender.send_user_validation(
            receiver_email="test@example.com", token="test_token"
        )


@pytest.mark.asyncio
async def test_invite_with_superuser_flag(email_sender, sample_org, caplog):
    """Test invite sent from superuser"""
    # Create invite from superuser (should not show inviter email)
    invite = InvitePending(
        id=uuid.uuid4(),
        email=cast(EmailStr, "newuser@example.com"),
        inviterEmail=cast(EmailStr, "inviter@example.com"),
        fromSuperuser=True,
        created=datetime.utcnow(),
        tokenHash="test-hash",
    )

    caplog.set_level(logging.DEBUG)
    await email_sender.send_user_invite(
        invite=invite,
        token=uuid.uuid4(),
        org_name=sample_org.name,
        is_new=True,
        headers={"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"},
    )

    assert "email_created_not_sent_no_smtp" in caplog.text
    info_record = next(
        r for r in caplog.records if r.getMessage() == "email_created_not_sent_no_smtp"
    )
    assert info_record.template_name == "invite"
