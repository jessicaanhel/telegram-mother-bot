from pymongo import MongoClient
from pymongo.errors import ConnectionFailure
import logging

class MongoInitializer:
    _instance = None  # singleton-like

    def __init__(self, mongo_uri: str, db_name: str):
        self.mongo_uri = mongo_uri
        self.db_name = db_name
        self.client = None
        self.db = None
        self.connected = False

    def connect(self):
        if not self.connected:
            try:
                self.client = MongoClient(self.mongo_uri, serverSelectionTimeoutMS=3000)
                self.client.admin.command('ping')  # Force connection test
                self.db = self.client[self.db_name]
                self.connected = True
                logging.info("✔ MongoDB connected successfully.")
                self._init_collections()
            except ConnectionFailure as e:
                logging.error("✘ MongoDB connection failed: %s", e)
                raise

    def _init_collections(self):
        if "price_alerts" not in self.db.list_collection_names():
            self.db.create_collection("price_alerts")
            self.db["price_alerts"].create_index("user_id")
            logging.info("Collection 'price_alerts' created with index.")
        else:
            logging.info("Collection 'price_alerts' already exists.")

    def get_db(self):
        if not self.connected:
            self.connect()
        return self.db

    @classmethod
    def get_instance(cls, mongo_uri, db_name):
        if cls._instance is None:
            cls._instance = cls(mongo_uri, db_name)
        return cls._instance
