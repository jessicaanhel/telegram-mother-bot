# Which bots may run in the cloud. Local runs (python -m bots.<name>) ignore this.
# To release a bot: set it to RELEASED and add its container to cloudflare/ (worker.js + wrangler.jsonc).
RELEASED = "released"
NOT_RELEASED = "not_released"

RELEASES = {
    "anabelle": RELEASED,
    "coin_angel": NOT_RELEASED,
}

# Features inside a released bot that are not ready for the cloud yet.
# Locally (ENV=local) every feature is on; in the cloud only released ones are registered.
FEATURE_RELEASES = {
    # Needs a daily job and lasting storage; the Cloudflare container sleeps and loses its disk
    "anabelle.concerts": NOT_RELEASED,
}


def feature_enabled(feature: str) -> bool:
    from core.settings import ENV

    if ENV == "local":
        return True
    return FEATURE_RELEASES.get(feature) == RELEASED
