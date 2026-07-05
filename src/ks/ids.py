"""ULID generation and validation.

A ULID is a 128-bit value rendered as 26 characters of Crockford base32:
  * 48 bits of millisecond Unix timestamp (most significant)
  * 80 bits of randomness

Crockford base32 excludes the visually ambiguous letters I, L, O and U, giving
the alphabet "0123456789ABCDEFGHJKMNPQRSTVWXYZ". Because the timestamp occupies
the high bits, ULIDs sort lexicographically in (roughly) creation order — which
is exactly why unit directory names are prefixed with one, and why we chose ULID
over UUID (CONTEXT.md §5).

The validation regex `^[0-9A-HJKMNP-TV-Z]{26}$` is the same one embedded in
schema/unit.schema.json for `id` and `relation.target`.
"""

from __future__ import annotations

import re
import secrets
import time

# Crockford base32 alphabet (no I, L, O, U).
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
assert len(_ALPHABET) == 32

_ULID_RE = re.compile(r"^[0-9A-HJKMNP-TV-Z]{26}$")

_TIMESTAMP_BITS = 48
_RANDOM_BITS = 80
_ENCODED_LEN = 26


def new_ulid(timestamp_ms: int | None = None, randomness: int | None = None) -> str:
    """Generate a fresh ULID.

    Args:
        timestamp_ms: millisecond Unix timestamp; defaults to "now".
        randomness:   80-bit integer; defaults to a cryptographically strong value.
                      (Both are injectable purely to make tests deterministic.)
    """
    if timestamp_ms is None:
        timestamp_ms = int(time.time() * 1000)
    if timestamp_ms < 0 or timestamp_ms >= (1 << _TIMESTAMP_BITS):
        raise ValueError(f"timestamp_ms out of 48-bit range: {timestamp_ms}")

    if randomness is None:
        randomness = secrets.randbits(_RANDOM_BITS)
    if randomness < 0 or randomness >= (1 << _RANDOM_BITS):
        raise ValueError(f"randomness out of 80-bit range: {randomness}")

    value = (timestamp_ms << _RANDOM_BITS) | randomness
    return _encode(value)


def _encode(value: int) -> str:
    """Encode a 128-bit integer as 26 Crockford base32 chars (MSB first)."""
    chars = []
    for _ in range(_ENCODED_LEN):
        chars.append(_ALPHABET[value & 0x1F])
        value >>= 5
    return "".join(reversed(chars))


def is_valid_ulid(value: object) -> bool:
    """True iff `value` is a 26-char uppercase Crockford-base32 string."""
    return isinstance(value, str) and _ULID_RE.match(value) is not None
