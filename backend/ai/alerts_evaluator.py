import os
import re
import smtplib
import logging
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from sqlalchemy.orm import Session
from sqlalchemy import or_

import models
from database import SessionLocal

logger = logging.getLogger(__name__)

# --- Mock Price Database for PRICE Alerts ---
MOCK_BASE_PRICES = {
    "RELIANCE": 2450.0,
    "TCS": 3850.0,
    "INFY": 1420.0,
    "HDFCBANK": 1580.0,
    "WIPRO": 480.0,
    "SBIN": 750.0,
    "ICICIBANK": 1120.0,
}

def get_simulated_price(ticker: str) -> float:
    """Generate a deterministic simulated price with minor random walk based on minutes."""
    import random
    base = MOCK_BASE_PRICES.get(ticker.upper(), 1000.0)
    
    # Deterministic seed based on ticker + current day + hour to make it stable but changing
    now = datetime.utcnow()
    seed_str = f"{ticker.upper()}_{now.year}_{now.month}_{now.day}_{now.hour}"
    random.seed(seed_str)
    
    fluctuation = random.uniform(-0.015, 0.015) # -1.5% to +1.5%
    price = base * (1 + fluctuation)
    return round(price, 2)


# --- Alerts Evaluation Engine ---

def evaluate_alerts(db: Session):
    """
    Check all active alerts against the database and trigger notifications.
    This runs after the AI pipeline completes a crawl cycle.
    """
    logger.info("[Alerts Evaluator] Starting active alerts check...")
    
    active_alerts = db.query(models.Alert).filter(models.Alert.is_active == True).all()
    if not active_alerts:
        logger.info("[Alerts Evaluator] No active alerts found in the database.")
        return

    now_utc = datetime.utcnow()
    cooldown_hours = 6
    
    for alert in active_alerts:
        # Check cooldown to prevent duplicate notification spam
        if alert.last_triggered_at:
            time_since_trigger = now_utc - alert.last_triggered_at
            if time_since_trigger < timedelta(hours=cooldown_hours):
                continue
                
        user = db.query(models.User).filter(models.User.id == alert.user_id).first()
        user_email = user.email if user else "test-user@marketpulse.com"
        
        triggered = False
        details = ""
        news_list = []
        
        # 1. Evaluate News Alerts
        if alert.type.upper() == "NEWS":
            # Search recent articles mentioning the target ticker
            from crawlers.sources import NIFTY50_TICKERS
            conditions = []
            if alert.target == "*":
                conditions.append(models.News.id > 0)
            else:
                aliases = NIFTY50_TICKERS.get(alert.target.upper(), [alert.target])
                for alias in aliases:
                    conditions.append(models.News.headline.ilike(f"%{alias}%"))
            
            # Find news published since the last alert trigger (or last 6 hours if never triggered)
            since_time = alert.last_triggered_at or (now_utc - timedelta(hours=cooldown_hours))
            
            rows = (
                db.query(models.News)
                .filter(or_(*conditions))
                .filter(models.News.published_at >= since_time)
                .order_by(models.News.published_at.desc())
                .all()
            )
            
            if rows:
                triggered = True
                details = f"New breaking news headlines detected for target: {alert.target}."
                news_list = rows[:3] # include top 3 articles
                
        # 2. Evaluate Sentiment Alerts
        elif alert.type.upper() == "SENTIMENT":
            # Calculate average sentiment for target over the last 2 days
            from crawlers.sources import NIFTY50_TICKERS
            conditions = []
            if alert.target == "*":
                conditions.append(models.News.id > 0)
            else:
                aliases = NIFTY50_TICKERS.get(alert.target.upper(), [alert.target])
                for alias in aliases:
                    conditions.append(models.News.headline.ilike(f"%{alias}%"))
                    
            start_date = now_utc - timedelta(days=2)
            
            rows = (
                db.query(models.News, models.SentimentScore)
                .join(models.SentimentScore, models.SentimentScore.news_id == models.News.id)
                .filter(or_(*conditions))
                .filter(models.News.published_at >= start_date)
                .all()
            )
            
            if rows:
                total_pos = sum(r[1].positive for r in rows)
                total_neg = sum(r[1].negative for r in rows)
                count = len(rows)
                avg_pos = total_pos / count
                avg_neg = total_neg / count
                
                cond_clean = alert.condition.lower()
                if "bullish" in cond_clean or "positive" in cond_clean:
                    if avg_pos > 0.35 and avg_pos > avg_neg:
                        triggered = True
                        details = f"Average stock sentiment turned Bullish (Positive: {round(avg_pos*100)}%, Negative: {round(avg_neg*100)}%)."
                        news_list = [r[0] for r in rows[:3]]
                elif "bearish" in cond_clean or "negative" in cond_clean:
                    if avg_neg > 0.35 and avg_neg > avg_pos:
                        triggered = True
                        details = f"Average stock sentiment turned Bearish (Negative: {round(avg_neg*100)}%, Positive: {round(avg_pos*100)}%)."
                        news_list = [r[0] for r in rows[:3]]
                        
        # 3. Evaluate Price Alerts
        elif alert.type.upper() == "PRICE":
            if alert.target != "*":
                ticker = alert.target.upper()
                current_price = get_simulated_price(ticker)
                
                # Parse condition: e.g. "price > 1500" or "> 1500"
                match = re.search(r"([><=]+)\s*([\d,]+)", alert.condition)
                if match:
                    op = match.group(1)
                    val = float(match.group(2).replace(",", ""))
                    
                    is_met = False
                    if op == ">" and current_price > val:
                        is_met = True
                    elif op == "<" and current_price < val:
                        is_met = True
                    elif op == ">=" and current_price >= val:
                        is_met = True
                    elif op == "<=" and current_price <= val:
                        is_met = True
                    elif (op == "==" or op == "=") and current_price == val:
                        is_met = True
                        
                    if is_met:
                        triggered = True
                        details = f"Stock price reached ₹{current_price}, meeting your trigger condition '{alert.condition}'."
                        
                        # Find any recent news to include as context
                        from crawlers.sources import NIFTY50_TICKERS
                        aliases = NIFTY50_TICKERS.get(ticker, [ticker])
                        news_rows = (
                            db.query(models.News)
                            .filter(or_(*[models.News.headline.ilike(f"%{a}%") for a in aliases]))
                            .order_by(models.News.published_at.desc())
                            .limit(3)
                            .all()
                        )
                        news_list = news_rows

        if triggered:
            logger.info(f"[Alerts Evaluator] Triggered alert ID {alert.id} ({alert.type}) for User {user_email}")
            # Mark triggered
            alert.last_triggered_at = now_utc
            db.commit()
            
            # Send notification
            send_alert_email(user_email, alert, details, news_list)


