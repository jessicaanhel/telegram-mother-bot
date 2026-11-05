# Which bots may run in the cloud. Local runs (python -m bots.<name>) ignore this.
# To release a bot: set it to RELEASED and add its container to cloudflare/ (worker.js + wrangler.jsonc).
RELEASED = "released"
NOT_RELEASED = "not_released"

RELEASES = {
    "anabelle": RELEASED,
    "coin_angel": NOT_RELEASED,
    "b2bro": NOT_RELEASED,
}
