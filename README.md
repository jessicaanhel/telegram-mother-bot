# Telegram Mother Bot

One repo for all my Telegram bots. They share one skeleton (`core/`) and each bot lives in its own folder under `bots/` with its own token, commands and buttons. Every bot runs as its own process.

| Bot | Folder | Token env var | Status |
|---|---|---|---|
| **Anabelle** – personal assistant ([@AnabelleBot](https://t.me/AnabelleBot)) | `bots/anabelle` | `TELEGRAM_BOT_TOKEN` | released (Cloudflare) |
| **Coin Angel** – crypto price alerts ([@AngelCoin_Bot](https://t.me/AngelCoin_Bot)) | `bots/coin_angel` | `TELEGRAM_ANGEL_TOKEN` | not released |

Release status lives in [`bots/releases.py`](bots/releases.py). Only released bots can start in the cloud.

---

## Structure

```
core/                    shared skeleton
  app_manager.py         AppManager: /start menu, reset, error handler, run
  telegram_bot.py        one bot = one token; polling locally, webhook in the cloud
  settings.py            get_env, loads .env when ENV=local
bots/
  releases.py            released / not_released per bot
  __main__.py            python -m bots <name>  (cloud entry, refuses unreleased bots)
  anabelle/              app.py (menu + features), config.py, commands/
  coin_angel/            app.py, config.py, commands/, db/ (MongoDB)
cloudflare/              Worker + Containers config (deploys released bots)
Dockerfile               one image for all bots
```

### Adding a bot
1. Create `bots/<name>/` with `config.py` (its token), `app.py` (subclass `AppManager`: `name`, `commands`, `greeting`, `menu_buttons`, `register_features`) and `__main__.py`.
2. Add it to `bots/releases.py` as `not_released`.
3. When it's ready: set it to `released` and add its container in `cloudflare/worker.js` and `cloudflare/wrangler.jsonc`.

---

## Anabelle

- `/start` – main menu with buttons
- `/silpo` or **🛒 Кур'єр Сільпо** – pick the Silpo delivery slot (NL time, as in the Silpo app). Anabelle converts it to Kyiv time and sends it to `@roma_notiferbot`, whose webhook goes to MacroDroid on the tablet in Kyiv, which reads it out:
  > Кур'єр Сільпо буде між 19:30 та 21:00. Це протягом наступних 3 годин 55 хвилин.

  Needs **Bot-to-Bot Communication Mode** on in @BotFather for both @AnabelleBot and @roma_notiferbot.
- `/concerts` or **🎤 Концерти** – follow artists in chosen cities. Add or remove artists and cities, or **🔎 Перевірити зараз**. Every day at 10:00 (NL) Anabelle checks Ticketmaster and sends concerts that weren't sent before.
  - Needs `TICKETMASTER_API_KEY` (free key at developer.ticketmaster.com).
  - **Local only for now** (`anabelle.concerts` is `not_released` in `bots/releases.py`): the daily job needs a bot process that keeps running, and the subscriptions live in SQLite (`bots/anabelle/data/`), which the sleeping Cloudflare container would lose.

### Feature flags
`FEATURE_RELEASES` in `bots/releases.py` switches single features of a released bot. Locally (`ENV=local`) every feature is on; in the cloud only released ones are registered.

## Coin Angel

- **Create Price Alert** → choose a coin → set your price
- **My Alerts** – your active alerts
- Needs MongoDB on `localhost:27017`.

---

## Run locally

```bash
pip install -r requirements.txt
python -m bots.anabelle      # or: python -m bots.coin_angel
```

Locally the bots use polling. Tokens come from the environment (or `.env` when `ENV=local`, the default).

## Deploy (Cloudflare Containers)

Needs the Workers Paid plan. Telegram calls the Worker at `/<bot>`, the Worker wakes that bot's container (it sleeps after 10 minutes idle) and the bot answers in webhook mode.

```bash
cd cloudflare
npm install
npx wrangler login
npx wrangler secret put ANABELLE_TELEGRAM_BOT_TOKEN
npx wrangler secret put ANABELLE_WEBHOOK_SECRET     # any random string
npx wrangler deploy
```

Then put the URL wrangler printed into `PUBLIC_URL` in `cloudflare/wrangler.jsonc`, deploy again, and point the bot at it once:

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=<PUBLIC_URL>/anabelle" -d "secret_token=<ANABELLE_WEBHOOK_SECRET>"
```

---

## License
PolyForm Noncommercial 1.0.0 (the `LICENSE` file is on `develop`).

## Author
Made with ❤️ by @jessicaanhel
