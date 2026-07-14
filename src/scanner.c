#include "tree_sitter/parser.h"

enum TokenType {
  REGEX,
  BLOCK_OPEN,
  COMMAND_START,
  ENDLESS_MARKER,
  SIGNATURE_ARROW,
  MODULE_KEYWORD,
  INCLUDE_KEYWORD,
  EXTEND_KEYWORD,
  PUBLIC_KEYWORD,
  PROTECTED_KEYWORD,
  ALIAS_KEYWORD,
  RESCUE_MODIFIER_KEYWORD,
  LOOP_DO,
};

void *tree_sitter_vibescript_external_scanner_create(void) { return NULL; }
void tree_sitter_vibescript_external_scanner_destroy(void *payload) {}
unsigned tree_sitter_vibescript_external_scanner_serialize(void *payload, char *buffer) { return 0; }
void tree_sitter_vibescript_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {}

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static bool is_upper(int32_t c) { return c >= 'A' && c <= 'Z'; }
static bool is_lower(int32_t c) { return c >= 'a' && c <= 'z'; }

static bool is_identifier_start(int32_t c) {
  return is_lower(c) || is_upper(c) || c == '_';
}

static bool is_identifier_char(int32_t c) {
  return is_identifier_start(c) || (c >= '0' && c <= '9');
}

static bool is_argument_start(int32_t c) {
  return is_identifier_char(c) || c == '"' || c == '\'' || c == '@';
}

static bool word_equals(const char *w, int len, const char *k) {
  int j = 0;
  while (j < len && k[j] && k[j] == w[j]) j++;
  return j == len && k[j] == 0;
}

// Keywords that follow an expression rather than begin a command argument, so a
// paren-less call must not swallow them: `foo do ... end`, `foo if bar`,
// `x and y`. Without this, `call do |x|` would be read as `call(do ...)`.
static bool word_is_trailing_keyword(const char *w, int len) {
  const char *kw[] = {"do", "end", "then", "else", "elsif", "when", "rescue",
                      "ensure", "if", "unless", "while", "until", "and", "or",
                      "in", "not"};
  for (unsigned i = 0; i < sizeof(kw) / sizeof(kw[0]); i++) {
    if (word_equals(w, len, kw[i])) return true;
  }
  return false;
}

// Reads the identifier word at the cursor into `w` (capped at cap - 1 chars).
// Returns the length, or -1 when the word is longer than the cap or carries a
// `?`/`!` suffix (so it cannot be one of the contextual keywords).
static int read_word(TSLexer *lexer, char *w, int cap) {
  int len = 0;
  while (is_identifier_char(lexer->lookahead)) {
    if (len >= cap - 1) return -1;
    w[len++] = (char)lexer->lookahead;
    advance(lexer);
  }
  if (lexer->lookahead == '?' || lexer->lookahead == '!') return -1;
  return len;
}

// After a splat/block-pass sigil in command position, the argument must begin
// immediately (Ruby's "space before, none after" rule).
static bool starts_sigil_operand(int32_t c) {
  return is_identifier_char(c) || c == '@' || c == '"' || c == '[' ||
         c == '(' || c == ':';
}

// Lookahead check for a `/.../` regex body starting at the cursor (which sits
// just past the opening slash): no leading space/`=`, and an unescaped closing
// slash before the end of the line. Mirrors the interpreter's requirement that
// a command-argument regex closes on its own line.
static bool regex_closes_on_line(TSLexer *lexer) {
  if (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
      lexer->lookahead == '=' || lexer->lookahead == '\n' ||
      lexer->lookahead == 0) {
    return false;
  }
  bool in_class = false;
  while (lexer->lookahead != 0 && lexer->lookahead != '\n') {
    if (lexer->lookahead == '\\') {
      advance(lexer);
      if (lexer->lookahead != 0 && lexer->lookahead != '\n') advance(lexer);
      continue;
    }
    if (lexer->lookahead == '[') {
      in_class = true;
    } else if (lexer->lookahead == ']') {
      in_class = false;
    } else if (lexer->lookahead == '/' && !in_class) {
      return true;
    }
    advance(lexer);
  }
  return false;
}

