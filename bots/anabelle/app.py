from telegram import BotCommand, InlineKeyboardButton

from core.app_manager import AppManager
from bots.anabelle.config import TELEGRAM_TOKEN
from bots.anabelle.commands.silpo.silpo_handler import SILPO_MENU_CALLBACK, get_silpo_handlers


class AnabelleApp(AppManager):
    name = "Anabelle Bot"
    commands = [
        BotCommand("start", "Головне меню"),
        BotCommand("silpo", "Час приїзду кур'єра Сільпо"),
    ]

    def greeting(self, update):
        return f"Привіт, {update.effective_user.first_name}! Що зробимо?"

    def menu_buttons(self):
        # One row per feature; add new features here
        return [
            [InlineKeyboardButton("🛒 Кур'єр Сільпо", callback_data=SILPO_MENU_CALLBACK)],
        ]

    def register_features(self):
        self.bot.add_handler(self.start_handler())
        for handler in get_silpo_handlers():
            self.bot.add_handler(handler)


def create_app() -> AnabelleApp:
    return AnabelleApp(TELEGRAM_TOKEN)
