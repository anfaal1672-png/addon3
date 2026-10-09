"""Shared helpers for the pack generator."""
import json
import os
import uuid

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
BP = os.path.join(ROOT, "packs", "DragonBall_BP")
RP = os.path.join(ROOT, "packs", "DragonBall_RP")
NS = "dbz"

_UUID_NS = uuid.UUID("6f1d3c2a-9b7e-4c55-8a1f-2d0b9e4a7c31")


def stable_uuid(name):
    return str(uuid.uuid5(_UUID_NS, name))


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


class Lang:
    """Collects ja_JP / en_US strings. Japanese is used for both so the game always shows Japanese."""

    def __init__(self):
        self.entries = {}

    def add(self, key, text):
        self.entries[key] = text

    def write(self):
        lines = [f"{k}={v}" for k, v in self.entries.items()]
        body = "\n".join(lines) + "\n"
        for code in ("ja_JP", "en_US"):
            write_text(os.path.join(RP, "texts", f"{code}.lang"), body)
            write_text(os.path.join(BP, "texts", f"{code}.lang"), body)
        write_json(os.path.join(RP, "texts", "languages.json"), ["ja_JP", "en_US"])
        write_json(os.path.join(BP, "texts", "languages.json"), ["ja_JP", "en_US"])


LANG = Lang()
