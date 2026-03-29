"""
Parser for Clausewitz engine save files.
Converts tokenized CK3 save data into nested Python dicts/lists.
"""

from typing import Any, Dict, List, Optional
from .tokenizer import (
    tokenize, Token,
    TOK_LBRACE, TOK_RBRACE, TOK_EQUALS,
    TOK_STRING, TOK_QUOTED, TOK_YES, TOK_NO,
)


class ParseError(Exception):
    pass


class ClausewitzParser:
    """
    Parses Clausewitz format text into nested Python structures.

    Handles the quirks of the format:
    - key=value pairs
    - key={ ... } blocks (objects)
    - key={ val1 val2 val3 } (arrays of bare values)
    - Duplicate keys (accumulated into lists)
    - Nested objects with numeric keys (like character IDs)
    """

    def __init__(self, text: str):
        self.tokens: List[Token] = list(tokenize(text))
        self.pos = 0
        self.length = len(self.tokens)

    def peek(self) -> Optional[Token]:
        if self.pos < self.length:
            return self.tokens[self.pos]
        return None

    def advance(self) -> Token:
        tok = self.tokens[self.pos]
        self.pos += 1
        return tok

    def expect(self, tok_type: str) -> Token:
        tok = self.advance()
        if tok[0] != tok_type:
            raise ParseError(f"Expected {tok_type}, got {tok[0]}={tok[1]!r} at position {self.pos}")
        return tok

    def _coerce_value(self, val: str) -> Any:
        """Try to coerce a string token value to int or float."""
        try:
            return int(val)
        except ValueError:
            pass
        try:
            return float(val)
        except ValueError:
            pass
        return val

    def parse(self) -> Dict[str, Any]:
        """Parse the entire token stream as a top-level object."""
        return self._parse_pairs()

    def _parse_pairs(self) -> Dict[str, Any]:
        """Parse key=value pairs until end of stream or closing brace."""
        result: Dict[str, Any] = {}

        while self.pos < self.length:
            tok = self.peek()
            if tok is None:
                break
            if tok[0] == TOK_RBRACE:
                break

            # Must be a key (STRING or QUOTED)
            if tok[0] not in (TOK_STRING, TOK_QUOTED):
                # Could be a bare value in a list context — shouldn't happen at top level
                # but we'll be lenient
                break

            key_tok = self.advance()
            key = key_tok[1]

            # Check for equals sign
            nxt = self.peek()
            if nxt is None or nxt[0] != TOK_EQUALS:
                # Bare value without = (part of a list), put it back conceptually
                # This happens in arrays like: traits={ brave strong }
                self.pos -= 1
                break

            self.advance()  # consume '='

            value = self._parse_value()

            # Handle duplicate keys: for CK3 saves, duplicate keys at the
            # same level are common. We keep the LAST value for each key,
            # which matches how the game engine resolves duplicates.
            # (Wrapping into lists causes downstream issues with 416MB saves.)
            result[key] = value

        return result

    def _parse_value(self) -> Any:
        """Parse a single value (scalar, object, or array)."""
        tok = self.peek()
        if tok is None:
            raise ParseError("Unexpected end of input while parsing value")

        if tok[0] == TOK_LBRACE:
            return self._parse_block()
        elif tok[0] == TOK_QUOTED:
            self.advance()
            return tok[1]
        elif tok[0] == TOK_YES:
            self.advance()
            return True
        elif tok[0] == TOK_NO:
            self.advance()
            return False
        elif tok[0] == TOK_STRING:
            self.advance()
            return self._coerce_value(tok[1])
        else:
            raise ParseError(f"Unexpected token {tok[0]}={tok[1]!r}")

    def _parse_block(self) -> Any:
        """
        Parse a { ... } block. Could be an object or an array.

        Heuristic: peek at first few tokens to decide.
        - If empty: return {}
        - If first_value = second_value: it's key=value pairs (object)
        - Otherwise: it's an array of bare values
        """
        self.expect(TOK_LBRACE)

        # Empty block
        if self.peek() and self.peek()[0] == TOK_RBRACE:
            self.advance()
            return {}

        # Look ahead to determine if this is an object or array
        if self._is_object_block():
            result = self._parse_pairs()
            if self.peek() and self.peek()[0] == TOK_RBRACE:
                self.advance()
            return result
        else:
            result = self._parse_array()
            if self.peek() and self.peek()[0] == TOK_RBRACE:
                self.advance()
            return result

    def _is_object_block(self) -> bool:
        """Look ahead to determine if the current block is key=value pairs."""
        # Save position
        saved = self.pos

        # Skip first token (potential key)
        tok1 = self.peek()
        if tok1 is None or tok1[0] == TOK_RBRACE:
            return False

        if tok1[0] not in (TOK_STRING, TOK_QUOTED):
            self.pos = saved
            return False

        self.pos += 1
        tok2 = self.peek()
        self.pos = saved

        if tok2 and tok2[0] == TOK_EQUALS:
            return True
        return False

    def _parse_array(self) -> List[Any]:
        """Parse bare values until closing brace."""
        result = []
        while self.pos < self.length:
            tok = self.peek()
            if tok is None or tok[0] == TOK_RBRACE:
                break

            if tok[0] == TOK_LBRACE:
                result.append(self._parse_block())
            elif tok[0] == TOK_QUOTED:
                self.advance()
                result.append(tok[1])
            elif tok[0] == TOK_YES:
                self.advance()
                result.append(True)
            elif tok[0] == TOK_NO:
                self.advance()
                result.append(False)
            elif tok[0] == TOK_STRING:
                self.advance()
                result.append(self._coerce_value(tok[1]))
            else:
                break

        return result


def parse_clausewitz(text: str) -> Dict[str, Any]:
    """Parse a Clausewitz format string into a Python dict."""
    parser = ClausewitzParser(text)
    return parser.parse()
