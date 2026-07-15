# Report-kun Paragraph Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 現在のカード振り分けを維持したまま、まとまりの順序変更と、カード本文を対応する文章欄へ挿入する機能を追加する。

**Architecture:** まとまりの元番号を保持する`sectionOrder`を新設し、カードの`assign`値と下書きの`draftKey(si)`は変更しない。ステージ3・4・5だけを`sectionOrder`順に描画し、旧作品は標準順へフォールバックする。サーバーの保存形式やスプレッドシート列は変更せず、JSONのバージョンだけを4へ上げる。

**Tech Stack:** Google Apps Script V8、HTML/CSS、Vanilla JavaScript、Node.js標準テスト

---

## File map

- Modify: `参照コード/Index.html` — 状態、並び替えUI、執筆欄、カード挿入、保存・復元
- Modify: `参照コード/Code.gs` — 配布版識別用の`CODE_VERSION`のみ更新
- Create: `tests/reference-paragraph-order.test.js` — 状態・順序・挿入・旧作品互換の回帰テスト

`Code.gs`の保存API、シート名、列構成、認証トークン、スコープは変更しない。

### Task 1: まとまり順序の状態モデル

**Files:**
- Modify: `参照コード/Index.html:714-725`
- Create: `tests/reference-paragraph-order.test.js`

- [ ] **Step 1: 順序状態の失敗テストを書く**

`tests/reference-paragraph-order.test.js`へ、実装前には失敗する検査を追加する。

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("参照コード/Index.html", "utf8");

test("まとまり順序の状態を保持する", () => {
  assert.match(html, /let sectionOrder = \[\]/);
  assert.match(html, /let advancedOrderMode = false/);
  assert.match(html, /let orderReason = ""/);
});

test("標準順を型のパート数から作る", () => {
  assert.match(html, /function defaultSectionOrder\(\)/);
  assert.match(html, /tmpl\(\)\.sections\.map\(\(_sec, i\) => i\)/);
});
```

- [ ] **Step 2: テストが期待どおり失敗することを確認する**

Run:

```powershell
node --test tests/reference-paragraph-order.test.js
```

Expected: `sectionOrder`または`defaultSectionOrder`がないためFAIL。

- [ ] **Step 3: 最小の状態とヘルパーを実装する**

`参照コード/Index.html`の状態領域へ追加する。

```js
let sectionOrder = [];
let advancedOrderMode = false;
let orderReason = "";

function defaultSectionOrder() {
  return tmpl().sections.map((_sec, i) => i);
}

function normalizeSectionOrder(order) {
  const standard = defaultSectionOrder();
  if (!Array.isArray(order) || order.length !== standard.length) return standard;
  const normalized = order.map(v => parseInt(v, 10));
  const unique = new Set(normalized);
  return unique.size === standard.length && standard.every(i => unique.has(i))
    ? normalized
    : standard;
}

function resetSectionOrder() {
  sectionOrder = defaultSectionOrder();
  advancedOrderMode = false;
  orderReason = "";
}

function orderedSectionIndices() {
  sectionOrder = normalizeSectionOrder(sectionOrder);
  return sectionOrder.slice();
}
```

- [ ] **Step 4: 状態テストを成功させる**

Run: `node --test tests/reference-paragraph-order.test.js`

Expected: Task 1のテストがPASS。

### Task 2: ステージ3に順序変更UIを追加

**Files:**
- Modify: `参照コード/Index.html`のCSS、`renderStage3()`、`selectTemplate()`、`assignSeed()`周辺
- Modify: `tests/reference-paragraph-order.test.js`

- [ ] **Step 1: 順序操作の失敗テストを書く**

```js
test("基本モードは中のまとまりだけ移動可能にする", () => {
  assert.match(html, /function canMoveSection\(sectionIndex\)/);
  assert.match(html, /if \(!advancedOrderMode && \(sectionIndex === 0 \|\| sectionIndex === lastIndex\)\) return false/);
});

