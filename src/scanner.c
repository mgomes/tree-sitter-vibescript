#include "tree_sitter/parser.h"

enum TokenType {
  REGEX,
  BLOCK_OPEN,
  COMMAND_START,
};

void *tree_sitter_vibescript_external_scanner_create(void) { return NULL; }
void tree_sitter_vibescript_external_scanner_destroy(void *payload) {}
unsigned tree_sitter_vibescript_external_scanner_serialize(void *payload, char *buffer) { return 0; }
void tree_sitter_vibescript_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {}

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static bool is_argument_start(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
         (c >= '0' && c <= '9') || c == '_' || c == '"' || c == '@';
}

static bool is_identifier_char(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
         (c >= '0' && c <= '9') || c == '_';
}

// Keywords that follow an expression rather than begin a command argument, so a
// paren-less call must not swallow them: `foo do ... end`, `foo if bar`,
// `x and y`. Without this, `call do |x|` would be read as `call(do ...)`.
static bool word_is_trailing_keyword(const char *w, int len) {
  const char *kw[] = {"do", "end", "then", "else", "elsif", "when", "rescue",
                      "ensure", "if", "unless", "while", "until", "and", "or",
                      "in", "not"};
  for (unsigned i = 0; i < sizeof(kw) / sizeof(kw[0]); i++) {
    const char *k = kw[i];
    int j = 0;
    while (j < len && k[j] && k[j] == w[j]) j++;
    if (j == len && k[j] == 0) return true;
  }
  return false;
}

// Scans the three context-sensitive tokens a regular grammar cannot express:
//
//   REGEX         - a /.../flags literal, valid only where an operand may begin
//                   (so `a / b` stays division while `x =~ /re/` is a regex).
//   BLOCK_OPEN    - a `{` that opens a brace block, valid only on the same line
//                   as the call it attaches to (a `{` after a newline is a fresh
//                   hash statement, matching the interpreter).
//   COMMAND_START - the gap before a paren-less command argument (`assert x`),
//                   valid only when an argument follows on the same line, so
//                   newline-separated statements are never merged into a call.
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

  if (valid_symbols[COMMAND_START] && saw_space && !saw_newline &&
      is_argument_start(lexer->lookahead)) {
    // COMMAND_START is zero-width: it sits just before the argument. Mark the
    // end here, then read the leading word only to reject trailing keywords
    // (`do`, `if`, `and`, ...) — those advances are lookahead past mark_end and
    // do not become part of the token.
    lexer->mark_end(lexer);
    if (lexer->lookahead >= 'a' && lexer->lookahead <= 'z') {
      char word[8];
      int len = 0;
      while (is_identifier_char(lexer->lookahead) && len < 7) {
        word[len++] = (char)lexer->lookahead;
        advance(lexer);
      }
      if (word_is_trailing_keyword(word, len)) return false;
    }
    lexer->result_symbol = COMMAND_START;
    return true;
  }

  if (valid_symbols[BLOCK_OPEN] && lexer->lookahead == '{' && !saw_newline) {
    advance(lexer);
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
    lexer->result_symbol = REGEX;
    return true;
  }

  return false;
}
