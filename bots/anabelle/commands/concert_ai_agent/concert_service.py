import logging
import time

from bots.anabelle.commands.concert_ai_agent.concert_store import ConcertStore
from bots.anabelle.commands.concert_ai_agent.models import Concert
from bots.anabelle.commands.concert_ai_agent.ticketmaster import search_concerts
from bots.anabelle.config import CONCERTS_DB_PATH, TICKETMASTER_API_KEY

# Ticketmaster's free plan allows 5 requests per second
SECONDS_BETWEEN_REQUESTS = 0.25

store = ConcertStore(CONCERTS_DB_PATH)


def find_concerts(chat_id: int) -> list[Concert]:
    """Every upcoming concert of the chat's artists in the chat's cities, soonest first."""
    if not TICKETMASTER_API_KEY:
        raise RuntimeError("TICKETMASTER_API_KEY is not set")

    found: dict[str, Concert] = {}
    for _, artist in store.names("artists", chat_id):
        for _, city in store.names("cities", chat_id):
            for concert in search_concerts(TICKETMASTER_API_KEY, artist, city):
                found[concert.id] = concert  # same event can match two typed artists
            time.sleep(SECONDS_BETWEEN_REQUESTS)
    return sorted(found.values(), key=lambda concert: (concert.date, concert.time))


def find_new_concerts(chat_id: int) -> list[Concert]:
    """Concerts not sent to this chat before; they are marked as sent."""
    new = [concert for concert in find_concerts(chat_id) if not store.was_sent(chat_id, concert.id)]
    store.mark_sent(chat_id, [concert.id for concert in new])
    logging.info("Concerts for chat %s: %d new", chat_id, len(new))
    return new
