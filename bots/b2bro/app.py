from telegram import BotCommand, InlineKeyboardButton

from core.app_manager import AppManager
from bots.b2bro.config import TELEGRAM_TOKEN
from bots.b2bro.commands.speaker_size.car_product_database_picker import conv_handler_product_picker
from bots.b2bro.commands.ai_suggestion.ai_handler import conv_handler_ai_assistant


class B2BroApp(AppManager):
    name = "B2Bro Bot"
    commands = [
        BotCommand("start", "Main menu"),
        BotCommand("cancel", "Cancel"),
    ]

    def greeting(self, update):
        return f"Hello, {update.effective_user.first_name}! Welcome to B2Bro Bot chat. How can I help you?"

    def menu_buttons(self):
        return [
            [InlineKeyboardButton(text="🔍 Find speaker size", callback_data="pick_product"),
             InlineKeyboardButton(text="AI suggestion", callback_data="ai_suggestion")]
        ]

    def register_features(self):
        self.bot.add_handler(self.start_handler())

        # Add telegram_handlers for different workflows
        self.bot.add_handler(conv_handler_product_picker)
        self.bot.add_handler(conv_handler_ai_assistant)


def create_app() -> B2BroApp:
    return B2BroApp(TELEGRAM_TOKEN)