# --- HTML Email Mailer ---

def send_alert_email(user_email: str, alert: models.Alert, details: str, news_list: list):
    """
    Format and send an alert notification email.
    Falls back to logging in files if SMTP settings are missing.
    """
    subject = f"Market Pulse AI Alert: {alert.target.upper()} - {alert.type.upper()}"
    
    # 1. Build premium HTML body
    news_html = ""
    if news_list:
        news_html += "<div style='margin-top: 20px; border-top: 1px solid #222; padding-top: 15px;'>"
        news_html += "<h3 style='color: #888; font-size: 13px; text-transform: uppercase; margin-bottom: 12px;'>Recent Catalyst References:</h3>"
        for item in news_list:
            news_html += f"""
            <div style='margin-bottom: 10px; padding: 10px; background-color: #1a1a1a; border: 1px solid #222; border-radius: 8px;'>
                <a href='{item.url}' target='_blank' style='color: #3b82f6; font-size: 13px; font-weight: bold; text-decoration: none; display: block; margin-bottom: 4px;'>
                    {item.headline}
                </a>
                <span style='color: #666; font-size: 10px;'>Published: {item.published_at.strftime('%b %d, %Y, %I:%M %p') if item.published_at else 'N/A'}</span>
            </div>
            """
        news_html += "</div>"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>{subject}</title>
    </head>
    <body style="background-color: #050505; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #111111; border: 1px solid #222222; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <!-- Header -->
            <tr>
                <td style="padding: 24px; border-b: 1px solid #222; background-color: #161616; text-align: center;">
                    <h1 style="margin: 0; color: #3b82f6; font-size: 20px; font-weight: bold; letter-spacing: -0.5px;">Market Pulse AI</h1>
                    <span style="color: #666; font-size: 11px;">Real-Time Stock Intelligence Alerts</span>
                </td>
            </tr>
            <!-- Content -->
            <tr>
                <td style="padding: 30px;">
                    <p style="margin: 0 0 15px 0; font-size: 14px; color: #888;">Hello,</p>
                    <p style="margin: 0 0 20px 0; font-size: 15px; leading-height: 1.5;">An alert condition you established on <strong>{alert.target.upper()}</strong> was triggered:</p>
                    
                    <!-- Alert Detail Callout Box -->
                    <div style="background-color: #1e1e1e; border-left: 4px solid #3b82f6; border-radius: 8px; padding: 18px; margin-bottom: 20px;">
                        <span style="color: #888; font-size: 10px; font-weight: bold; text-transform: uppercase; display: block; margin-bottom: 4px;">Trigger Details</span>
                        <p style="margin: 0; font-size: 14px; font-weight: bold; color: #ffffff; leading-height: 1.4;">
                            {details}
                        </p>
                    </div>
                    
                    <p style="margin: 0; font-size: 12px; color: #666;">Alert criteria: {alert.type.upper()} ({alert.condition})</p>
                    
                    {news_html}
                </td>
            </tr>
            <!-- Footer -->
            <tr>
                <td style="padding: 20px; background-color: #161616; border-top: 1px solid #222; text-align: center; color: #444; font-size: 11px;">
                    You are receiving this notification because you subscribed to alerts for {alert.target.upper()} on the Market Pulse AI Dashboard.<br>
                    <span style="display: block; margin-top: 8px;">&copy; {datetime.utcnow().year} Market Pulse AI. All rights reserved.</span>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    # 2. Get environment settings
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER = os.getenv("SMTP_USER", "")
    SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
    SMTP_FROM = os.getenv("SMTP_FROM", "marketpulse-alerts@marketpulse.com")

    # 3. Attempt SMTP delivery, fallback to file logging on omission/error
    email_delivered = False
    if SMTP_HOST and SMTP_USER and SMTP_PASSWORD:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = SMTP_FROM
            msg["To"] = user_email
            
            part = MIMEText(html_content, "html")
            msg.attach(part)
            
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USER, SMTP_PASSWORD)
                server.sendmail(SMTP_FROM, [user_email], msg.as_string())
                
            logger.info(f"[Alerts Evaluator] Email alert successfully sent via SMTP to {user_email}")
            email_delivered = True
        except Exception as e:
            logger.error(f"[Alerts Evaluator] SMTP error sending to {user_email}: {e}. Falling back to file logs.")
            
    if not email_delivered:
        # Fallback to local logs
        logs_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "logs")
        os.makedirs(logs_dir, exist_ok=True)
        log_file_path = os.path.join(logs_dir, "sent_emails.log")
        
        try:
            with open(log_file_path, "a", encoding="utf-8") as f:
                f.write(f"\n{'='*80}\n")
                f.write(f"TIMESTAMP: {datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S UTC')}\n")
                f.write(f"TO: {user_email}\n")
                f.write(f"SUBJECT: {subject}\n")
                f.write(f"DETAILS: {details}\n")
                f.write(f"HTML CONTENT:\n{html_content}\n")
                f.write(f"{'='*80}\n")
            logger.info(f"[Alerts Evaluator] Email alert logged to fallback file: {log_file_path}")
        except Exception as e:
            logger.error(f"[Alerts Evaluator] Failed to write fallback email log: {e}")
