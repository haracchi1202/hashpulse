// 軽量テスト: tsx tests/hashtag-parser.test.ts で実行
import { parse, compileToXQuery, evaluate, evaluateContent, hashtagsIn, termsToTags } from "../skills/hashtag-parser";

const cases: { input: string; xQuery: string }[] = [
  { input: "#筋トレ", xQuery: "#筋トレ" },
  { input: "#筋トレ AND #増量", xQuery: "#筋トレ #増量" },
  { input: "#筋トレ #増量", xQuery: "#筋トレ #増量" },
  { input: "#筋トレ OR #ダイエット", xQuery: "#筋トレ OR #ダイエット" },
  { input: "(#筋トレ AND #増量) OR #ダイエット", xQuery: "(#筋トレ #増量) OR #ダイエット" },
  { input: "#筋トレ NOT #PR", xQuery: "#筋トレ -#PR" },
  { input: "(#筋トレ AND #増量) OR (#ダイエット NOT #PR)", xQuery: "(#筋トレ #増量) OR (#ダイエット -#PR)" },
  // 素のキーワード (#なし TERM)。X はクォートでフレーズ完全一致にする（形態素分割の部分一致を防ぐ）。
  { input: "うるぷくシール", xQuery: `"うるぷくシール"` },
  { input: "うるぷくシール #猫", xQuery: `"うるぷくシール" #猫` },
  { input: "#猫 AND うるぷくシール", xQuery: `#猫 "うるぷくシール"` },
  { input: "うるぷくシール OR #猫", xQuery: `"うるぷくシール" OR #猫` },
  { input: "#猫 NOT PR", xQuery: `#猫 -"PR"` },
  { input: "cat dog", xQuery: `"cat" "dog"` },
];

let pass = 0;
let fail = 0;

for (const c of cases) {
  const ast = parse(c.input);
  const xq = compileToXQuery(ast);
  if (xq === c.xQuery) {
    pass++;
    console.log(`  OK: ${c.input}  →  ${xq}`);
  } else {
    fail++;
    console.log(`  FAIL: ${c.input}`);
    console.log(`    expected: ${c.xQuery}`);
    console.log(`    actual:   ${xq}`);
  }
}

// evaluate test
const ast = parse("(#筋トレ AND #増量) OR #ダイエット");
const evals: { tags: string[]; expected: boolean }[] = [
  { tags: ["筋トレ", "増量"], expected: true },
  { tags: ["筋トレ"], expected: false },
  { tags: ["ダイエット"], expected: true },
  { tags: ["foo"], expected: false },
];
for (const e of evals) {
  const actual = evaluate(ast, new Set(e.tags));
  if (actual === e.expected) {
    pass++;
    console.log(`  OK eval: [${e.tags.join(",")}] → ${actual}`);
  } else {
    fail++;
    console.log(`  FAIL eval: [${e.tags.join(",")}] expected ${e.expected} got ${actual}`);
  }
}

// term は hashtagsIn に出てこない（IG 検索キーにならない）
const tagsWithTerm = hashtagsIn(parse("#猫 AND うるぷくシール"));
if (tagsWithTerm.length === 1 && tagsWithTerm.includes("猫")) {
  pass++;
  console.log(`  OK hashtagsIn(term除外): [${tagsWithTerm.join(",")}]`);
} else {
  fail++;
  console.log(`  FAIL hashtagsIn(term除外): [${tagsWithTerm.join(",")}]`);
}

// term は IG 後処理 evaluate で常に true（タグだけで判定）
const evalTerm = evaluate(parse("#猫 AND うるぷくシール"), new Set(["猫"]));
if (evalTerm === true) {
  pass++;
  console.log(`  OK eval(term=true): ${evalTerm}`);
} else {
  fail++;
  console.log(`  FAIL eval(term=true): ${evalTerm}`);
}

