import sqlite3
from typing import List, Tuple, Optional


class CarSpeakerDB:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _connect(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS speaker_sizes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                make TEXT,
                model TEXT,
                year_start INTEGER,
                year_end INTEGER,
                size_front_cm REAL,
                size_rear_cm REAL
            )
        ''')
        conn.commit()
        conn.close()

    def clean_and_add(self, cars: List[Tuple], clear_first=True):
        conn = self._connect()
        cursor = conn.cursor()

        if clear_first:
            cursor.execute('DELETE FROM speaker_sizes')
            print("Cleared the speaker_sizes table.")

        cars_lower = [(make.lower(), model.lower(), ys, ye, sf, sr) for (make, model, ys, ye, sf, sr) in cars]
        cursor.executemany('''
            INSERT INTO speaker_sizes (make, model, year_start, year_end, size_front_cm, size_rear_cm)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', cars_lower)
        conn.commit()
        print(f"Inserted {cursor.rowcount} rows.")
        conn.close()

    def add_no_duplicates(self, cars: List[Tuple]):
        conn = self._connect()
        cursor = conn.cursor()

        for car in cars:
            make, model, ys, ye, sf, sr = [car[0].lower(), car[1].lower(), *car[2:]]
            cursor.execute('''
                SELECT id FROM speaker_sizes
                WHERE make = ? AND model = ? AND year_start = ? AND year_end = ?
            ''', (make, model, ys, ye))
            exists = cursor.fetchone()
            if not exists:
                cursor.execute('''
                    INSERT INTO speaker_sizes (make, model, year_start, year_end, size_front_cm, size_rear_cm)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (make, model, ys, ye, sf, sr))
                print(f"Inserted: {make} {model} {ys}-{ye}")
            else:
                print(f"Skipped duplicate: {make} {model} {ys}-{ye}")
        conn.commit()
        conn.close()

    def debug_print_all(self):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM speaker_sizes")
        for row in cursor.fetchall():
            print(dict(row))
        conn.close()

    def find_car(self, make_model_year: str) -> Optional[sqlite3.Row]:
        parts = make_model_year.strip().split()
        if len(parts) < 3:
            return None

        make = parts[0].lower()
        model = parts[1].lower()
        try:
            year = int(parts[2])
        except ValueError:
            return None

        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, make, model, year_start FROM speaker_sizes
            WHERE LOWER(make) = ? AND LOWER(model) = ? AND ? BETWEEN year_start AND year_end
        """, (make, model, year))
        result = cursor.fetchone()
        conn.close()
        return result

    def get_door_size(self, car_id: int, door_type: str) -> Optional[str]:
        field = 'size_front_cm' if door_type == 'front' else 'size_rear_cm'
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute(f"SELECT {field} FROM speaker_sizes WHERE id = ?", (car_id,))
        row = cursor.fetchone()
        conn.close()
        return row[0] if row else None

    def get_models_by_make(self, make: str):
        conn = self._connect()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT DISTINCT model FROM speaker_sizes
            WHERE make = ?
            ORDER BY model
        """, (make.lower(),))
        models = [row["model"] for row in cursor.fetchall()]
        conn.close()
        return models
