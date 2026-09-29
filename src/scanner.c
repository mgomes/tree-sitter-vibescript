#include "tree_sitter/parser.h"

enum TokenType {
  REGEX,
  BLOCK_OPEN,
  COMMAND_START,
  ENDLESS_MARKER,
  SIGNATURE_ARROW,
  MODULE_KEYWORD,
  PUBLIC_KEYWORD,
  PROTECTED_KEYWORD,
  ALIAS_KEYWORD,
  RESCUE_MODIFIER_KEYWORD,
  MULTIPLY,
  DIVIDE,
  MODIFIER_IF,
  MODIFIER_WHILE,
  INDEX_OPEN,
  BARE_PARAMETER_START,
  BLOCK_COMMENT,
  KEYWORD_LABEL,
  CALL_OPEN,
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
  return is_lower(c) || is_upper(c) || c == '_' || c >= 128;
}

static bool is_identifier_char(int32_t c) {
  return is_identifier_start(c) || (c >= '0' && c <= '9');
}

static bool is_argument_start(int32_t c) {
  return is_identifier_char(c) || c == '"' || c == '\'' || c == '@';
}

// Characters that may open a symbol body after its colon: word symbols
// (:name), quoted symbols (:"..." / :'...'), and operator symbols such as
// :+, :<=>, and :[]=.
static bool is_symbol_body_start(int32_t c) {
  return is_identifier_start(c) || c == '"' || c == '\'' || c == '+' ||
         c == '-' || c == '*' || c == '/' || c == '%' || c == '<' ||
         c == '>' || c == '=' || c == '!' || c == '&' || c == '|' ||
         c == '[';
}

static bool word_equals(const char *w, int len, const char *k) {
  int j = 0;
  while (j < len && k[j] && k[j] == w[j]) j++;
  return j == len && k[j] == 0;
}

