"""
Tokenizer for Clausewitz engine save files (CK3).
Handles the Paradox-specific text format with nested { } blocks.
"""

import re
from typing import Iterator, Tuple

# Token types
TOK_LBRACE = "LBRACE"
TOK_RBRACE = "RBRACE"
TOK_EQUALS = "EQUALS"
TOK_STRING = "STRING"
TOK_QUOTED = "QUOTED"
TOK_YES = "YES"
TOK_NO = "NO"

Token = Tuple[str, str]  # (type, value)

# Pattern that matches all token types in one pass
_TOKEN_RE = re.compile(
    r"""
    (?P<quoted>"(?:[^"\\]|\\.)*")    # quoted string
    | (?P<lbrace>\{)                  # {
    | (?P<rbrace>\})                  # }
    | (?P<equals>=)                   # =
    | (?P<comment>\#[^\n]*)           # comment (skipped)
    | (?P<word>[^\s={}"#]+)           # unquoted word/number/date
    """,
    re.VERBOSE,
)


def tokenize(text: str) -> Iterator[Token]:
    """Yield tokens from Clausewitz format text."""
    for m in _TOKEN_RE.finditer(text):
        if m.group("quoted"):
            # Strip surrounding quotes and unescape
            raw = m.group("quoted")[1:-1].replace('\\"', '"')
            yield (TOK_QUOTED, raw)
        elif m.group("lbrace"):
            yield (TOK_LBRACE, "{")
        elif m.group("rbrace"):
            yield (TOK_RBRACE, "}")
        elif m.group("equals"):
            yield (TOK_EQUALS, "=")
        elif m.group("comment"):
            continue  # skip comments
        elif m.group("word"):
            w = m.group("word")
            if w == "yes":
                yield (TOK_YES, "yes")
            elif w == "no":
                yield (TOK_NO, "no")
            else:
                yield (TOK_STRING, w)
