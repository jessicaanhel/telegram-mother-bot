// Front door on Cloudflare: Telegram posts each update to /<bot>, the Worker wakes that
// bot's container (it sleeps when idle) and passes the update on.
// Only released bots (bots/releases.py) get a container here.
import { Container, getContainer } from "@cloudflare/containers";

export class AnabelleContainer extends Container {
  defaultPort = 8080;
  sleepAfter = "10m";

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = {
      WEBHOOK_URL: `${env.PUBLIC_URL}/anabelle`,
      WEBHOOK_SECRET: env.ANABELLE_WEBHOOK_SECRET,
      TELEGRAM_BOT_TOKEN: env.ANABELLE_TELEGRAM_BOT_TOKEN,
      // Required by bots/anabelle/config.py but not used yet
      GITHUB_TOKEN: env.GITHUB_TOKEN ?? "",
    };
  }
}

const BOT_ROUTES = {
  "/anabelle": "ANABELLE",
};

export default {
  async fetch(request, env) {
    const binding = BOT_ROUTES[new URL(request.url).pathname];
    if (!binding || request.method !== "POST") {
      return new Response("Not found", { status: 404 });
    }
    // The bot itself checks Telegram's secret token header
    return getContainer(env[binding]).fetch(request);
  },
};