// Keywords that follow an expression rather than begin a command argument, so a
// parenless call must not swallow `foo if bar` or `foo rescue bar`.
static bool word_is_trailing_keyword(const char *w, int len) {
  const char *kw[] = {"end", "then", "else", "elsif", "when", "rescue",
                      "ensure", "if", "while",
                      "in"};
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

// After a splat sigil in command position, the argument must begin
// immediately (Ruby's "space before, none after" rule).
static bool starts_sigil_operand(int32_t c) {
  return is_identifier_char(c) || c == '@' || c == '"' || c == '\'' ||
         c == '[' || c == '(' || c == ':';
}

// Lookahead check for a `/.../` regex body starting at the cursor (which sits
// just past the opening slash): no leading space/`=`, and an unescaped closing
// slash before the end of the line. Mirrors the interpreter's requirement that
// a command-argument regex closes on its own line.
static bool regex_closes_on_line(TSLexer *lexer) {
  if (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
      lexer->lookahead == '/' || lexer->lookahead == '=' || lexer->lookahead == '\n' ||
      lexer->lookahead == 0) return false;
  bool in_class = false;
  bool first = false;
  bool posix = false;
  int32_t previous = 0;
  while (lexer->lookahead != 0 && lexer->lookahead != '\n') {
    int32_t c = lexer->lookahead;
    if (c == '\\') {
      advance(lexer);
      if (lexer->lookahead != 0) advance(lexer);
      first = false;
      continue;
    }
    if (!in_class && c == '/') return true;
    if (!in_class && c == '[') {
      in_class = true;
      first = true;
    } else if (in_class) {
      if (c == '[') {
        advance(lexer);
        if (lexer->lookahead == ':') posix = true;
        first = false;
        previous = c;
        continue;
      }
      if (c == ']' && !first) {
        if (!posix || previous != ':') in_class = false;
        posix = false;
      }
      if (c != '^' || !first) first = false;
    }
    previous = c;
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

  if (valid_symbols[KEYWORD_LABEL] && lexer->lookahead == ':') {
    advance(lexer);
    if (lexer->lookahead != ':') {
      lexer->result_symbol = KEYWORD_LABEL;
      return true;
    }
    return false;
  }

  if (!saw_newline && lexer->lookahead != ':' &&
      ((valid_symbols[MODIFIER_IF] && word_equals(word, len, "if")) ||
       (valid_symbols[MODIFIER_WHILE] && word_equals(word, len, "while")))) {
    lexer->result_symbol = word[0] == 'i' ? MODIFIER_IF : MODIFIER_WHILE;
    return true;
  }

  // A rescue modifier must sit on its expression's own line; after a newline
  // the internal `rescue` keyword takes over as a begin/def rescue clause.
  if (valid_symbols[RESCUE_MODIFIER_KEYWORD] && !saw_newline && lexer->lookahead != ':' &&
      word_equals(word, len, "rescue")) {
    lexer->result_symbol = RESCUE_MODIFIER_KEYWORD;
    return true;
  }

  // Peek past same-line spaces only: every contextual form requires its
  // discriminating token on the declaration's own line.
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') advance(lexer);
  int32_t next = lexer->lookahead;

  if (valid_symbols[MODULE_KEYWORD] && word_equals(word, len, "module")) {
    if (is_upper(next) || next >= 128) {
      lexer->result_symbol = MODULE_KEYWORD;
      return true;
    }
    return false;
  }

  if ((valid_symbols[PUBLIC_KEYWORD] && word_equals(word, len, "public")) ||
      (valid_symbols[PROTECTED_KEYWORD] &&
       word_equals(word, len, "protected"))) {
    enum TokenType symbol = word[1] == 'u' ? PUBLIC_KEYWORD : PROTECTED_KEYWORD;
    // Section form: bare word ending its statement.
    if (next == '\n' || next == '\r' || next == ';' || next == 0 || next == '#') {
      lexer->result_symbol = symbol;
      return true;
    }
    // Retroactive form: `protected :name, :other`, including operator
    // symbols (`public :+`).
    if (next == ':') {
      advance(lexer);
      if (is_symbol_body_start(lexer->lookahead)) {
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
      if (is_symbol_body_start(lexer->lookahead)) {
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
//                       the signature line; a `->` opening the next line is
//                       invalid.
//   MODULE_KEYWORD    - contextual `module`, only before an uppercase name on
//                       the same line (`module = 5` stays an identifier).
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

  if (valid_symbols[BLOCK_COMMENT] && lexer->get_column(lexer) == 0 && lexer->lookahead == '=') {
    const char *start = "=begin";
    for (unsigned i = 0; start[i]; i++) {
      if (lexer->lookahead != start[i]) return false;
      advance(lexer);
    }
    if (lexer->lookahead != '\n' && lexer->lookahead != '\r' && lexer->lookahead != ' ' && lexer->lookahead != '\t') return false;
    while (lexer->lookahead) {
      if (lexer->get_column(lexer) == 0 && lexer->lookahead == '=') {
        const char *end = "=end";
        unsigned i = 0;
        while (end[i] && lexer->lookahead == end[i]) {
          advance(lexer);
          i++;
        }
        if (!end[i] && (lexer->lookahead == 0 || lexer->lookahead == '\n' || lexer->lookahead == '\r' || lexer->lookahead == ' ' || lexer->lookahead == '\t')) {
          while (lexer->lookahead && lexer->lookahead != '\n') advance(lexer);
          lexer->result_symbol = BLOCK_COMMENT;
          return true;
        }
      } else {
        advance(lexer);
      }
    }
    return false;
  }

  if (valid_symbols[BARE_PARAMETER_START] && !saw_newline && saw_space &&
      (is_identifier_start(lexer->lookahead) || lexer->lookahead == '@' ||
       lexer->lookahead == '*' || lexer->lookahead == '&')) {
    lexer->mark_end(lexer);
    if (lexer->lookahead == '*' || lexer->lookahead == '&' || lexer->lookahead == '@') {
      int32_t sigil = lexer->lookahead;
      advance(lexer);
      if (lexer->lookahead == sigil) advance(lexer);
      if (sigil == '*') {
        while (lexer->lookahead == ' ' || lexer->lookahead == '\t') advance(lexer);
        if (lexer->lookahead == ',') {
          lexer->result_symbol = BARE_PARAMETER_START;
          return true;
        }
      }
    }
    while (is_identifier_char(lexer->lookahead) || lexer->lookahead == '?' || lexer->lookahead == '!') advance(lexer);
    while (lexer->lookahead == ' ' || lexer->lookahead == '\t') advance(lexer);
    if (lexer->lookahead == ':') {
      lexer->result_symbol = BARE_PARAMETER_START;
      return true;
    }
    return false;
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
        if (len > 0 && word_is_trailing_keyword(word, len) && lexer->lookahead != ':') {
          if (valid_symbols[RESCUE_MODIFIER_KEYWORD] && word_equals(word, len, "rescue")) {
            lexer->mark_end(lexer);
            lexer->result_symbol = RESCUE_MODIFIER_KEYWORD;
            return true;
          }
          if ((valid_symbols[MODIFIER_IF] && word_equals(word, len, "if")) ||
              (valid_symbols[MODIFIER_WHILE] && word_equals(word, len, "while"))) {
            lexer->mark_end(lexer);
            lexer->result_symbol = word[0] == 'i' ? MODIFIER_IF : MODIFIER_WHILE;
            return true;
          }
          return false;
        }
      }
      lexer->result_symbol = COMMAND_START;
      return true;
    }
    // Symbol argument: `puts :name`, `puts :"quoted"`, `puts :'quoted'`,
    // and operator symbols like `puts :+` or `puts :<=>` (but never the
    // `::` scope operator).
    if (c == ':') {
      advance(lexer);
      if (is_symbol_body_start(lexer->lookahead)) {
        lexer->result_symbol = COMMAND_START;
        return true;
      }
      return false;
    }
    // Negated arguments: `puts !ready`, without consuming `!=` or `!~`.
    if (c == '!') {
      advance(lexer);
      if (lexer->lookahead != '=' && lexer->lookahead != '~') {
        lexer->result_symbol = COMMAND_START;
        return true;
      }
      return false;
    }
    // Splat arguments: `f *args`, `f **opts`, `f *%w[a b]` (never
    // `x *= 2`, `a * b`).
    if (c == '*') {
      advance(lexer);
      bool power = lexer->lookahead == '*';
      if (power) advance(lexer);
      if (starts_sigil_operand(lexer->lookahead) && lexer->lookahead != '(') {
        lexer->result_symbol = COMMAND_START;
        return true;
      }
      if (!power && lexer->lookahead != '=' && valid_symbols[MULTIPLY]) {
        lexer->mark_end(lexer);
        lexer->result_symbol = MULTIPLY;
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
    // Regex argument: `match /id/` requires a closing slash on the line, so
    // `total /2` keeps dividing.
    if (c == '/') {
      advance(lexer);
      if (lexer->lookahead == '/') {
        advance(lexer);
        while (lexer->lookahead == ' ' || lexer->lookahead == '\t') advance(lexer);
        if (lexer->lookahead == ',' || lexer->lookahead == '\n' ||
            lexer->lookahead == '\r' || lexer->lookahead == 0 ||
            lexer->lookahead == ')' || lexer->lookahead == ']' ||
            lexer->lookahead == '}' || lexer->lookahead == ';' ||
            lexer->lookahead == '#') {
          lexer->result_symbol = COMMAND_START;
          return true;
        }
        if (is_lower(lexer->lookahead)) {
          char word[16];
          int len = read_word(lexer, word, sizeof(word));
          if (len > 0 && word_is_trailing_keyword(word, len) && lexer->lookahead != ':') {
            lexer->result_symbol = COMMAND_START;
            return true;
          }
        }
        return false;
      }
      if (regex_closes_on_line(lexer)) {
        lexer->result_symbol = COMMAND_START;
        return true;
      }
      return false;
    }
    // Any other character cannot begin a command argument; fall through so a
    // same-line `{` can still open a brace block.
  }

  if (!saw_newline && ((valid_symbols[INDEX_OPEN] && lexer->lookahead == '[') ||
                       (valid_symbols[CALL_OPEN] && lexer->lookahead == '('))) {
    lexer->result_symbol = lexer->lookahead == '[' ? INDEX_OPEN : CALL_OPEN;
    advance(lexer);
    lexer->mark_end(lexer);
    return true;
  }

  bool any_contextual_word =
      valid_symbols[MODULE_KEYWORD] || valid_symbols[PUBLIC_KEYWORD] ||
      valid_symbols[PROTECTED_KEYWORD] || valid_symbols[ALIAS_KEYWORD] ||
      valid_symbols[RESCUE_MODIFIER_KEYWORD] || valid_symbols[MODIFIER_IF] ||
      valid_symbols[MODIFIER_WHILE] || valid_symbols[KEYWORD_LABEL];
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

  if (((valid_symbols[MULTIPLY] && lexer->lookahead == '*') ||
                       (valid_symbols[DIVIDE] && lexer->lookahead == '/' && !saw_space && !saw_newline))) {
    int32_t operator = lexer->lookahead;
    advance(lexer);
    if (lexer->lookahead == '=' || lexer->lookahead == operator) return false;
    lexer->mark_end(lexer);
    if (saw_newline && operator == '*') {
      while (lexer->lookahead == ' ' || lexer->lookahead == '\t') advance(lexer);
      if (is_identifier_start(lexer->lookahead)) {
        char word[128];
        read_word(lexer, word, sizeof(word));
      }
      while (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
             lexer->lookahead == '\r' || lexer->lookahead == '\n') advance(lexer);
      if (lexer->lookahead == ',' || lexer->lookahead == '=' || lexer->lookahead == '.') return false;
    }
    lexer->result_symbol = operator == '*' ? MULTIPLY : DIVIDE;
    return true;
  }

  if (valid_symbols[REGEX] && lexer->lookahead == '/') {
    advance(lexer);
    // Disambiguate from division / `/=`: a regex body never opens with a space
    // or `=`, whereas `a / b` and `a /= b` do. This keeps `/` an operator in the
    // GLR states where a statement boundary also makes a regex nominally valid.
    if (lexer->lookahead == ' ' || lexer->lookahead == '\t' ||
        lexer->lookahead == '/' || lexer->lookahead == '=' || lexer->lookahead == 0) {
      if (valid_symbols[DIVIDE] && !saw_newline && lexer->lookahead != '/' && lexer->lookahead != '=') {
        lexer->mark_end(lexer);
        lexer->result_symbol = DIVIDE;
        return true;
      }
      return false;
    }
    if (!regex_closes_on_line(lexer)) return false;
    advance(lexer);
    while (lexer->lookahead >= 'a' && lexer->lookahead <= 'z') advance(lexer);
    lexer->mark_end(lexer);
    lexer->result_symbol = REGEX;
    return true;
  }

  return false;
}
