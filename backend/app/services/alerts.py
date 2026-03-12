import smtplib
from email.message import EmailMessage
import structlog
from app.config import settings

logger = structlog.get_logger()


def send_alert(channel: str, destination: str, script_name: str, run_id: int, status: str):
    if channel == "email":
        _send_email(destination, script_name, run_id, status)
    elif channel == "telegram":
        _send_telegram(destination, script_name, run_id, status)
    else:
        logger.warning("Unknown alert channel", channel=channel)


def _send_email(to: str, script_name: str, run_id: int, status: str):
    if not settings.smtp_host:
        logger.warning("SMTP not configured, skipping email alert")
        return

    msg = EmailMessage()
    msg["Subject"] = f"[Scheduler] {script_name} — {status.upper()}"
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg.set_content(
        f"Script: {script_name}\n"
        f"Status: {status}\n"
        f"Run ID: {run_id}\n"
    )

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


def _send_telegram(chat_id: str, script_name: str, run_id: int, status: str):
    if not settings.telegram_bot_token:
        logger.warning("Telegram bot token not configured, skipping telegram alert")
        return

    import urllib.request
    import json

    text = (
        f"*[Scheduler]* {script_name}\n"
        f"Status: *{status.upper()}*\n"
        f"Run ID: `{run_id}`"
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
