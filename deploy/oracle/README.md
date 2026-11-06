# Deploy on a VM (Oracle Cloud Always Free)

Runs all Python bots on one small virtual machine with Docker Compose. The bots poll Telegram, so the VM only needs SSH open – no public web endpoint.

## How it works

- `docker-compose.yml` (repo root) has one service per bot, all from the same Docker image.
- Released bots start by default; bots that are not released yet sit behind Compose profiles (`COMPOSE_PROFILES=coin_angel,b2bro`).
- Coin Angel brings its own MongoDB container; SQLite data of the other bots is kept on the VM in `bots/<name>/data/`.

## Files

| File | Purpose |
|---|---|
| `create_instance.sh` | Creates the network and an Always Free VM with the OCI CLI and prints its IP |
| `setup_server.sh` | Installs Docker on the VM, clones the repo, prepares `.env` and starts the bots |
| `.env.example` | All environment variables the bots read |

## Quick start

```bash
deploy/oracle/create_instance.sh          # on your machine, needs a configured OCI CLI
ssh ubuntu@<ip> 'bash -s' < deploy/oracle/setup_server.sh
```

Fill in `.env` on the VM, run `setup_server.sh` again, and the bots are up. Updating is `git pull && docker compose up -d --build`.

A bot token can be served by one place only (polling here or a webhook elsewhere), so run each bot on one host at a time.
