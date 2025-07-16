"""Tests for the email sending functionality in emailsender.py & email templating microservice"""

import asyncio
import uuid
import os
from datetime import datetime
from typing import cast

import aiohttp
import pytest

from btrixcloud.emailsender import EmailSender
from btrixcloud.models import Organization, InvitePending, EmailStr, StorageRef

EMAILS_HOST_PREFIX = os.environ.get("EMAIL_TEMPLATE_ENDPOINT") or "http://127.0.0.1:30872"


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
async def test_send_user_validation(email_sender, capsys):
    """Test sending user validation email"""
    test_email = "newuser@example.com"
    test_token = "abc123def456"
    test_headers = {"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"}

    await email_sender.send_user_validation(
        receiver_email=test_email, token=test_token, headers=test_headers
    )

    # Check log output
    captured = capsys.readouterr()
    assert "Email: created" in captured.out
    assert "verifyEmail" in captured.out
    assert test_email in captured.out
    assert test_token in captured.out


@pytest.mark.asyncio
async def test_send_user_invite_new_user(
    email_sender, sample_invite, sample_org, capsys
):
    """Test sending user invite for new user"""
    test_token = uuid.uuid4()

    await email_sender.send_user_invite(
        invite=sample_invite,
        token=test_token,
        org_name=sample_org.name,
        is_new=True,
        headers={"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"},
    )

    # Check log output
    captured = capsys.readouterr()
    assert "Email: created" in captured.out
    assert "invite" in captured.out
    assert sample_invite.email in captured.out
    assert str(test_token) in captured.out


@pytest.mark.asyncio
async def test_send_user_invite_existing_user(
    email_sender, sample_invite, sample_org, capsys
):
    """Test sending user invite for existing user"""
    test_token = uuid.uuid4()

    await email_sender.send_user_invite(
        invite=sample_invite,
        token=test_token,
        org_name=sample_org.name,
        is_new=False,
        headers={"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"},
    )

    # Check log output
    captured = capsys.readouterr()
    assert "Email: created" in captured.out
    assert "invite" in captured.out
    assert sample_invite.email in captured.out
    assert str(test_token) in captured.out


@pytest.mark.asyncio
async def test_send_password_reset(email_sender, capsys):
    """Test sending password reset email"""
    test_email = "existinguser@example.com"
    test_token = uuid.uuid4()

    await email_sender.send_user_forgot_password(
        receiver_email=test_email,
        token=str(test_token),
        headers={"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"},
    )

    # Check log output
    captured = capsys.readouterr()
    assert "Email: created" in captured.out
    assert "passwordReset" in captured.out
    assert test_email in captured.out
    assert str(test_token) in captured.out


@pytest.mark.asyncio
async def test_send_background_job_failed(email_sender, sample_org, capsys):
    """Test sending background job failure notification"""
    # Create a mock job
    job = {
        "id": str(uuid.uuid4()),
        "type": "create_replica",
        "crawl_id": "test_crawl_123",
        "started": datetime.now().isoformat(),
    }
    finished = datetime.now()

    await email_sender.send_background_job_failed(
        job=job, finished=finished, receiver_email="admin@example.com", org=sample_org
    )

    # Check log output
    captured = capsys.readouterr()
    assert "Email: created" in captured.out
    assert "failedBgJob" in captured.out
    assert str(sample_org.id) in captured.out


@pytest.mark.asyncio
async def test_send_subscription_cancellation(email_sender, sample_org, capsys):
    """Test sending subscription cancellation notification"""
    cancel_date = datetime.now()

    await email_sender.send_subscription_will_be_canceled(
        cancel_date=cancel_date,
        user_name="Test User",
        receiver_email="admin@example.com",
        org=sample_org,
        headers={"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"},
    )

    # Check log output
    captured = capsys.readouterr()
    assert "Email: created" in captured.out
    assert "subscriptionCancel" in captured.out
    assert sample_org.name in captured.out
    assert "Test User" in captured.out


@pytest.mark.asyncio
async def test_email_sender_no_smtp_configured(monkeypatch, capsys):
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

    await sender.send_user_validation(
        receiver_email="test@example.com", token="test_token", headers=test_headers
    )

    captured = capsys.readouterr()
    assert "but not sent (no SMTP server set)" in captured.out


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
async def test_invite_with_superuser_flag(email_sender, sample_org, capsys):
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

    await email_sender.send_user_invite(
        invite=invite,
        token=uuid.uuid4(),
        org_name=sample_org.name,
        is_new=True,
        headers={"Host": "app.browsertrix.com", "X-Forwarded-Proto": "https"},
    )

    captured = capsys.readouterr()
    assert "Email: created" in captured.out
    assert "invite" in captured.out
