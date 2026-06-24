import { ParseError, Token, tokenize } from "./lexer";
import type { Node } from "./ast";

// Grammar:
//   expr     = or_expr
//   or_expr  = and_expr ( 'OR' and_expr )*
//   and_expr = not_expr ( 'AND' not_expr )*
//   not_expr = 'NOT'? atom
//   atom     = HASHTAG | TERM | '(' expr ')'

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }
  private consume(): Token {
    return this.tokens[this.pos++];
  }
  private expect(type: Token["type"]): Token {
    const t = this.peek();
    if (t.type !== type) {
      throw new ParseError(
        `Expected ${type} but got ${t.type} ('${t.value}') at position ${t.pos}`,
        t.pos
      );
    }
    return this.consume();
  }

  parse(): Node {
    const node = this.parseOr();
    this.expect("EOF");
    return node;
  }

  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.peek().type === "OR") {
      this.consume();
      const right = this.parseAnd();
      left = { type: "or", left, right };
    }
    return left;
  }

  private parseAnd(): Node {
    let left = this.parseNot();
    // 暗黙 AND: atom が連続するケース (#a #b / #a キーワード) も AND として扱う
    while (this.isAndContinuation(this.peek().type)) {
      if (this.peek().type === "AND") this.consume();
      const right = this.parseNot();
      left = { type: "and", left, right };
    }
    return left;
  }

  private isAndContinuation(t: Token["type"]): boolean {
    return (
      t === "AND" ||
      t === "HASHTAG" ||
      t === "TERM" ||
      t === "LPAREN" ||
      t === "NOT"
    );
  }

  private parseNot(): Node {
    if (this.peek().type === "NOT") {
      this.consume();
      const expr = this.parseAtom();
      return { type: "not", expr };
    }
    return this.parseAtom();
  }

  private parseAtom(): Node {
    const t = this.peek();
    if (t.type === "HASHTAG") {
      this.consume();
      return { type: "hashtag", value: t.value };
    }
    if (t.type === "TERM") {
      this.consume();
      return { type: "term", value: t.value };
    }
    if (t.type === "LPAREN") {
      this.consume();
      const inner = this.parseOr();
      this.expect("RPAREN");
      return { type: "group", expr: inner };
    }
    throw new ParseError(
      `Unexpected token ${t.type} ('${t.value}') at position ${t.pos}`,
      t.pos
    );
  }
}

export function parse(input: string): Node {
  const tokens = tokenize(input);
  return new Parser(tokens).parse();
}
