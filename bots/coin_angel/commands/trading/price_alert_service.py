from __future__ import annotations

import logging

import requests
from bson import ObjectId
from bots.coin_angel.config import MONGO_URI, DB_NAME, TELEGRAM_USER_ID
from bots.coin_angel.db.mongo_service import MongoInitializer


class PriceAlertManager:
    def __init__(self):
        self.mongo = MongoInitializer.get_instance(MONGO_URI, DB_NAME)
        self.collection = self.mongo.get_db()["price_alerts"]

    def add_price_alert(self, user_id: int, coin_name: str, target_price: float):
        self.collection.insert_one({
            "user_id": user_id,
            "coin_name": coin_name,
            "target_price": target_price
        })
        print("✔ Alert added to DB")


    def get_all_alerts(self) -> list:
        return list(self.collection.find())

    def remove_alert(self, alert_id: str | ObjectId):
        self.collection.delete_one({"_id": ObjectId(alert_id)})

    def get_coin_price(self, coin_name: str) -> float | None:
        url = f"https://api.coingecko.com/api/v3/simple/price?ids={coin_name.lower()}&vs_currencies=usd"
        try:
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            data = response.json()
            return data.get(coin_name.lower(), {}).get("usd")
        except Exception as e:
            print(f"Error fetching price for {coin_name}: {e}")
            return None

    async def check_alerts(self) -> list[dict]:
        triggered = []
        alerts = self.get_all_alerts()

        for alert in alerts:
            coin_name = alert["coin_name"]
            target_price = alert["target_price"]
            user_id = alert["user_id"]
            current_price = self.get_coin_price(coin_name)

            if current_price is None:
                continue

            if current_price <= target_price:
                triggered.append({
                    "user_id": user_id,
                    "coin_name": coin_name,
                    "current_price": current_price,
                    "target_price": target_price,
                    "alert_id": alert["_id"]
                })

        return triggered

    def clear_alert(self, alert_id: str | ObjectId):
        self.remove_alert(alert_id)

    def get_alerts_by_user(self, user_id):
        results = list(self.collection.find({"user_id": user_id}))
        logging.info(f"Found {len(results)} active alerts in your Coin Angel.")
        return results


if __name__ == "__main__":
    user = TELEGRAM_USER_ID
    manager = PriceAlertManager()
    alerts = manager.get_all_alerts()
    print(f"Found {len(alerts)} alerts in DB")
    user_alerts = manager.get_alerts_by_user(user)
    for alert in user_alerts:
        coin = alert.get("coin_name") or alert.get("coin", "UNKNOWN")
        price = alert.get("target_price", "N/A")
        print(f"  - {coin.upper()}: {price}$")
