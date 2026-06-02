import logging
import os
from logging.handlers import RotatingFileHandler

def setup_logging():
    """
    Sets up central logging configuration.
    Routes root logs to console and backend/logs/app.log,
    crawlers logs to backend/logs/crawlers.log, and
    ai pipeline logs to backend/logs/ai.log.
    """
    # Ensure logs directory exists relative to backend folder
    current_dir = os.path.dirname(os.path.abspath(__file__))
    logs_dir = os.path.join(current_dir, "logs")
    os.makedirs(logs_dir, exist_ok=True)

    # Logging format: 2026-05-25 09:30:00,000 [INFO] crawlers.agent (agent.py:63): [Agent] message
    log_format = "%(asctime)s [%(levelname)s] %(name)s (%(filename)s:%(lineno)d): %(message)s"
    formatter = logging.Formatter(log_format)

    # 1. Root Logger configuration
    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    
    # Avoid duplicate handlers if setup_logging is called multiple times
    if root_logger.hasHandlers():
        root_logger.handlers.clear()

    # Console Handler for container stdout logs
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)
    root_logger.addHandler(console_handler)

    # General app.log File Handler (rotating, max 5MB, keep 3 backups)
    app_log_path = os.path.join(logs_dir, "app.log")
    app_handler = RotatingFileHandler(
        app_log_path, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    app_handler.setFormatter(formatter)
    app_handler.setLevel(logging.INFO)
    root_logger.addHandler(app_handler)

    # 2. Crawlers Logger configuration
    crawler_logger = logging.getLogger("crawlers")
    crawler_logger.setLevel(logging.INFO)
    # Ensure crawler logs bubble up to console and app.log
    crawler_logger.propagate = True
    
    crawler_log_path = os.path.join(logs_dir, "crawlers.log")
    crawler_handler = RotatingFileHandler(
        crawler_log_path, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    crawler_handler.setFormatter(formatter)
    crawler_handler.setLevel(logging.INFO)
    # Avoid duplicate handlers for this logger specifically
    if crawler_logger.hasHandlers():
        crawler_logger.handlers.clear()
    crawler_logger.addHandler(crawler_handler)

    # 3. AI Logger configuration
    ai_logger = logging.getLogger("ai")
    ai_logger.setLevel(logging.INFO)
    # Ensure AI logs bubble up to console and app.log
    ai_logger.propagate = True
    
    ai_log_path = os.path.join(logs_dir, "ai.log")
    ai_handler = RotatingFileHandler(
        ai_log_path, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    ai_handler.setFormatter(formatter)
    ai_handler.setLevel(logging.INFO)
    # Avoid duplicate handlers for this logger specifically
    if ai_logger.hasHandlers():
        ai_logger.handlers.clear()
    ai_logger.addHandler(ai_handler)

    root_logger.info("Centralized logging system initialized: console, app.log, crawlers.log, ai.log configured.")
