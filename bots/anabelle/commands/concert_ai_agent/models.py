from dataclasses import dataclass


@dataclass(frozen=True)
class Concert:
    id: str          # Ticketmaster event id, used to notify only once
    artist: str      # the artist as the user typed it
    name: str        # event name on Ticketmaster
    city: str
    venue: str
    date: str        # local date, YYYY-MM-DD
    time: str        # local time, HH:MM (empty when not announced yet)
    url: str

    def as_text(self) -> str:
        day, month, year = self.date[8:10], self.date[5:7], self.date[0:4]
        when = f"{day}.{month}.{year}" + (f" {self.time}" if self.time else "")
        return f"🎤 {self.name}\n📍 {self.city}, {self.venue}\n🗓 {when}\n{self.url}"
