"""
Email service — sends OTP verification emails via SMTP.
Reads credentials from environment variables (set in .env):

  EMAIL_HOST      e.g. smtp.gmail.com
  EMAIL_PORT      e.g. 587
  EMAIL_USER      your-email@gmail.com
  EMAIL_PASSWORD  your Gmail App Password (NOT your Google account password)
"""
from __future__ import annotations

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText

# Without a timeout, a blocked/slow SMTP host hangs the request forever and the
# browser eventually shows a bare "Failed to fetch". Cap it so the caller gets a
# real error instead.
SMTP_TIMEOUT_SECONDS = 15


def send_otp(
    to_email: str,
    otp: str,
    *,
    heading: str = "Verify your email",
    subtext: str = "Enter this code in QAIbridge to complete registration",
) -> None:
    """
    Send a 5-digit OTP to *to_email*. `heading` / `subtext` tailor the email to
    the action (registration, password reset, account deletion, ...).
    Raises ValueError if credentials are missing, or smtplib.SMTPException on send failure.
    """
    host     = os.getenv("EMAIL_HOST",     "smtp.gmail.com")
    port     = int(os.getenv("EMAIL_PORT", "587"))
    user     = os.getenv("EMAIL_USER",     "")
    password = os.getenv("EMAIL_PASSWORD", "")

    if not user or not password:
        raise ValueError(
            "EMAIL_USER and EMAIL_PASSWORD are not set. "
            "Please add them to your backend/.env file."
        )

    msg             = MIMEMultipart("alternative")
    msg["Subject"]  = f"QAIbridge — Your verification code is {otp}"
    msg["From"]     = f"QAIbridge <{user}>"
    msg["To"]       = to_email

    html = f"""<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0a0d14;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr>
      <td align="center">
        <table width="480" cellpadding="0" cellspacing="0"
               style="background:#111827;border-radius:16px;border:1px solid #1f2937;padding:40px;">
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <div style="display:inline-flex;align-items:center;justify-content:center;
                          width:48px;height:48px;border-radius:12px;
                          background:linear-gradient(135deg,#00ffcc,#00ccaa);">
                <span style="font-size:24px;color:#000;">&#9889;</span>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:800;">
                {heading}
              </h1>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="color:#9ca3af;font-size:14px;margin:0;">
                {subtext}
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <div style="background:#0a0d14;border:2px solid #00ffcc44;border-radius:12px;
                          padding:28px 48px;display:inline-block;">
                <span style="font-size:48px;font-weight:900;letter-spacing:16px;
                             color:#00ffcc;font-family:monospace;">{otp}</span>
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:16px;">
              <p style="color:#6b7280;font-size:13px;margin:0;">
                This code expires in <strong style="color:#9ca3af;">10 minutes</strong>.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center">
              <p style="color:#4b5563;font-size:12px;margin:0;">
                If you didn't request this, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(host, port, timeout=SMTP_TIMEOUT_SECONDS) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(user, password)
        server.sendmail(user, to_email, msg.as_string())
