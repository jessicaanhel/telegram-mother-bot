import re
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

NL_TIMEZONE = ZoneInfo("Europe/Amsterdam")
KYIV_TIMEZONE = ZoneInfo("Europe/Kyiv")

# Silpo delivery slots, as the Silpo app shows them (NL time)
SLOTS = [
    "8:00-9:30", "9:30-11:00", "11:00-12:30",
    "12:30-14:00", "14:00-15:30", "15:30-17:00",
    "17:00-18:30", "18:30-20:00", "20:00-21:30",
]

SLOT_PATTERN = re.compile(r"^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$")


@dataclass
class KyivSlot:
    start: datetime
    end: datetime


def format_time(moment: datetime) -> str:
    return f"{moment.hour}:{moment.minute:02d}"


def slot_to_kyiv(slot: str, now: datetime) -> KyivSlot:
    """
    Convert an NL slot like "18:30-20:00" to Kyiv time.
    A slot that has already ended today is taken as tomorrow's.
    """
    match = SLOT_PATTERN.match(slot)
    if not match:
        raise ValueError(f"Not a Silpo slot: {slot}")
    start_hour, start_minute, end_hour, end_minute = (int(part) for part in match.groups())

    nl_day = now.astimezone(NL_TIMEZONE).date()

    def to_kyiv(day, hour: int, minute: int) -> datetime:
        return datetime.combine(day, time(hour, minute), tzinfo=NL_TIMEZONE).astimezone(KYIV_TIMEZONE)

    end = to_kyiv(nl_day, end_hour, end_minute)
    if end <= now:
        nl_day += timedelta(days=1)
        end = to_kyiv(nl_day, end_hour, end_minute)
    return KyivSlot(start=to_kyiv(nl_day, start_hour, start_minute), end=end)


def _genitive(number: int, one: str, many: str) -> str:
    # "протягом наступних 21 години", but "3 годин", "11 годин"
    if number % 10 == 1 and number % 100 != 11:
        return f"{number} {one}"
    return f"{number} {many}"


def duration_text(minutes: int) -> str:
    hours, rest = divmod(minutes, 60)
    parts = []
    if hours:
        parts.append(_genitive(hours, "години", "годин"))
    if rest or not hours:
        parts.append(_genitive(rest, "хвилини", "хвилин"))
    return " ".join(parts)


def courier_message(slot: KyivSlot, now: datetime) -> str:
    """The sentence the tablet reads out, in Kyiv time."""
    day = "завтра " if slot.start.date() > now.astimezone(KYIV_TIMEZONE).date() else ""
    minutes_to_end = int((slot.end - now).total_seconds() // 60)
    return (
        f"Кур'єр Сільпо буде {day}між {format_time(slot.start)} та {format_time(slot.end)}. "
        f"Це протягом наступних {duration_text(minutes_to_end)}."
    )
