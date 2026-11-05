from telegram import InlineKeyboardButton
from telegram.ext import CallbackQueryHandler

from core.app_manager import AppManager
from bots.coin_angel.config import TELEGRAM_TOKEN
from bots.coin_angel.router import inline_router
from bots.coin_angel.commands.trading.price_alert_handler import conv_handler_setup_alerts
from bots.coin_angel.commands.template_function.extended_function_handler import (
    get_extended_conv_handler, handle_extended_inline,
)
from bots.coin_angel.commands.template_function.empty_function_handler import (
    get_empty_1_conv_handler, handle_empty_inline,
)


class CoinAngelApp(AppManager):
    name = "CoinAngel Bot"

    def greeting(self, update):
        user = update.effective_user
        return f"Hello, {user.first_name}! Welcome to your coin angel. Your user ID: {user.id}"

    def menu_buttons(self):
        return [
            [InlineKeyboardButton("Create Price Alert", callback_data="setup_alert"),
             InlineKeyboardButton("My Alerts", callback_data="get_alerts_for_user")],
            [InlineKeyboardButton("Empty Function 2", callback_data="empty_function_2"),
             InlineKeyboardButton("Run my extended function", callback_data="run_extended_function")]
        ]

    def register_features(self):
        #Conversation
        self.bot.add_handler(conv_handler_setup_alerts)
        self.bot.add_handler(get_extended_conv_handler(handle_extended_inline))
        self.bot.add_handler(get_empty_1_conv_handler(handle_empty_inline))

        #non-conversation
        self.bot.add_handler(self.start_handler())

        #Register router manager for inline button
        self.bot.add_handler(CallbackQueryHandler(inline_router))


def create_app() -> CoinAngelApp:
    return CoinAngelApp(TELEGRAM_TOKEN)
