# python -m bots <name>: how the cloud starts a bot. Refuses bots that are not released.
import importlib
import sys

from bots.releases import RELEASED, RELEASES


def main():
    if len(sys.argv) != 2:
        sys.exit(f"Usage: python -m bots <name>   (bots: {', '.join(RELEASES)})")

    name = sys.argv[1]
    if name not in RELEASES:
        sys.exit(f"Unknown bot '{name}'. Known bots: {', '.join(RELEASES)}")
    if RELEASES[name] != RELEASED:
        sys.exit(f"Bot '{name}' is {RELEASES[name]}; set it to released in bots/releases.py first.")

    importlib.import_module(f"bots.{name}.app").create_app().run()


if __name__ == "__main__":
    main()
