# Bots on Oracle Cloud (Always Free)

One small VM runs all Python bots with `docker compose` (root `docker-compose.yml`). The bots poll Telegram, so the VM needs no open ports except SSH.

- `create_instance.sh` – run on your Mac: creates the network and the VM, prints its IP
- `setup_server.sh` – run on the VM: Docker, repo, `.env`, starts the bots
- `.env.example` – every env var the bots read

## 1. Oracle account

1. Sign up at https://signup.cloud.oracle.com/. It asks for a card for verification (no charge for Always Free).
2. Pick the **home region** carefully, it can't be changed later and Always Free VMs exist only there. Take one close to you (e.g. Amsterdam or Frankfurt).
3. Optional but recommended: **upgrade to Pay-As-You-Go** (Billing → Upgrade). Oracle may reclaim Always Free VMs that look idle; a PAYG account keeps the free resources for free and they are not reclaimed. Just don't create anything outside the free limits.

## 2. OCI CLI on the Mac

```bash
brew install oci-cli
```

```bash
oci setup config
```

It asks for your user OCID and tenancy OCID (Console → profile icon → My profile / Tenancy) and the region, creates an API key and prints the public key. Paste that key in Console → My profile → API keys → Add API key.

Check it works:

```bash
oci iam region list --output table
```

## 3. Create the VM

From the repo root:

```bash
deploy/oracle/create_instance.sh
```

By default: root compartment, `~/.ssh/id_ed25519.pub` (or `id_rsa.pub`), `VM.Standard.E2.1.Micro` (1/8 OCPU, 1 GB RAM, usually available). `--help` shows the options (`--compartment`, `--ad`, `--ssh-key`, `--name`).

Want more power? `--arm` takes `VM.Standard.A1.Flex` (1 OCPU, 6 GB, free up to 4 OCPU / 24 GB). It is often "Out of host capacity", then just retry later. The script can be run again, it reuses what is already there.

It ends with `Public IP: <ip>`.

## 4. Start the bots

```bash
scp deploy/oracle/setup_server.sh ubuntu@<ip>:
```

```bash
ssh ubuntu@<ip>
```

On the VM:

```bash
bash setup_server.sh
```

The first run installs Docker, clones the repo to `~/telegram-mother-bot` and creates `.env`, then stops. Fill it in:

```bash
nano ~/telegram-mother-bot/.env
```

**Before the second run, read "One token, one receiver" below.** Then:

```bash
bash setup_server.sh
```

It builds the image, starts the released bots (`docker compose up -d --build`) and shows `docker compose ps`.

## One token, one receiver

A bot token gets its updates either by webhook or by polling, never both. Anabelle is on Cloudflare now (webhook). When the Oracle container starts polling, python-telegram-bot deletes that webhook by itself, so Oracle silently takes over, and the Cloudflare side sets it again when it wakes up. They will fight.

So before Anabelle starts on Oracle: turn the Cloudflare side off (undeploy or remove Anabelle from the Worker), then remove the webhook:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/deleteWebhook"
```

Check that `url` is empty:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

The same goes for any bot: one token runs in one place only (also not on your laptop at the same time).

## Daily work

All on the VM, in `~/telegram-mother-bot`:

| What | Command |
|---|---|
| Update to the latest code | `git pull && sudo docker compose up -d --build` |
| Status | `sudo docker compose ps` |
| Logs | `sudo docker compose logs -f anabelle` |
| Restart one bot | `sudo docker compose restart anabelle` |
| Stop everything | `sudo docker compose down` |

(After your next login `sudo` is not needed, you are in the `docker` group.)

## Releasing more

**Another bot** (Coin Angel, B2Bro):
1. Set it to `released` in `bots/releases.py`, merge, `git pull` on the VM.
2. Add its profile in `.env`: `COMPOSE_PROFILES=coin_angel` or `COMPOSE_PROFILES=coin_angel,b2bro`. Coin Angel brings its own MongoDB container.
3. B2Bro needs its data files (not in git):
   ```bash
   scp speaker_sizes.db n_offer.xlsx ubuntu@<ip>:telegram-mother-bot/bots/b2bro/data/
   ```
4. `sudo docker compose up -d --build`

**Anabelle concerts**: on Cloudflare they are off because the container sleeps and loses its disk. On Oracle the daily job runs and the SQLite file stays in `bots/anabelle/data/` (mounted from the VM). Once concerts are merged, set `"anabelle.concerts": RELEASED` in `FEATURE_RELEASES` (`bots/releases.py`), fill `TICKETMASTER_API_KEY` in `.env`, then pull and `up -d --build`.

## Backups

SQLite files are in `~/telegram-mother-bot/bots/*/data/` on the VM, Mongo is in the `mongo-data` Docker volume. Copy the SQLite files to the Mac now and then:

```bash
scp -r ubuntu@<ip>:telegram-mother-bot/bots/anabelle/data ./anabelle-data-backup
```
