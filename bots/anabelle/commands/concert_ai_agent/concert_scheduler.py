import asyncio
import logging

from telegram.ext import Application, ContextTypes

from bots.anabelle.commands.concert_ai_agent.concert_service import find_new_concerts, store
from bots.anabelle.config import CONCERTS_DAILY_CHECK


async def send_new_concerts(context: ContextTypes.DEFAULT_TYPE):
    for chat_id in store.chats_with_artists():
        try:
            # requests is blocking; keep the bot responsive while it searches
            new_concerts = await asyncio.to_thread(find_new_concerts, chat_id)
        except Exception:
            logging.exception("Daily concert check failed for chat %s", chat_id)
            continue
        for concert in new_concerts:
            await context.bot.send_message(chat_id=chat_id, text="🆕 Новий концерт!\n" + concert.as_text())


def schedule_daily_check(application: Application):
    # Needs python-telegram-bot[job-queue] and a bot process that keeps running (polling)
    application.job_queue.run_daily(send_new_concerts, time=CONCERTS_DAILY_CHECK, name="daily_concert_check")
