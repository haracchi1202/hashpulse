export type Node = Hashtag | Term | And | Or | Not | Group;

export interface Hashtag {
  type: "hashtag";
  value: string;
}

/** #なしの素のキーワード（X のフルテキスト検索語）。IG では検索不可。 */
export interface Term {
  type: "term";
  value: string;
}

export interface And {
  type: "and";
  left: Node;
  right: Node;
}

export interface Or {
  type: "or";
  left: Node;
  right: Node;
}

export interface Not {
  type: "not";
  expr: Node;
}

export interface Group {
  type: "group";
  expr: Node;
}

/**
 * IG 用: 素のキーワード(term)をハッシュタグ(hashtag)に変換した AST を返す。
 * IG はタグ検索しかできないため、#なしキーワードを自動で #タグ扱いにする。
 * （例: `きぬた歯科 ドロップシール` → `#きぬた歯科 AND #ドロップシール`）
 * X 側は元の AST をそのまま使うので影響しない。
 */
export function termsToTags(node: Node): Node {
  switch (node.type) {
    case "hashtag":
      return node;
    case "term":
      return { type: "hashtag", value: node.value };
    case "and":
      return { type: "and", left: termsToTags(node.left), right: termsToTags(node.right) };
    case "or":
      return { type: "or", left: termsToTags(node.left), right: termsToTags(node.right) };
    case "not":
      return { type: "not", expr: termsToTags(node.expr) };
    case "group":
      return { type: "group", expr: termsToTags(node.expr) };
  }
}

export function hashtagsIn(node: Node): string[] {
  const acc: string[] = [];
  const walk = (n: Node) => {
    switch (n.type) {
      case "hashtag":
        acc.push(n.value.toLowerCase());
        return;
      case "term":
        // 素のキーワードはハッシュタグではないので集計対象外
        return;
      case "and":
      case "or":
        walk(n.left);
        walk(n.right);
        return;
      case "not":
      case "group":
        walk(n.expr);
        return;
    }
  };
  walk(node);
  return Array.from(new Set(acc));
}