// Decides whether a contextual keyword fires. All lookahead here happens after
// mark_end, so rejected candidates fall back to the internal identifier token.
static bool scan_contextual_word(TSLexer *lexer, const bool *valid_symbols,
                                 bool saw_newline) {
  char word[16];
  int len = read_word(lexer, word, sizeof(word));
  if (len <= 0) return false;
  lexer->mark_end(lexer);

  // A rescue modifier must sit on its expression's own line; after a newline
  // the internal `rescue` keyword takes over as a begin/def rescue clause.
  if (valid_symbols[RESCUE_MODIFIER_KEYWORD] && !saw_newline &&
      word_equals(word, len, "rescue")) {
    lexer->result_symbol = RESCUE_MODIFIER_KEYWORD;
    return true;
  }

  // In a loop header, `do` closes the header (`while f do`) rather than
  // opening a block on the condition's trailing call.
  if (valid_symbols[LOOP_DO] && word_equals(word, len, "do")) {
    lexer->result_symbol = LOOP_DO;
    return true;
  }

  // Peek past same-line spaces only: every contextual form requires its
  // discriminating token on the declaration's own line.
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') advance(lexer);
  int32_t next = lexer->lookahead;

  if (valid_symbols[MODULE_KEYWORD] && word_equals(word, len, "module")) {
    if (is_upper(next)) {
      lexer->result_symbol = MODULE_KEYWORD;
      return true;
    }
    return false;
  }

  if ((valid_symbols[INCLUDE_KEYWORD] && word_equals(word, len, "include")) ||
      (valid_symbols[EXTEND_KEYWORD] && word_equals(word, len, "extend"))) {
    if (is_upper(next) || next == '(') {
      lexer->result_symbol =
          word[0] == 'i' ? INCLUDE_KEYWORD : EXTEND_KEYWORD;
      return true;
    }
    return false;
  }

  if ((valid_symbols[PUBLIC_KEYWORD] && word_equals(word, len, "public")) ||
      (valid_symbols[PROTECTED_KEYWORD] &&
       word_equals(word, len, "protected"))) {
    enum TokenType symbol = word[1] == 'u' ? PUBLIC_KEYWORD : PROTECTED_KEYWORD;
    // Section form: bare word ending its line.
    if (next == '\n' || next == '\r' || next == 0 || next == '#') {
      lexer->result_symbol = symbol;
      return true;
    }
    // Retroactive form: `protected :name, :other`.
    if (next == ':') {
      advance(lexer);
      if (is_identifier_start(lexer->lookahead) || lexer->lookahead == '"') {
        lexer->result_symbol = symbol;
        return true;
      }
      return false;
    }
    // Inline form: the modifier precedes a definition on the same line.
    if (is_lower(next)) {
      char target[16];
      int tlen = read_word(lexer, target, sizeof(target));
      if (tlen > 0 &&
          (word_equals(target, tlen, "def") ||
           word_equals(target, tlen, "property") ||
           word_equals(target, tlen, "getter") ||
           word_equals(target, tlen, "setter"))) {
        lexer->result_symbol = symbol;
        return true;
      }
    }
    return false;
  }

  if (valid_symbols[ALIAS_KEYWORD] && word_equals(word, len, "alias")) {
    if (is_identifier_start(next)) {
      lexer->result_symbol = ALIAS_KEYWORD;
      return true;
    }
    if (next == ':') {
      advance(lexer);
      if (is_identifier_start(lexer->lookahead)) {
        lexer->result_symbol = ALIAS_KEYWORD;
        return true;
      }
    }
    return false;
  }

  return false;
}

