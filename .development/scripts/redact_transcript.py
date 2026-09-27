#!/usr/bin/env python3
"""
redact_transcript.py
Masks credentials, keys and email addresses in session transcripts (JSONL)
before they are archived. Used by session-archive.py; also runs by hand:

    python3 redact_transcript.py FILE...        # rewrite the files in place

What it masks, each as [REDACTED:<kind>]:
  - private keys (SSH, PGP, PEM) and PGP public key blocks;
  - SSH public keys (they identify their owner);
  - tokens with a known shape: GitHub, Anthropic, OpenAI, AWS, Google, Slack;
  - Bearer tokens, passwords inside URLs, values of key/secret/token/password
    assignments;
  - email addresses, except the non-personal ones in EMAIL_ALLOWLIST.

What it deliberately leaves alone: session ids, commit hashes, UUIDs. They are
not secrets, and masking them would break searching the transcripts. For the
same reason GPG fingerprints stay: 40 hex digits look exactly like a commit
hash.

Detection is by shape: a secret in an unknown format passes. This is an extra
layer, not a replacement for keeping the journal repository private.

JSONL files are handled line by line as JSON: the patterns run on the decoded
string values (where "\\n" is a real newline and quotes are quotes), and only
lines that changed are serialized again. Working on the raw text instead is
fragile by construction: escapes mix with content (the "n" of "\\n" reads as
the start of an email address). Lines that are not valid JSON fall back to
plain-text masking.
"""

import json
import re
import sys
from pathlib import Path

EMAIL_ALLOWLIST = {
    "noreply@anthropic.com",
    "noreply@github.com",
    "git@github.com",
}

# Key blocks span lines: DOTALL lets ".*?" cross the newlines.
_PATTERNS = [
    ("private-key", re.compile(
        r"-----BEGIN [A-Z ]*PRIVATE KEY(?: BLOCK)?-----.*?-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----",
        re.DOTALL)),
    ("pgp-public-key", re.compile(
        r"-----BEGIN PGP PUBLIC KEY BLOCK-----.*?-----END PGP PUBLIC KEY BLOCK-----", re.DOTALL)),
    ("ssh-public-key", re.compile(
        r"(?:ssh-(?:rsa|ed25519|dss)|ecdsa-sha2-nistp\d+|sk-ssh-ed25519@openssh\.com) AAAA[0-9A-Za-z+/]+={0,3}")),
    ("github-token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}")),
    ("github-token", re.compile(r"\bgithub_pat_[A-Za-z0-9_]{22,}")),
    ("anthropic-key", re.compile(r"\bsk-ant-[A-Za-z0-9_\-]{20,}")),
    ("openai-key", re.compile(r"\bsk-(?:proj-)?[A-Za-z0-9_\-]{20,}")),
    ("aws-key", re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b")),
    ("google-key", re.compile(r"\bAIza[0-9A-Za-z_\-]{35}")),
    ("slack-token", re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}")),
]

# These keep a prefix (group 1) and mask only the secret part.
_PREFIXED = [
    ("bearer-token", re.compile(r"(?i)(\bbearer\s+)[A-Za-z0-9._~+/\-]{16,}=*")),
    ("url-password", re.compile(r"(\bhttps?://[^/\s:@\"\\]+:)[^@\s/\"\\]+(?=@)")),
    ("secret", re.compile(
        r"(?i)(\b(?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?key|client[_-]?secret)"
        r"(?:\\*[\"'])?\s*[:=]\s*(?:\\*[\"'])?)(?!\[REDACTED)[^\s\"'\\,;]{8,}")),
]

_EMAIL = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}\b")


def redact_text(text: str) -> tuple[str, dict]:
    """Return the masked text and a count of replacements per kind."""
    counts: dict[str, int] = {}

    def bump(kind: str) -> None:
        counts[kind] = counts.get(kind, 0) + 1

    for kind, pattern in _PATTERNS:
        def whole(_m, kind=kind):
            bump(kind)
            return f"[REDACTED:{kind}]"
        text = pattern.sub(whole, text)

    for kind, pattern in _PREFIXED:
        def keep_prefix(m, kind=kind):
            bump(kind)
            return f"{m.group(1)}[REDACTED:{kind}]"
        text = pattern.sub(keep_prefix, text)

    def email(m):
        if m.group(0).lower() in EMAIL_ALLOWLIST:
            return m.group(0)
        bump("email")
        return "[REDACTED:email]"
    text = _EMAIL.sub(email, text)

    return text, counts


def _redact_value(value, counts: dict):
    """Mask every string inside a decoded JSON value."""
    if isinstance(value, str):
        masked, c = redact_text(value)
        for k, v in c.items():
            counts[k] = counts.get(k, 0) + v
        return masked
    if isinstance(value, list):
        return [_redact_value(v, counts) for v in value]
    if isinstance(value, dict):
        return {k: _redact_value(v, counts) for k, v in value.items()}
    return value


def redact_jsonl_line(line: str) -> tuple[str, dict]:
    """Mask one JSONL line; an unchanged line is returned byte for byte."""
    try:
        obj = json.loads(line)
    except ValueError:
        return redact_text(line)
    counts: dict[str, int] = {}
    masked = _redact_value(obj, counts)
    if not counts:
        return line, counts
    return json.dumps(masked, ensure_ascii=False, separators=(",", ":")), counts


def redact_file(path: Path) -> dict:
    """Mask a file in place. Returns the counts."""
    original = path.read_text(encoding="utf-8", errors="surrogateescape")
    counts: dict[str, int] = {}
    if path.suffix == ".jsonl":
        out = []
        for line in original.split("\n"):
            masked_line, c = redact_jsonl_line(line) if line.strip() else (line, {})
            for k, v in c.items():
                counts[k] = counts.get(k, 0) + v
            out.append(masked_line)
        masked = "\n".join(out)
    else:
        masked, counts = redact_text(original)
    if masked != original:
        path.write_text(masked, encoding="utf-8", errors="surrogateescape")
    return counts


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__.strip().splitlines()[4], file=sys.stderr)
        return 2
    for name in argv:
        counts = redact_file(Path(name))
        summary = ", ".join(f"{k} {v}" for k, v in sorted(counts.items())) or "nothing"
        print(f"{name}: {summary}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
