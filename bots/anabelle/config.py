from datetime import time
from pathlib import Path
from zoneinfo import ZoneInfo

from core.settings import get_env

# Tokens
TELEGRAM_TOKEN = get_env("TELEGRAM_BOT_TOKEN")  # @AnabelleBot (Polar Peach)

GITHUB_TOKEN = get_env("GITHUB_TOKEN")

#External services
# Concerts: free key from developer.ticketmaster.com (Bandsintown only gives keys to partners)
TICKETMASTER_API_KEY = get_env("TICKETMASTER_API_KEY", "")

# Concerts: subscriptions and already-notified concerts (not in git)
DATA_DIR = Path(__file__).parent / "data"
CONCERTS_DB_PATH = str(DATA_DIR / "anabelle.db")
CONCERTS_DAILY_CHECK = time(10, 0, tzinfo=ZoneInfo("Europe/Amsterdam"))

# Bot whose webhook goes to MacroDroid on the tablet in Kyiv
NOTIFIER_BOT_USERNAME = "@roma_notiferbot"