// Scans the context-sensitive tokens a regular grammar cannot express:
//
//   REGEX             - a /.../flags literal, valid only where an operand may
//                       begin (so `a / b` stays division while `x =~ /re/` is
//                       a regex).
//   BLOCK_OPEN        - a `{` that opens a brace block, valid only on the same
//                       line as the call it attaches to (a `{` after a newline
//                       is a fresh hash statement, matching the interpreter).
//   COMMAND_START     - the gap before a paren-less command argument
//                       (`assert x`, `f *args`, `match /id/`), valid only when
//                       an argument follows on the same line, so
//                       newline-separated statements are never merged.
//   ENDLESS_MARKER    - zero-width end of an endless range (`5..`) in
//                       statement-like positions: fires at a newline, EOF,
//                       comment, separator, closer, or trailing keyword, so
//                       `x = 5..` ends at the line break while grouped forms
//                       `(3..\n9)` (where this token is not valid) continue.
//   SIGNATURE_ARROW   - the `->` of a `def` return annotation, valid only on
//                       the signature line; a `->` opening the next line falls
//                       back to the internal token and parses as a lambda.
//   MODULE_KEYWORD    - contextual `module`, only before an uppercase name on
//                       the same line (`module = 5` stays an identifier).
//   INCLUDE/EXTEND    - contextual mixin directives before a module name or
//                       paren (`include = 2` stays an identifier).
//   PUBLIC/PROTECTED  - contextual visibility words in section, retroactive
//                       symbol, and inline-definition forms (`public = 1`
//                       stays an identifier).
//   ALIAS_KEYWORD     - contextual `alias` before an alias name on the same
//                       line (`alias = 5` stays an identifier).
bool tree_sitter_vibescript_external_scanner_scan(void *payload, TSLexer *lexer,
                                                  const bool *valid_symbols) {
  bool saw_newline = false;
  bool saw_space = false;
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
         lexer->lookahead == '\r' || lexer->lookahead == '\n') {
    if (lexer->lookahead == '\n') saw_newline = true;
    else saw_space = true;
    skip(lexer);
  }

  if (valid_symbols[ENDLESS_MARKER]) {
    lexer->mark_end(lexer);
    if (saw_newline || lexer->lookahead == 0 || lexer->lookahead == '#' ||
        lexer->lookahead == ',' || lexer->lookahead == ')' ||
        lexer->lookahead == ']' || lexer->lookahead == '}' ||
        lexer->lookahead == ';') {
      lexer->result_symbol = ENDLESS_MARKER;
      return true;
    }
    if (is_lower(lexer->lookahead)) {
      char word[16];
      int len = read_word(lexer, word, sizeof(word));
      if (len > 0 && word_is_trailing_keyword(word, len)) {
        lexer->result_symbol = ENDLESS_MARKER;
        return true;
      }
      // The word read is lookahead past mark_end; nothing else can start with
      // a letter here, so the internal lexer takes over.
      return false;
    }
    if (lexer->lookahead != '/') return false;
    // A slash may still open a regex operand; fall through to the REGEX scan.
  }

  if (valid_symbols[COMMAND_START] && saw_space && !saw_newline) {
    int32_t c = lexer->lookahead;
    // COMMAND_START is zero-width: it sits just before the argument. Mark the
    // end here; everything after is lookahead used only to accept or reject
    // the command reading.
    lexer->mark_end(lexer);
    if (is_argument_start(c)) {
      if (is_lower(c)) {
        char word[16];
        int len = read_word(lexer, word, sizeof(word));
        if (len < 0) len = 0;
        if (len > 0 && word_is_trailing_keyword(word, len)) return false;
      }
      lexer->result_symbol = COMMAND_START;
      return true;
    }
    // Symbol argument: `puts :name` (but never the `::` scope operator).
    if (c == ':') {
      advance(lexer);
      if (is_identifier_start(lexer->lookahead) || lexer->lookahead == '"') {
        lexer->result_symbol = COMMAND_START;
        return true;
      }
      return false;
    }
    // Block-pass argument: `f &blk`, `f &:name` (never `&&`, `&.`, `a & b`).
    if (c == '&') {
      advance(lexer);
      if (is_identifier_char(lexer->lookahead) || lexer->lookahead == ':' ||
          lexer->lookahead == '@' || lexer->lookahead == '"') {
        lexer->result_symbol = COMMAND_START;
        return true;
      }
      return false;
    }
    // Splat arguments: `f *args`, `f **opts` (never `x *= 2`, `a * b`).
    if (c == '*') {
      advance(lexer);
      if (lexer->lookahead == '*') advance(lexer);
      if (starts_sigil_operand(lexer->lookahead) && lexer->lookahead != '(') {
        lexer->result_symbol = COMMAND_START;
        return true;
      }
      return false;
    }
    // Array-literal argument: a bracket detached from the callee opens an
    // array (`puts [3, 1, 2].sort`), while a flush bracket (`puts[1]`) stays
    // indexing because no space precedes it.
    if (c == '[') {
      lexer->result_symbol = COMMAND_START;
      return true;
    }
    // Beginless range argument: `puts ..5`.
    if (c == '.') {
      advance(lexer);
      if (lexer->lookahead == '.') {
        lexer->result_symbol = COMMAND_START;
        return true;
      }
      return false;
    }
    // Percent-array argument: `puts %w[a b]` (never the modulo operator,
    // which lacks the sigil-and-delimiter shape).
    if (c == '%') {
      advance(lexer);
      if (lexer->lookahead == 'w' || lexer->lookahead == 'W' ||
          lexer->lookahead == 'i' || lexer->lookahead == 'I') {
        advance(lexer);
        if (lexer->lookahead == '[' || lexer->lookahead == '(' ||
            lexer->lookahead == '{' || lexer->lookahead == '<') {
          lexer->result_symbol = COMMAND_START;
          return true;
        }
      }
      return false;
    }
    // Regex argument: `match /id/` requires a closing slash on the line, so
    // `total /2` keeps dividing.
    if (c == '/') {
      advance(lexer);
      if (regex_closes_on_line(lexer)) {
        lexer->result_symbol = COMMAND_START;
        return true;
      }
      return false;
    }
    // Any other character cannot begin a command argument; fall through so a
    // same-line `{` can still open a brace block.
  }

  bool any_contextual_word =
      valid_symbols[MODULE_KEYWORD] || valid_symbols[INCLUDE_KEYWORD] ||
      valid_symbols[EXTEND_KEYWORD] || valid_symbols[PUBLIC_KEYWORD] ||
      valid_symbols[PROTECTED_KEYWORD] || valid_symbols[ALIAS_KEYWORD] ||
      valid_symbols[RESCUE_MODIFIER_KEYWORD] || valid_symbols[LOOP_DO];
  if (any_contextual_word && is_lower(lexer->lookahead)) {
    // A rejected candidate consumed only lookahead (no mark_end), and no other
    // external token can start with a letter, so the internal lexer re-reads
    // the word as an identifier or keyword.
    return scan_contextual_word(lexer, valid_symbols, saw_newline);
  }

  if (valid_symbols[SIGNATURE_ARROW] && !saw_newline &&
      lexer->lookahead == '-') {
    advance(lexer);
    if (lexer->lookahead == '>') {
      advance(lexer);
      lexer->mark_end(lexer);
      lexer->result_symbol = SIGNATURE_ARROW;
      return true;
    }
    return false;
  }

  if (valid_symbols[BLOCK_OPEN] && lexer->lookahead == '{' && !saw_newline) {
    advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = BLOCK_OPEN;
    return true;
  }

  if (valid_symbols[REGEX] && lexer->lookahead == '/') {
    advance(lexer);
    // Disambiguate from division / `/=`: a regex body never opens with a space
    // or `=`, whereas `a / b` and `a /= b` do. This keeps `/` an operator in the
    // GLR states where a statement boundary also makes a regex nominally valid.
    if (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
        lexer->lookahead == '=' || lexer->lookahead == 0) {
      return false;
    }
    bool in_class = false;
    bool closed = false;
    while (lexer->lookahead != 0) {
      if (lexer->lookahead == '\n') return false;
      if (lexer->lookahead == '\\') {
        advance(lexer);
        if (lexer->lookahead != 0) advance(lexer);
        continue;
      }
      if (lexer->lookahead == '[') {
        in_class = true;
      } else if (lexer->lookahead == ']') {
        in_class = false;
      } else if (lexer->lookahead == '/' && !in_class) {
        advance(lexer);
        closed = true;
        break;
      }
      advance(lexer);
    }
    if (!closed) return false;
    while (lexer->lookahead >= 'a' && lexer->lookahead <= 'z') advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = REGEX;
    return true;
  }

  return false;
}
