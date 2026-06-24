import type { Node } from "./ast";

// AST → X API v2 search query string
// X API syntax:
//   "#a #b"        => contains both #a and #b (implicit AND)
//   "#a OR #b"     => contains either
//   "-#a"          => excludes #a (NOT)
//   "(#a #b) OR #c" => grouping with parentheses supported in the query string
export function compileToXQuery(node: Node): string {
  return render(node, false);
}

// #なしキーワードを X のフレーズ完全一致用にダブルクォートで囲む。
// 内部のダブルクォートは X が解釈できないため除去する。
function quotePhrase(value: string): string {
  return `"${value.replace(/"/g, "")}"`;
}

function render(node: Node, inAnd: boolean): string {
  switch (node.type) {
    case "hashtag":
      return `#${node.value}`;
    case "term":
      // X の日本語全文検索はクォート無しだと形態素分割され、
      // 「うるぷくシール」が「うる/ぷく/シール」のように部分一致してしまう。
      // ダブルクォートで囲んでフレーズ完全一致にする。
      return quotePhrase(node.value);
    case "and": {
      const l = render(node.left, true);
      const r = render(node.right, true);
      return `${l} ${r}`;
    }
    case "or": {
      const l = render(node.left, false);
      const r = render(node.right, false);
      // OR は parens で囲んだ方が混在式で安全
      const expr = `${l} OR ${r}`;
      return inAnd ? `(${expr})` : expr;
    }
    case "not": {
      const inner = node.expr;
      // -#tag / -keyword のみ X API は許す。NOT(#a #b) のような複合は事後フィルタが必要
      if (inner.type === "hashtag") return `-#${inner.value}`;
      if (inner.type === "term") return `-${quotePhrase(inner.value)}`;
      throw new Error("X API only supports NOT on single hashtag/keyword (use post-filter for complex NOT)");
    }
    case "group": {
      const inner = render(node.expr, false);
      return `(${inner})`;
    }
  }
}

// 評価: 投稿のハッシュタグ集合に対して AST が真を返すか
// X API の AND/OR/NOT 結果を補正するための post-filter として使う
export function evaluate(node: Node, hashtags: Set<string>): boolean {
  const lowered = new Set(Array.from(hashtags).map((h) => h.toLowerCase()));
  return evalNode(node, lowered);
}

function evalNode(node: Node, tags: Set<string>): boolean {
  switch (node.type) {
    case "hashtag":
      return tags.has(node.value.toLowerCase());
    case "term":
      // IG はタグ集合しか持たないためキーワードは検証できない。
      // 除外して取りこぼすより通す方が安全（X 側は API がキーワードを評価済み）。
      return true;
    case "and":
      return evalNode(node.left, tags) && evalNode(node.right, tags);
    case "or":
      return evalNode(node.left, tags) || evalNode(node.right, tags);
    case "not":
      return !evalNode(node.expr, tags);
    case "group":
      return evalNode(node.expr, tags);
  }
}

// NFKC 正規化 + 小文字化。全角/半角・大文字小文字の揺れを吸収してフレーズ一致を安定させる。
function normalizeText(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

// 投稿の本文＋ハッシュタグに対して AST を評価する。
// term（#なしキーワード）は本文/タグ文字列への「フレーズ完全一致（部分文字列）」で判定する。
// TikTok の keyword 検索のように、プロバイダがクォート未対応で日本語をトークン分割し
// 「うるぷくシール」→「うる/ぷく/シール」のように広く返してくるソースの過剰収集を補正する。
// （X はクォートで API 側がフレーズ一致するため不要。これはトークン分割するソース向け。）
export function evaluateContent(
  node: Node,
  post: { text: string; hashtags: string[] }
): boolean {
  const tags = new Set(post.hashtags.map((h) => h.toLowerCase()));
  const haystack = normalizeText(`${post.text} ${post.hashtags.join(" ")}`);
  return evalContentNode(node, tags, haystack);
}

function evalContentNode(node: Node, tags: Set<string>, haystack: string): boolean {
  switch (node.type) {
    case "hashtag":
      return tags.has(node.value.toLowerCase());
    case "term":
      // フレーズ全体が本文/タグに含まれるかで判定（トークン分割の取りこぼしを除外）
      return haystack.includes(normalizeText(node.value));
    case "and":
      return evalContentNode(node.left, tags, haystack) && evalContentNode(node.right, tags, haystack);
    case "or":
      return evalContentNode(node.left, tags, haystack) || evalContentNode(node.right, tags, haystack);
    case "not":
      return !evalContentNode(node.expr, tags, haystack);
    case "group":
      return evalContentNode(node.expr, tags, haystack);
  }
}

// IG 用: OR で連結された hashtag leaves を列挙する (IG は単一タグ検索しかできないので)
export function leafHashtags(node: Node): string[] {
  const acc = new Set<string>();
  const walk = (n: Node) => {
    switch (n.type) {
      case "hashtag":
        acc.add(n.value.toLowerCase());
        return;
      case "term":
        // IG はタグ検索のみ。素のキーワードは検索キーにならない
        return;
      case "and":
      case "or":
        walk(n.left);
        walk(n.right);
        return;
      case "not":
        // NOT 配下のタグは取得不要 (どうせ除外する)
        return;
      case "group":
        walk(n.expr);
        return;
    }
  };
  walk(node);
  return Array.from(acc);
}
