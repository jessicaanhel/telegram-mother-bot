#!/usr/bin/env bash
# Runs on the Oracle VM (Ubuntu): installs Docker, clones the repo and starts the bots.
# Safe to run again: the second run (after filling .env) starts the bots.
#
# Usage on the VM:  bash setup_server.sh
# Options (env vars): REPO_URL, BRANCH (default develop), APP_DIR (default ~/telegram-mother-bot)
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/jessicaanhel/telegram-mother-bot.git}"
BRANCH="${BRANCH:-develop}"
APP_DIR="${APP_DIR:-$HOME/telegram-mother-bot}"

# The micro VM has 1 GB RAM: swap keeps the image build (pandas) and Mongo from being killed
if [[ ! -f /swapfile ]]; then
    echo "Adding 2 GB swap..."
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    echo "Installing Docker and git..."
    sudo apt-get update
    sudo apt-get install -y docker.io docker-compose-v2 git
    sudo systemctl enable --now docker
    # Lets you run docker without sudo after the next login
    sudo usermod -aG docker "$USER"
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
    echo "Cloning $REPO_URL ($BRANCH)..."
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

if [[ ! -f .env ]]; then
    cp deploy/oracle/.env.example .env
    chmod 600 .env
    echo
    echo "Created $APP_DIR/.env. Fill in the tokens (nano $APP_DIR/.env), then run this script again."
    exit 1
fi

# sudo: the docker group only works after a new login
sudo docker compose up -d --build
sudo docker compose ps
