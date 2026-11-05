# Telegram Mother Bot

One repo for all my Telegram bots. They share one skeleton (`core/`) and each bot lives in its own folder under `bots/` with its own token, commands and buttons. Every bot runs as its own process.

| Bot | Folder | Token env var | Status |
|---|---|---|---|
| **Anabelle** – personal assistant ([@AnabelleBot](https://t.me/AnabelleBot)) | `bots/anabelle` | `TELEGRAM_BOT_TOKEN` | Silpo live on a free Cloudflare Worker (`bots/anabelle/worker`) |
| **Coin Angel** – crypto price alerts ([@AngelCoin_Bot](https://t.me/AngelCoin_Bot)) | `bots/coin_angel` | `TELEGRAM_ANGEL_TOKEN` | not released |
| **B2Bro** – car speaker sizes and AI product picks (moved from the B2Bro repo) | `bots/b2bro` | `TELEGRAM_B2Bro_TOKEN` | not released |

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
    worker/              JavaScript Worker: /start + Silpo, deployed on the free plan
  coin_angel/            app.py, config.py, commands/, db/ (MongoDB)
  b2bro/                 app.py, config.py, commands/, db/ (SQLite), data/ (not in git)
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
- `/outage` or **💡 Відключення світла** (Worker only) – planned power outages. Choose today or tomorrow, then type 1-3 windows in Kyiv time, in order (`22:30-00:40, 4:00-6:00`), or forward DTEK's message. Nothing is in the past: a window after midnight, or one already over, goes to the next day; overlapping windows (`7:30-17:00, 16-20:00`) stay on one day. One reminder goes to the tablet (Russian, the tablet adds its battery level):
  > Сегодня с 22:30 до 0:40 и завтра с 4:00 до 6:00 не будет света. (twice) Не забудь зарядить свои устройства.

  When: 3 hours before the first window, only between 9:30 and 22:00 (after 22:00 -> 22:00; before 9:30 -> 9:30 if still 2 hours before, else 22:00 the evening before). Entered later than that: sent right away. Stored in Workers KV, sent by a Cron Trigger every 15 minutes.
  The DTEK / YASNO sites can't be read automatically (bot protection), so the times come from you.

## Coin Angel

- **Create Price Alert** → choose a coin → set your price
- **My Alerts** – your active alerts
- Needs MongoDB on `localhost:27017`.

## B2Bro

- **🔍 Find speaker size** – type a make (lists its models) or `Make Model Year`, then pick front or rear door
- **AI suggestion** – type a product or category; it filters the offer sheet and asks OpenAI for the best picks
- Copy `speaker_sizes.db` and `n_offer.xlsx` into `bots/b2bro/data/`; `OPENAI_API_KEY` for the AI suggestion.

---

## Run locally

```bash
pip install -r requirements.txt
python -m bots.anabelle      # or: python -m bots.coin_angel / python -m bots.b2bro
```

Locally the bots use polling. Tokens come from the environment (or `.env` when `ENV=local`, the default).

## Deploy Anabelle (free Cloudflare Worker)

The live @AnabelleBot is the small JavaScript Worker in `bots/anabelle/worker` (`/start`, Silpo and planned outages; Silpo uses the same texts as the Python bot, keep both in sync). Free Workers plan, no container.

```bash
cd bots/anabelle/worker
npm install
npx wrangler login
npx wrangler kv namespace create OUTAGES       # once; put the printed id in wrangler.jsonc
npx wrangler secret put TELEGRAM_BOT_TOKEN     # @AnabelleBot token
npx wrangler secret put WEBHOOK_SECRET         # any random string
npx wrangler deploy
curl -X POST https://anabelle-bot.<your-subdomain>.workers.dev/setup -H "X-Setup-Secret: <WEBHOOK_SECRET>"
```

`/setup` points the bot's webhook at the Worker and fills its `/` menu. Tests: `npm test`.

While the Worker has the webhook, `python -m bots.anabelle` with the same token gets no updates (one token, one receiver). Use a separate test bot token locally.

## Deploy (Cloudflare Containers, later)

For the Python bots. Needs the Workers Paid plan. Telegram calls the Worker at `/<bot>`, the Worker wakes that bot's container (it sleeps after 10 minutes idle) and the bot answers in webhook mode.

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