test("発展モードと標準順への復帰操作を持つ", () => {
  assert.match(html, /function setAdvancedOrderMode\(enabled\)/);
  assert.match(html, /function restoreDefaultSectionOrder\(\)/);
});
```

- [ ] **Step 2: テストが新関数不足で失敗することを確認する**

Run: `node --test tests/reference-paragraph-order.test.js`

Expected: `canMoveSection`がないためFAIL。

- [ ] **Step 3: 振り分け完了条件を追加する**

```js
function isAssignmentComplete() {
  return seeds.length > 0 && seeds.every(s => typeof s.assign === "number" || s.assign === "off");
}
```

未振り分けカードがある間は、現在のカード振り分けだけを表示する。

- [ ] **Step 4: 移動可能範囲と並べ替え関数を追加する**

```js
function canMoveSection(sectionIndex) {
  const lastIndex = tmpl().sections.length - 1;
  if (!advancedOrderMode && (sectionIndex === 0 || sectionIndex === lastIndex)) return false;
  return true;
}

function moveSection(sectionIndex, delta) {
  const order = orderedSectionIndices();
  const from = order.indexOf(sectionIndex);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= order.length) return;
  const targetSection = order[to];
  if (!canMoveSection(sectionIndex) || !canMoveSection(targetSection)) return;
  [order[from], order[to]] = [order[to], order[from]];
  sectionOrder = order;
  onFieldEdit();
  renderStage3();
}

function setAdvancedOrderMode(enabled) {
  advancedOrderMode = Boolean(enabled);
  onFieldEdit();
  renderStage3();
}

function restoreDefaultSectionOrder() {
  sectionOrder = defaultSectionOrder();
  advancedOrderMode = false;
  orderReason = "";
  onFieldEdit();
  renderStage3();
}

