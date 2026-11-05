import os
from urllib.parse import urlparse

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
        # In the cloud the container sleeps when idle, so Telegram has to push updates (webhook).
        # Locally there is no WEBHOOK_URL and the bot polls as before.
        webhook_url = os.getenv("WEBHOOK_URL")
        if not webhook_url:
            print(f"Starting {self.name} (polling)...")
            self.application.run_polling()
            return

        print(f"Starting {self.name} (webhook {webhook_url})...")
        self.application.run_webhook(
            listen="0.0.0.0",
            port=int(os.getenv("PORT", "8080")),
            url_path=urlparse(webhook_url).path.lstrip("/"),
            webhook_url=webhook_url,
            secret_token=os.getenv("WEBHOOK_SECRET"),
        )

    async def send_message(self, user_id, text):
        await self.application.bot.send_message(chat_id=user_id, text=text)
