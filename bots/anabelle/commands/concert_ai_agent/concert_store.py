import sqlite3
from pathlib import Path


class ConcertStore:
    """Per chat: followed artists, followed cities, and concerts already sent (SQLite)."""

    def __init__(self, db_path: str):
        self.db_path = db_path
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS concert_artists (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    UNIQUE (chat_id, name COLLATE NOCASE)
                );
                CREATE TABLE IF NOT EXISTS concert_cities (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    chat_id INTEGER NOT NULL,
                    name TEXT NOT NULL,
                    UNIQUE (chat_id, name COLLATE NOCASE)
                );
                CREATE TABLE IF NOT EXISTS concerts_sent (
                    chat_id INTEGER NOT NULL,
                    event_id TEXT NOT NULL,
                    PRIMARY KEY (chat_id, event_id)
                );
            """)

    def _connect(self):
        return sqlite3.connect(self.db_path)

    # ---- artists and cities ("kind" is "artists" or "cities") ----

    def add(self, kind: str, chat_id: int, name: str) -> bool:
        """False when it was already in the list."""
        with self._connect() as conn:
            cursor = conn.execute(
                f"INSERT OR IGNORE INTO concert_{kind} (chat_id, name) VALUES (?, ?)", (chat_id, name)
            )
            return cursor.rowcount == 1

    def remove(self, kind: str, chat_id: int, item_id: int):
        with self._connect() as conn:
            conn.execute(f"DELETE FROM concert_{kind} WHERE id = ? AND chat_id = ?", (item_id, chat_id))

    def names(self, kind: str, chat_id: int) -> list[tuple[int, str]]:
        with self._connect() as conn:
            return conn.execute(
                f"SELECT id, name FROM concert_{kind} WHERE chat_id = ? ORDER BY name COLLATE NOCASE", (chat_id,)
            ).fetchall()

    def chats_with_artists(self) -> list[int]:
        with self._connect() as conn:
            return [row[0] for row in conn.execute("SELECT DISTINCT chat_id FROM concert_artists")]

    # ---- already notified ----

    def was_sent(self, chat_id: int, event_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM concerts_sent WHERE chat_id = ? AND event_id = ?", (chat_id, event_id)
            ).fetchone()
            return row is not None

    def mark_sent(self, chat_id: int, event_ids: list[str]):
        with self._connect() as conn:
            conn.executemany(
                "INSERT OR IGNORE INTO concerts_sent (chat_id, event_id) VALUES (?, ?)",
                [(chat_id, event_id) for event_id in event_ids],
            )
