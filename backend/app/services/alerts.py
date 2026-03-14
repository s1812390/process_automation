import smtplib
from email.message import EmailMessage
import structlog
from app.config import settings

logger = structlog.get_logger()

STATUS_LABELS = {
    "failed": "Failed",
    "timeout": "Timed Out",
    "success": "Succeeded",
    "test": "Test",
}


def send_alert(
    channel: str,
    destination: str,
    script_name: str,
    run_id: int,
    status: str,
    tag: str | None = None,
):
    if channel == "email":
        _send_email(destination, script_name, run_id, status, tag)
    elif channel == "telegram":
        _send_telegram(destination, script_name, run_id, status, tag)
    else:
        logger.warning("Unknown alert channel", channel=channel)


def _build_email_body(script_name: str, run_id: int, status: str, tag: str | None) -> tuple[str, str]:
    """Returns (subject, body)."""
    status_label = STATUS_LABELS.get(status, status.upper())
    subject = f"[Scheduler] {script_name} — {status_label.upper()}"

    tag_line = f"Tag    : {tag}\n" if tag else ""
    run_line = f"Run ID : #{run_id}\n" if run_id else ""

    status_desc = {
        "failed": "failed with a non-zero exit code",
        "timeout": "was stopped because it exceeded the timeout limit",
        "success": "completed successfully",
        "test": "is sending a test alert (no actual run)",
    }.get(status, f"finished with status: {status}")

    body = (
        f"Script : {script_name}\n"
        f"{tag_line}"
        f"Status : {status_label.upper()}\n"
        f"{run_line}"
        f"\n"
        f"The script {status_desc}.\n"
    )
    return subject, body


def _send_email(to: str, script_name: str, run_id: int, status: str, tag: str | None):
    if not settings.smtp_host:
        logger.warning("SMTP not configured, skipping email alert")
        return

    subject, body = _build_email_body(script_name, run_id, status, tag)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as smtp:
            if settings.smtp_user:
                smtp.starttls()
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
        logger.info("Email alert sent", to=to, run_id=run_id)
    except Exception as e:
        logger.error("Email alert failed", error=str(e))
        raise


def _send_telegram(chat_id: str, script_name: str, run_id: int, status: str, tag: str | None):
    if not settings.telegram_bot_token:
        logger.warning("Telegram bot token not configured, skipping telegram alert")
        return

    import urllib.request
    import json

    status_label = STATUS_LABELS.get(status, status.upper())
    tag_line = f"Tag: {tag}\n" if tag else ""
    run_line = f"Run: #{run_id}" if run_id else "Run: test"

    text = (
        f"*[Scheduler]* {script_name}\n"
        f"{tag_line}"
        f"Status: *{status_label.upper()}*\n"
        f"{run_line}"
    )

    payload = json.dumps({
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "Markdown",
    }).encode()

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            logger.info("Telegram alert sent", chat_id=chat_id, run_id=run_id)
    except Exception as e:
        logger.error("Telegram alert failed", error=str(e))
        raise
