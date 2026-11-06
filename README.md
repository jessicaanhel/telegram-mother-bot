# Telegram Mother Bot

A small platform for running several Telegram bots from one codebase. Every bot shares the same skeleton (menu, routing, error handling, polling or webhook mode) and adds only its own commands and buttons, so a new bot is a folder, not a new project.

## Bots

| Bot | What it does |
|---|---|
| **Anabelle** | Personal assistant. Turns a grocery delivery slot into a spoken reminder on a home tablet, schedules reminders for planned power outages, and watches favourite artists for new concerts in chosen cities. |
| **Coin Angel** | Crypto price alerts: set a target price per coin and get a message when it is reached. |
| **B2Bro** | Sales helper for a car audio shop: finds speaker sizes by car make, model and year, and suggests products from a stock sheet with AI. |

## Features

- **One skeleton, many bots** – shared `AppManager` with `/start` menu, reset and error handling; each bot only defines its features.
- **Release flags** – bots and single features are switched between *released* and *not released*; only released ones start in the cloud.
- **Runs anywhere** – polling locally, webhook mode in the cloud, one Docker image for all Python bots.
- **Serverless edge bot** – Anabelle's live part runs as a Cloudflare Worker with Workers KV and Cron Triggers (free tier).
- **Bot-to-bot messaging** – one bot hands finished messages to another bot, which forwards them to a device for text-to-speech.
- **Time-zone aware scheduling** – slots and reminders are converted between time zones, including summer/winter time switches.
- **Tested** – Worker logic and message texts are covered by `node --test`.

## Tech stack

- Python 3.11, python-telegram-bot 20 (polling, webhooks, job queue)
- JavaScript Cloudflare Worker, Workers KV, Cron Triggers
- SQLite, MongoDB
- Ticketmaster Discovery API, OpenAI API
- Docker, Cloudflare Containers / any VPS

## Structure

```
core/              shared skeleton: AppManager, Telegram bot runner (polling / webhook), settings
bots/
  releases.py      release flags per bot and per feature
  anabelle/        personal assistant (Python) + worker/ (Cloudflare Worker)
  coin_angel/      crypto price alerts (MongoDB)
  b2bro/           car audio sales helper (SQLite, OpenAI)
cloudflare/        Cloudflare Containers setup for the Python bots
Dockerfile         one image for all Python bots
```

## Running

```bash
pip install -r requirements.txt
python -m bots.anabelle        # or bots.coin_angel, bots.b2bro
```

Each bot reads its token and API keys from environment variables (see its `config.py`). The Cloudflare Worker in `bots/anabelle/worker` deploys with `wrangler`.

## License

PolyForm Noncommercial 1.0.0, see [LICENSE](LICENSE).

## Author

Made with ❤️ by @jessicaanhel
