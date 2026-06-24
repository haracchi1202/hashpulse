export type TokenType =
  | "HASHTAG"
  | "TERM"
  | "AND"
  | "OR"
  | "NOT"
  | "LPAREN"
  | "RPAREN"
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

const KEYWORDS = new Set(["AND", "OR", "NOT"]);

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "LPAREN", value: "(", pos: i });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "RPAREN", value: ")", pos: i });
      i++;
      continue;
    }
    if (ch === "#" || ch === "＃") {
      const start = i;
      i++;
      let body = "";
      while (
        i < input.length &&
        !/[\s()]/.test(input[i]) &&
        input[i] !== "#" &&
        input[i] !== "＃"
      ) {
        body += input[i];
        i++;
      }
      if (body.length === 0) {
        throw new ParseError(`Empty hashtag at position ${start}`, start);
      }
      tokens.push({ type: "HASHTAG", value: body, pos: start });
      continue;
    }
    // 演算子(AND/OR/NOT) または 素のキーワード(TERM)
    // 区切り（空白 / 括弧 / #）以外を1語として読み、
    // AND/OR/NOT に一致すれば演算子、それ以外は TERM（#なしキーワード）として扱う。
    const start = i;
    let word = "";
    while (
      i < input.length &&
      !/[\s()]/.test(input[i]) &&
      input[i] !== "#" &&
      input[i] !== "＃"
    ) {
      word += input[i];
      i++;
    }
    if (word.length === 0) {
      // ここに来るのは想定外（区切り文字は上で処理済み）。無限ループ防止に前進させて報告。
      throw new ParseError(`Unexpected character '${ch}' at position ${i}`, i);
    }
    const upper = word.toUpperCase();
    if (KEYWORDS.has(upper)) {
      tokens.push({ type: upper as TokenType, value: upper, pos: start });
    } else {
      tokens.push({ type: "TERM", value: word, pos: start });
    }
  }
  tokens.push({ type: "EOF", value: "", pos: input.length });
  return tokens;
}

export class ParseError extends Error {
  constructor(message: string, public position: number) {
    super(message);
    this.name = "ParseError";
  }
}
