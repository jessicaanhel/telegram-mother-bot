from telegram import BotCommand
from telegram.ext import Application


class TelegramBot:
    """One Telegram bot = one token = one polling process."""

    def __init__(self, name: str, token: str, commands: list[BotCommand] | None = None):
        self.name = name
        self.commands = commands or []
        self.application = Application.builder().token(token).post_init(self._set_commands).build()

    async def _set_commands(self, application: Application):
        # Fills the bot's "/" menu in Telegram, so BotFather /setcommands is not needed
        if self.commands:
            await application.bot.set_my_commands(self.commands)

    def add_handler(self, handler):
        self.application.add_handler(handler)

    def add_error_handler(self, handler):
        self.application.add_error_handler(handler)

    def run(self):
        print(f"Starting {self.name}...")
        self.application.run_polling()

    async def send_message(self, user_id, text):
        await self.application.bot.send_message(chat_id=user_id, text=text)