// hashtagsIn
const tags = hashtagsIn(parse("(#A AND #B) OR (#A NOT #C)"));
if (tags.length === 3 && tags.includes("a") && tags.includes("b") && tags.includes("c")) {
  pass++;
  console.log(`  OK hashtagsIn: [${tags.join(",")}]`);
} else {
  fail++;
  console.log(`  FAIL hashtagsIn: [${tags.join(",")}]`);
}

// IG 用: termsToTags で素キーワードが #タグ化され、hashtagsIn に出てくる
const igTags = hashtagsIn(termsToTags(parse("きぬた歯科 ドロップシール")));
if (igTags.length === 2 && igTags.includes("きぬた歯科") && igTags.includes("ドロップシール")) {
  pass++;
  console.log(`  OK termsToTags(IG): [${igTags.join(",")}]`);
} else {
  fail++;
  console.log(`  FAIL termsToTags(IG): [${igTags.join(",")}]`);
}

// termsToTags 後は term→tag なので AND が後処理 evaluate で効く（両タグ必須）
const igAst = termsToTags(parse("きぬた歯科 ドロップシール"));
const igBoth = evaluate(igAst, new Set(["きぬた歯科", "ドロップシール"]));
const igOne = evaluate(igAst, new Set(["きぬた歯科"]));
if (igBoth === true && igOne === false) {
  pass++;
  console.log(`  OK termsToTags AND評価: both=${igBoth} one=${igOne}`);
} else {
  fail++;
  console.log(`  FAIL termsToTags AND評価: both=${igBoth} one=${igOne}`);
}

// evaluateContent: TikTok keyword の過剰収集除去（term は本文へのフレーズ完全一致）
const ec: { input: string; post: { text: string; hashtags: string[] }; expected: boolean; note: string }[] = [
  // フレーズ全体を含む投稿は採用
  { input: "うるぷくシール", post: { text: "新作のうるぷくシール買った", hashtags: [] }, expected: true, note: "本文にフレーズ全体" },
  // トークン分割で拾われる（うる/ぷく/シール バラバラ）投稿は除外
  { input: "うるぷくシール", post: { text: "うるさいぷくぷくのシールだよ", hashtags: [] }, expected: false, note: "断片のみ→除外" },
  { input: "うるぷくシール", post: { text: "ただのシールです", hashtags: [] }, expected: false, note: "一部のみ→除外" },
  // ハッシュタグにフレーズがあれば採用
  { input: "うるぷくシール", post: { text: "かわいい", hashtags: ["うるぷくシール"] }, expected: true, note: "タグにフレーズ" },
  // 全角/半角・大小文字の揺れを NFKC + lower で吸収
  { input: "ABCシール", post: { text: "ＡＢＣシール 入荷", hashtags: [] }, expected: true, note: "全角→NFKC一致" },
  // AND: 両方必要
  { input: "#猫 AND うるぷくシール", post: { text: "うるぷくシール", hashtags: ["猫"] }, expected: true, note: "AND 両方満たす" },
  { input: "#猫 AND うるぷくシール", post: { text: "うるぷくシール", hashtags: ["犬"] }, expected: false, note: "AND タグ欠落" },
  // OR: どちらか
  { input: "うるぷくシール OR #猫", post: { text: "関係ない話", hashtags: ["猫"] }, expected: true, note: "OR タグ側一致" },
  // NOT: フレーズを含むものを除外
  { input: "シール NOT PR", post: { text: "シール紹介 PR案件", hashtags: [] }, expected: false, note: "NOT で除外" },
  { input: "シール NOT PR", post: { text: "シール紹介です", hashtags: [] }, expected: true, note: "NOT 該当なし→採用" },
];
for (const c of ec) {
  const actual = evaluateContent(parse(c.input), c.post);
  if (actual === c.expected) {
    pass++;
    console.log(`  OK evalContent(${c.note}): "${c.input}" → ${actual}`);
  } else {
    fail++;
    console.log(`  FAIL evalContent(${c.note}): "${c.input}" expected ${c.expected} got ${actual}`);
  }
}

console.log(`\n${pass} passed / ${fail} failed`);
if (fail > 0) process.exit(1);
