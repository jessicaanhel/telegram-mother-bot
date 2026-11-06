import logging

import requests

from bots.anabelle.commands.concert_ai_agent.models import Concert

EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json"


class TicketmasterError(Exception):
    pass


def search_concerts(api_key: str, artist: str, city: str) -> list[Concert]:
    """Upcoming music events for an artist in a city (Ticketmaster Discovery API, free key)."""
    params = {
        "apikey": api_key,
        "keyword": artist,
        "city": city,
        "classificationName": "music",
        "sort": "date,asc",
        "size": 50,
    }
    try:
        response = requests.get(EVENTS_URL, params=params, timeout=15)
    except requests.RequestException as error:
        raise TicketmasterError(f"Ticketmaster is unreachable: {error}") from error
    if response.status_code == 401:
        raise TicketmasterError("Ticketmaster rejected the API key (TICKETMASTER_API_KEY)")
    if not response.ok:
        raise TicketmasterError(f"Ticketmaster answered HTTP {response.status_code}")

    events = response.json().get("_embedded", {}).get("events", [])
    concerts = [_to_concert(event, artist) for event in events if _is_by_artist(event, artist)]
    logging.info("Ticketmaster: %s in %s -> %d concerts", artist, city, len(concerts))
    return concerts


def _is_by_artist(event: dict, artist: str) -> bool:
    # "keyword" is a loose full-text search ("Coldplay" also finds "The Coldplay Experience Band"),
    # so a performer must be exactly the artist; only events without performers fall back to the name
    wanted = artist.casefold()
    performers = [a.get("name", "") for a in event.get("_embedded", {}).get("attractions", [])]
    if performers:
        return any(name.casefold() == wanted for name in performers)
    return wanted in event.get("name", "").casefold()


def _to_concert(event: dict, artist: str) -> Concert:
    venue = (event.get("_embedded", {}).get("venues") or [{}])[0]
    start = event.get("dates", {}).get("start", {})
    return Concert(
        id=event["id"],
        artist=artist,
        name=event.get("name", artist),
        city=venue.get("city", {}).get("name", ""),
        venue=venue.get("name", ""),
        date=start.get("localDate", ""),
        time=(start.get("localTime") or "")[:5],
        url=event.get("url", ""),
    )
