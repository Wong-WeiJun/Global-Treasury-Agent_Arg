import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

import aiosmtplib
import httpx
import jwt
from jinja2 import Template
from jwt.exceptions import InvalidTokenError

from app.core import security
from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass
class EmailData:
    html_content: str
    subject: str


def render_email_template(*, template_name: str, context: dict[str, Any]) -> str:
    template_str = (
        Path(__file__).parent / "email-templates" / "build" / template_name
    ).read_text()
    html_content = Template(template_str).render(context)
    return html_content


def _html_to_plaintext(html: str) -> str:
    """Strip HTML tags to produce a plaintext fallback."""
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r" {2,}", " ", text).strip()


async def send_email(
    *,
    email_to: str,
    subject: str = "",
    html_content: str = "",
) -> None:
    """
    Send an email using the configured provider.

    Provider is chosen by EMAIL_PROVIDER setting:
      smtp   — any SMTP server; use smtp.gmail.com:587 + App Password for Gmail
      resend — Resend.com REST API

    Set EMAIL_DEV_MODE=true to log the email to stdout instead of sending it,
    which lets local dev work without any SMTP/API configuration.
    """
    if settings.EMAIL_DEV_MODE:
        logger.info(
            "[EMAIL DEV_MODE] to=%s subject=%r\n--- body (first 500 chars) ---\n%s",
            email_to,
            subject,
            _html_to_plaintext(html_content)[:500],
        )
        return

    if not settings.emails_enabled:
        logger.warning(
            "Email not configured (EMAIL_PROVIDER=%s) — skipping send to %s",
            settings.EMAIL_PROVIDER,
            email_to,
        )
        return

    if settings.EMAIL_PROVIDER == "resend":
        await _send_via_resend(email_to, subject, html_content)
    else:
        await _send_via_smtp(email_to, subject, html_content)


async def _send_via_smtp(email_to: str, subject: str, html_content: str) -> None:
    """
    Send via aiosmtplib.

    Works for Gmail (smtp.gmail.com:587, STARTTLS, App Password),
    any TLS/SSL SMTP server, and plain local SMTP (MailCatcher etc.).
    """
    plaintext = _html_to_plaintext(html_content)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>"
    msg["To"] = email_to
    msg.attach(MIMEText(plaintext, "plain", "utf-8"))
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    common = dict(
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER or None,
        password=settings.SMTP_PASSWORD or None,
    )

    if settings.SMTP_TLS:
        # STARTTLS — connect plain, upgrade in-band (Gmail port 587)
        await aiosmtplib.send(msg, **common, start_tls=True)
    elif settings.SMTP_SSL:
        # Implicit TLS — encrypted from the first byte (port 465)
        await aiosmtplib.send(msg, **common, use_tls=True)
    else:
        # Plain SMTP — local dev / MailCatcher
        await aiosmtplib.send(msg, hostname=settings.SMTP_HOST, port=settings.SMTP_PORT)

    logger.info("Email sent via SMTP to %s (subject=%r)", email_to, subject)


async def _send_via_resend(email_to: str, subject: str, html_content: str) -> None:
    """Send via the Resend REST API (httpx, already a project dependency)."""
    if not settings.RESEND_API_KEY:
        raise ValueError("RESEND_API_KEY is not set")

    plaintext = _html_to_plaintext(html_content)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {settings.RESEND_API_KEY.get_secret_value()}",
                "Content-Type": "application/json",
            },
            json={
                "from": f"{settings.EMAILS_FROM_NAME} <{settings.EMAILS_FROM_EMAIL}>",
                "to": [email_to],
                "subject": subject,
                "html": html_content,
                "text": plaintext,
            },
        )

    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Resend API error {resp.status_code}: {resp.text[:300]}")

    logger.info(
        "Email sent via Resend to %s (id=%s subject=%r)",
        email_to,
        resp.json().get("id"),
        subject,
    )


def generate_test_email(email_to: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Test email"
    html_content = render_email_template(
        template_name="test_email.html",
        context={"project_name": settings.PROJECT_NAME, "email": email_to},
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_reset_password_email(email_to: str, email: str, token: str) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - Password recovery for user {email}"
    link = f"{settings.FRONTEND_HOST}/reset-password?token={token}"
    html_content = render_email_template(
        template_name="reset_password.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": email,
            "email": email_to,
            "valid_hours": settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS,
            "link": link,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_new_account_email(
    email_to: str, username: str, password: str
) -> EmailData:
    project_name = settings.PROJECT_NAME
    subject = f"{project_name} - New account for user {username}"
    html_content = render_email_template(
        template_name="new_account.html",
        context={
            "project_name": settings.PROJECT_NAME,
            "username": username,
            "password": password,
            "email": email_to,
            "link": settings.FRONTEND_HOST,
        },
    )
    return EmailData(html_content=html_content, subject=subject)


def generate_password_reset_token(email: str) -> str:
    delta = timedelta(hours=settings.EMAIL_RESET_TOKEN_EXPIRE_HOURS)
    now = datetime.now(timezone.utc)
    expires = now + delta
    exp = expires.timestamp()
    encoded_jwt = jwt.encode(
        {"exp": exp, "nbf": now, "sub": email},
        settings.SECRET_KEY,
        algorithm=security.ALGORITHM,
    )
    return encoded_jwt


def verify_password_reset_token(token: str) -> str | None:
    try:
        decoded_token = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[security.ALGORITHM]
        )
        return str(decoded_token["sub"])
    except InvalidTokenError:
        return None
