from telegram import BotCommand, InlineKeyboardButton

from core.app_manager import AppManager
from bots.anabelle.config import TELEGRAM_TOKEN
from bots.anabelle.commands.silpo.silpo_handler import SILPO_MENU_CALLBACK, get_silpo_handlers
from bots.releases import feature_enabled

# Concerts work locally; in the cloud only once released (bots/releases.py)
CONCERTS_ENABLED = feature_enabled("anabelle.concerts")


class AnabelleApp(AppManager):
    name = "Anabelle Bot"
    commands = [
        BotCommand("start", "Головне меню"),
        BotCommand("silpo", "Час приїзду кур'єра Сільпо"),
    ] + ([BotCommand("concerts", "Концерти улюблених артистів")] if CONCERTS_ENABLED else [])

    def greeting(self, update):
        return f"Привіт, {update.effective_user.first_name}! Що зробимо?"

    def menu_buttons(self):
        # One row per feature; add new features here
        rows = [
            [InlineKeyboardButton("🛒 Кур'єр Сільпо", callback_data=SILPO_MENU_CALLBACK)],
        ]
        if CONCERTS_ENABLED:
            from bots.anabelle.commands.concert_ai_agent.concert_handler import CONCERTS_MENU_CALLBACK
            rows.append([InlineKeyboardButton("🎤 Концерти", callback_data=CONCERTS_MENU_CALLBACK)])
        return rows

    def register_features(self):
        self.bot.add_handler(self.start_handler())
        for handler in get_silpo_handlers():
            self.bot.add_handler(handler)

        if CONCERTS_ENABLED:
            # Imported only when enabled, so the cloud never opens the concerts database
            from bots.anabelle.commands.concert_ai_agent.concert_handler import get_concert_handlers
            from bots.anabelle.commands.concert_ai_agent.concert_scheduler import schedule_daily_check
            for handler in get_concert_handlers():
                self.bot.add_handler(handler)
            schedule_daily_check(self.bot.application)


def create_app() -> AnabelleApp:
    return AnabelleApp(TELEGRAM_TOKEN)
