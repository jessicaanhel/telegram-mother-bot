import os
from pathlib import Path

from core.settings import get_env

# Tokens
TELEGRAM_TOKEN = get_env("TELEGRAM_B2Bro_TOKEN")  # B2Bro bot
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Data files are not in git (bots/b2bro/data/ is ignored): copy them here
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)  # SQLite can't create the folder itself
DB_PATH = str(DATA_DIR / "speaker_sizes.db")
OFFER_FILE_PATH = str(DATA_DIR / "n_offer.xlsx")