function setOrderReason(value) {
  orderReason = value;
  onFieldEdit();
}
```

- [ ] **Step 5: `renderStage3()`の末尾へ順序パネルを追加する**

`isAssignmentComplete()`がtrueの場合だけ、以下を表示する。

- 標準文言：「カードをまとまりに分けられたね。次は、読む人に伝わる順番を考えてみよう。」
- `orderedSectionIndices()`順のまとまりカード
- 基本モードでは先頭と末尾に「固定」、中間に「前へ」「後ろへ」ボタン
- 発展チェック：「全部の順番を自分で決める」
- 「ひな形の順番にもどす」ボタン
- 順番理由の`select`

理由候補は設計書どおりの6項目とし、値は`time`、`important`、`cause`、`compare`、`reader`、`other`を使う。

- [ ] **Step 6: 型変更時に順序も初期化する**

`selectTemplate(i)`で型変更が確定した直後に`resetSectionOrder()`を呼ぶ。カード所属リセットと同じタイミングに限定し、型を再選択しただけでは実行しない。

- [ ] **Step 7: UIテストを成功させる**

Run: `node --test tests/reference-paragraph-order.test.js`

Expected: Task 1・2の全テストがPASS。

### Task 3: 表示順を「は」と完成文へ反映

**Files:**
- Modify: `参照コード/Index.html:1243-1276, 1326-1344`
- Modify: `tests/reference-paragraph-order.test.js`

- [ ] **Step 1: 表示順反映の失敗テストを書く**

```js
test("執筆欄と完成文は保存されたまとまり順を使う", () => {
  assert.match(html, /orderedSectionIndices\(\)\.forEach\(si =>/);
  assert.doesNotMatch(html, /tmpl\(\)\.sections\.forEach\(\(sec, si\) => \{\s*const d/);
});
```

- [ ] **Step 2: 現在の固定順実装に対してテストが失敗することを確認する**

Run: `node --test tests/reference-paragraph-order.test.js`

Expected: `orderedSectionIndices().forEach`がないためFAIL。

- [ ] **Step 3: `renderStage4()`を順序配列で描画する**

```js
orderedSectionIndices().forEach(si => {
  const sec = tmpl().sections[si];
  // 既存のセクション描画を維持
});
```

CSS色は元のセクション番号`c${si}`を維持する。並び替えても、まとまりの色・カード所属・`draftKey(si)`は変えない。

- [ ] **Step 4: `buildReport()`を順序配列で連結する**

```js
orderedSectionIndices().forEach(si => {
  const d = (drafts[draftKey(si)] || "").trim();
  if (d) parts.push(ensureSentenceEnd(d));
});
```

- [ ] **Step 5: 表示順テストを成功させる**

Run: `node --test tests/reference-paragraph-order.test.js`

Expected: Task 1〜3がPASS。

### Task 4: カード本文を文章欄へ挿入

**Files:**
- Modify: `参照コード/Index.html:1243-1301`
- Modify: `tests/reference-paragraph-order.test.js`

- [ ] **Step 1: カード挿入の失敗テストを書く**

```js
test("カード本文を対応する下書き欄のカーソル位置へ挿入する", () => {
  assert.match(html, /function insertSeedIntoDraft\(seedIndex, sectionIndex\)/);
  assert.match(html, /document\.activeElement === ta/);
  assert.match(html, /ta\.selectionStart/);
  assert.match(html, /ta\.selectionEnd/);
  assert.match(html, /seeds\[seedIndex\]\.used = true/);
});
```

- [ ] **Step 2: テストが新関数不足で失敗することを確認する**

Run: `node --test tests/reference-paragraph-order.test.js`

Expected: `insertSeedIntoDraft`がないためFAIL。

- [ ] **Step 3: チップをボタンへ変更する**

`renderStage4()`で、カードを次のボタンとして描画する。

```js
html += '<button type="button" class="chip seed-insert-btn ' +
  (s.used ? "used" : "unused") +
  '" onclick="insertSeedIntoDraft(' + i + ',' + si + ')"' +
  ' title="このカードを文章に入れる">' +
  groupLabelHtml(s) + escapeHtml(s.text) +
  '<span class="seed-insert-label">文章に入れる</span></button>';
```

タッチ対象を44px程度確保し、使用済みでも押せる見た目にする。既存の`toggleUsed()`は削除し、使用状態は挿入成功時だけ更新する。

- [ ] **Step 4: カーソル位置への挿入関数を実装する**

```js
function insertSeedIntoDraft(seedIndex, sectionIndex) {
  const seed = seeds[seedIndex];
  const ta = document.getElementById("draft_s" + sectionIndex);
  if (!seed || seed.assign !== sectionIndex || !ta) return;

  const hasActiveCaret = document.activeElement === ta && Number.isInteger(ta.selectionStart);
  const start = hasActiveCaret ? ta.selectionStart : ta.value.length;
  const end = hasActiveCaret && Number.isInteger(ta.selectionEnd) ? ta.selectionEnd : start;
  const before = ta.value.slice(0, start);
  const after = ta.value.slice(end);
  const needsBreakBefore = before && !/\s$/.test(before);
  const needsBreakAfter = after && !/^\s/.test(after);
  const inserted = (needsBreakBefore ? "\n" : "") + seed.text + (needsBreakAfter ? "\n" : "");

  ta.value = before + inserted + after;
  drafts[draftKey(sectionIndex)] = ta.value;
  seed.used = true;
  onFieldEdit();
  renderStage4();

  const refreshed = document.getElementById("draft_s" + sectionIndex);
  if (refreshed) {
    const caret = start + inserted.length;
    refreshed.focus();
    refreshed.setSelectionRange(caret, caret);
  }
  showToast("カードを文章に入れたよ。つながるように書き直そう！");
}
```

- [ ] **Step 5: 挿入テストを成功させる**

Run: `node --test tests/reference-paragraph-order.test.js`

Expected: Task 1〜4がPASS。

### Task 5: 保存・復元と旧作品互換

**Files:**
- Modify: `参照コード/Index.html:1470-1556`
- Modify: `tests/reference-paragraph-order.test.js`

- [ ] **Step 1: 保存互換の失敗テストを書く**

```js
test("順序状態をversion 4として保存・復元する", () => {
  assert.match(html, /version: 4/);
  assert.match(html, /sectionOrder: sectionOrder/);
  assert.match(html, /advancedOrderMode: advancedOrderMode/);
  assert.match(html, /orderReason: orderReason/);
  assert.match(html, /normalizeSectionOrder\(state\.sectionOrder\)/);
});
```

- [ ] **Step 2: version 3の現状に対して失敗することを確認する**

Run: `node --test tests/reference-paragraph-order.test.js`

Expected: `version: 4`がないためFAIL。

- [ ] **Step 3: `collectState()`へ状態を追加する**

```js
version: 4,
sectionOrder: orderedSectionIndices(),
advancedOrderMode: advancedOrderMode,
orderReason: orderReason,
```

- [ ] **Step 4: `restoreState()`で型確定後に復元する**

```js
sectionOrder = normalizeSectionOrder(state.sectionOrder);
advancedOrderMode = Boolean(state.advancedOrderMode);
orderReason = typeof state.orderReason === "string" ? state.orderReason : "";
```

旧作品では`state.sectionOrder`がないため、`normalizeSectionOrder()`が標準順を返す。既存のversion 1〜3移行処理は変更しない。

- [ ] **Step 5: 新規作品・ログアウト・型変更時の初期化を追加する**

`startNewWork()`、`doLogout()`、新規作品の初期状態、`selectTemplate()`へ`resetSectionOrder()`を追加する。ログイン直後の型プリセット適用後にも標準順が作られることを確認する。

- [ ] **Step 6: 保存互換テストを成功させる**

Run: `node --test tests/reference-paragraph-order.test.js`

Expected: Task 1〜5がPASS。

### Task 6: 版番号・総合検証・GAS手動確認

**Files:**
- Modify: `参照コード/Code.gs:9`
- Test: `tests/*.test.js`

- [ ] **Step 1: 配布版番号を更新する**

`CODE_VERSION`を現在の`2.0.1`から`2.1.0`へ更新する。保存API・認証・シート処理は変更しない。

- [ ] **Step 2: 全回帰テストを実行する**

Run:

```powershell
node --test tests/*.test.js
```

Expected: 全件PASS、fail 0。

- [ ] **Step 3: GASとHTMLスクリプトの構文を検査する**

Run:

```powershell
$node = "C:\Users\ken1k\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
Get-Content -Raw -Encoding UTF8 "参照コード\Code.gs" | & $node -e "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>new Function(s))"
```

Run:

```powershell
$html = Get-Content -Raw -Encoding UTF8 "参照コード\Index.html"
$matches = [regex]::Matches($html, '<script(?:\s[^>]*)?>([\s\S]*?)</script>', 'IgnoreCase')
$script = ($matches | ForEach-Object { $_.Groups[1].Value }) -join "`n"
$script | & $node -e "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>new Function(s))"
```

Expected: 両コマンドとも終了コード0。

- [ ] **Step 4: 差分とスコープを確認する**

Run:

```powershell
git diff --check
git status --short
```

Expected: 空白エラーなし。実装対象は`参照コード/Index.html`、`参照コード/Code.gs`、テストファイルのみ。

- [ ] **Step 5: Apps Scriptテスト環境へ貼り付けて手動確認する**

本番ではなくテスト用デプロイで、次を確認する。

1. 既存のversion 3作品が標準順で開く。
2. 全カードを振り分けるまで順序パネルが出ない。
3. 基本モードでは先頭・末尾が動かず、中間だけ動く。
4. 発展モードでは全まとまりが動く。
5. 「ひな形の順番にもどす」で標準順へ戻る。
6. 順序が「は」の入力欄と「はな」の完成文へ反映される。
7. カーソル位置でカードを押すと、同じまとまりの文章欄へ本文だけが入る。
8. 保存、再読込後も順序・発展モード・理由・使用済み表示が残る。
9. ログイン、作品切替、自動保存、本人トークンが従来どおり動く。

- [ ] **Step 6: ロールバック方法を確認する**

問題がある場合はApps Scriptの新規デプロイを本番へ反映せず、既存デプロイを維持する。スプレッドシート列は変わらないため、データ側のロールバック作業は不要。
