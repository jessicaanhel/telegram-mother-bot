import os

ENV = os.getenv("ENV", "local")

if ENV == "local":
    from dotenv import load_dotenv
    load_dotenv()


def get_env(name: str, default: str | None = None) -> str:
    """
    :param name: variable name
    :param default: if variable is not set, use this default value. If default is set up, no error will be raised.
    """
    value = os.getenv(name, default)
    if value is None:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value
