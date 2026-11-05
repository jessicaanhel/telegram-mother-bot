import logging

from telegram import BotCommand, InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import CommandHandler, ContextTypes, ConversationHandler

from core.telegram_bot import TelegramBot


class AppManager:
    """
    Shared skeleton of every bot: /start menu, reset, error handler, run.
    Each bot subclasses it and fills in its name, menu and features.
    """

    name: str = "Bot"
    commands: list[BotCommand] = []

    def __init__(self, token: str):
        self.bot = TelegramBot(self.name, token, self.commands)
        self.register_handlers()

    # ---- filled in by each bot ----

    def greeting(self, update: Update) -> str:
        raise NotImplementedError

    def menu_buttons(self) -> list[list[InlineKeyboardButton]]:
        raise NotImplementedError

    def register_features(self):
        """Add the bot's handlers in order; include self.start_handler() where /start belongs."""
        raise NotImplementedError

    # ---- shared ----

    async def start_command(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await update.effective_message.reply_text(
            self.greeting(update),
            reply_markup=InlineKeyboardMarkup(self.menu_buttons()),
        )
        return ConversationHandler.END

    def start_handler(self) -> CommandHandler:
        return CommandHandler("start", self.start_command)

    async def reset_and_start(self, update, context):
        logging.info("Reset command executed")
        context.user_data.clear()
        context.chat_data.clear()
        return await self.start_command(update, context)

    @staticmethod
    async def error_handler(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
        logging.error("Exception occurred", exc_info=context.error)

    def register_handlers(self):
        self.register_features()
        self.bot.add_error_handler(self.error_handler)

    def run(self):
        self.bot.application.bot_data["app"] = self
        self.bot.run()
