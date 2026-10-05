/* ============================================================
   Prepvela — mock.js
   模擬テスト: リーディング（60分）/ リスニング（音声つき）
   ＋ 技能別の練習ドリル（語彙のみ / 長文読解のみ / リスニング各パート）
   採点 → 復習ノート登録 → 結果表示（Practice Score つき）
   ============================================================ */
"use strict";

let mockSession = null; // null = chooser

/* Practice scopes. "all" is the whole set under a timer. The others are
   drills for one skill, so the dashboard plan can link to the skill it names
   instead of dropping the learner into the whole set. */
const READ_SCOPES = {
  all: { key: "all", parts: [1, 2, 3], label: "リーディング模擬", sub: "全問 / 60分", timed: 60 * 60 },
  vocab: { key: "vocab", parts: [1], label: "語彙練習", sub: "Part 1 の語彙 / 時間は自由", timed: 0 },
  long: { key: "long", parts: [2, 3], label: "長文読解練習", sub: "読解パート / 時間は自由", timed: 0 },
};
const LS_SCOPES = {
  all: { key: "all", part: null, label: "リスニング模擬", sub: "全問 / 約30分" },
  "1": { key: "1", part: 1, label: "リスニング 第1部", sub: "会話と短い発話" },
  "2": { key: "2", part: 2, label: "リスニング 第2部", sub: "短い講義" },
  "3": { key: "3", part: 3, label: "リスニング 第3部", sub: "長い講義" },
};
const readScope = () => READ_SCOPES[(mockSession && mockSession.scope) || "all"] || READ_SCOPES.all;
const lsScope = () => LS_SCOPES[String((mockSession && mockSession.scope) || "all")] || LS_SCOPES.all;

/* Scopes read the parts the current session selected, out of the store's
   shared helpers. Both return [] rather than throwing when a set leaves a
   part out or ships it empty, so every screen below can offer an empty
   state instead of an exception. */
const readParts = (ex) => readingParts(ex, readScope().parts);
const readItems = (ex) => partItems(readParts(ex));
const lsParts = (ex) => listeningParts(ex, lsScope().part);
const lsItems = (ex) => partItems(lsParts(ex));
const countReading = (ex) => partItems(readingParts(ex, [1, 2, 3])).length;
const countListening = (ex) => partItems(listeningParts(ex, null)).length;

/* A set carries no exam date — the authored parts have none, so any date shown
   here would be one this app made up. The card states a fact the learner can
   check instead: every listening clip is bundled, so it plays with no network. */
const bundledAudio = (ex) => {
  const items = partItems(listeningParts(ex, null));
  const n = items.filter((it) => it.audio).length;
  return items.length && n === items.length ? `音声 ${n}問を同梱` : "";
};

/* One line that states what a set actually contains, instead of a hardcoded
   question count that a partial bank would contradict. */
const scopeSub = (mode, scopeKey, ex) => {
  const items = mode === "reading"
    ? partItems(readingParts(ex, (READ_SCOPES[scopeKey] || READ_SCOPES.all).parts))
    : partItems(listeningParts(ex, (LS_SCOPES[scopeKey] || LS_SCOPES.all).part));
  const n = items.length;
  if (scopeKey === "all") return mode === "reading" ? `全${n}問 / 60分` : `全${n}問 / 約30分`;
  return `${n}問 / 時間は自由`;
};

const MockView = {
  /* ------------------------------------------------ entry */
  render(root, query) {
    // An explicit deep link (#/mock?act=reading&exam=...) is a deliberate user
    // action, so it wins over a session left live by an earlier visit.
    const act = query && query.act;
    if ((act === "reading" || act === "listening") && getSet(query.exam)) {
      const scope = String((query && query.scope) || "all");
      const valid = act === "reading" ? READ_SCOPES[scope] : LS_SCOPES[scope];
      mockSession = {
        mode: act,
        examId: query.exam,
        scope: valid ? scope : "all",
        answers: {},
        done: false,
      };
      return act === "reading" ? this.renderReading(root) : this.renderListening(root);
    }
    // otherwise: a finished session is cleared so the chooser shows;
    // live sessions (and direct submit calls) keep rendering below.
    if (mockSession && mockSession.done) mockSession = null;
    if (mockSession && mockSession.mode === "reading") return this.renderReading(root);
    if (mockSession && mockSession.mode === "listening") return this.renderListening(root);
    this.renderChooser(root);
  },

  renderChooser(root) {
    const startBtn = (ex, act, scope, label, cls) => `
      <button class="btn ${cls}" data-act="${act}" data-scope="${scope}" data-exam="${ex.id}">${h(label)}</button>`;

    if (!SETS.length) {
      root.innerHTML = `
        <div class="page-head">
          <div>
            <h1>模擬テスト・練習</h1>
            <div class="sub">このアプリの練習セット。</div>
          </div>
        </div>
        <div class="card">
          <div class="empty">
            <div class="e-big">まだセットが登録されていません</div>
            練習セットのデータが見つかりません。アプリを入れ直してください。
          </div>
        </div>`;
      return;
    }

    const cards = SETS.map((ex) => {
      const readN = countReading(ex);
      const listN = countListening(ex);
      const audioNote = bundledAudio(ex);
      const partCount = (mode, partNo) =>
        partItems(mode === "reading" ? readingParts(ex, [partNo]) : listeningParts(ex, partNo)).length;
      // a drill for an absent part would be a dead button, so it is not offered
      const drills = [
        ["reading", "vocab", "語彙練習"],
        ["reading", "long", "長文読解練習"],
        ["listening", "1", "リスニング 第1部"],
        ["listening", "2", "リスニング 第2部"],
        ["listening", "3", "リスニング 第3部"],
      ].filter(([mode, scope]) => {
        if (mode === "reading") return partItems(readingParts(ex, READ_SCOPES[scope].parts)).length > 0;
        return partItems(listeningParts(ex, Number(scope))).length > 0;
      });

      return `
      <div class="card exam-card">
        <div class="exam-top">
          <div>
            <div class="exam-title">${h(ex.label)}</div>
            ${audioNote ? `<div class="exam-date">${h(audioNote)}</div>` : ""}
          </div>
          <span class="badge acc">${readN}問 + ${listN}問</span>
        </div>

        <div class="drill-head">全問つき（制限時間あり）</div>
        <div class="exam-actions">
          ${readN ? startBtn(ex, "reading", "all", "リーディング模擬（60分）", "primary") : ""}
          ${listN ? startBtn(ex, "listening", "all", "リスニング模擬（約30分）", "soft") : ""}
          ${ex.writing ? `<button class="btn" data-act="writing" data-exam="${ex.id}">ライティング演習へ</button>` : ""}
        </div>

        ${drills.length ? `
        <div class="drill-head">練習（1技能だけ・時間制限なし）</div>
        <div class="exam-actions drills">
          ${drills.map(([mode, scope, label]) => startBtn(ex, mode, scope, label, "")).join("")}
        </div>` : ""}
        <div class="hint">
          ${readN ? `語彙練習=${partCount("reading", 1)}問 / 長文読解練習=${partItems(readingParts(ex, READ_SCOPES.long.parts)).length}問（パッセージ付き） / ` : ""}
          ${listN ? `リスニング第1部=${partCount("listening", 1)}問・第2部=${partCount("listening", 2)}問・第3部=${partCount("listening", 3)}問。` : ""}
          練習も採点され、誤答は復習ノートに送られます。
        </div>
      </div>`;
    }).join("");

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>模擬テスト・練習</h1>
          <div class="sub">全問を制限時間つきで解く練習と、1技能だけの練習。採点結果は自動で復習ノートに登録されます。</div>
        </div>
      </div>

      <div class="notice mb">
        <b>時間配分:</b> リーディングは <b>60分</b>、リスニングは <b>約35分</b>、
        ライティングは <b>30分</b>。リーディングとライティングを合わせると 90分です。
        リスニングは各問題の音声を1項目ずつ再生します（聴き直し可の練習モード）。音声ファイルが同梱されていない場合はスクリプトを読み上げます。
        <b>「練習」は時間を切らず、欲しい技能だけを短い単位で繰り返せます。</b>
      </div>

      <div class="grid grid-3">${cards}</div>

      <div class="card mt">
        <h2>スコアの見かた</h2>
        <div class="notice">
          結果は <b>Practice Score</b>（正答率、0〜100の小数1桁）と、その値だけで決まる
          <b>Readiness</b>（${h(PRACTICE_SCORE.BANDS.low)} ${PRACTICE_SCORE.BUILDING}未満 /
          ${h(PRACTICE_SCORE.BANDS.building)} ${PRACTICE_SCORE.BUILDING}以上${PRACTICE_SCORE.READY}未満 /
          ${h(PRACTICE_SCORE.BANDS.ready)} ${PRACTICE_SCORE.READY}以上）で表します。
          結果画面のパート別テーブルも同じ数値です。
        </div>
        ${practiceNoteHTML()}
      </div>`;

    $$("button[data-act]", root).forEach((b) => {
      b.addEventListener("click", () => {
        const examId = b.dataset.exam;
        if (b.dataset.act === "writing") {
          location.hash = `#/writing?exam=${examId}`;
          return;
        }
        mockSession = {
          mode: b.dataset.act,
          examId,
          scope: b.dataset.scope || "all",
          answers: {},
          done: false,
        };
        this.render(root);
      });
    });
  },

  /* ------------------------------------------------ reading */
  startReadingTimer(root) {
    const TOTAL = readScope().timed || 60 * 60;
    const startAt = mockSession.remaining != null ? mockSession.remaining : TOTAL;
    const tick = (left) => {
      mockSession.remaining = left;
      const el = $("#rd-timer", root);
      if (!el) return;
      el.textContent = fmtClock(left);
      el.classList.toggle("warn", left <= 600 && left > 120);
      el.classList.toggle("bad", left <= 120);
    };
    mockSession.timer = startCountdown(startAt, tick, () => this.submit(root, true));
    const t = mockSession.timer;
    ViewCleanup.add(() => {
      if (mockSession && mockSession.timer === t) {
        t.stop();
        mockSession.timer = null;
      }
    });
  },

/* An empty scope is a state, not a crash: this set leaves Part 2 and
      the reading drills short of questions, and a deep link can name a part the
      bank does not carry. Say what is missing and offer the way out. */
  renderEmpty(root, kind, msg) {
    root.innerHTML = `
      <div class="session-bar">
        <div>
          <div class="s-title">${h(kind)}</div>
          <div class="s-sub">このScopeには問題がありません</div>
        </div>
        <div class="spacer"></div>
        <button class="btn primary" id="em-back">模擬テストトップへ</button>
      </div>
      <div class="card">
        <div class="empty">
          <div class="e-big">${h(msg)}</div>
          ほかのセットか技能を選んでください。
          <div class="mt"><a class="btn soft" href="#/dashboard">ホームに戻る</a></div>
        </div>
      </div>`;
    $("#em-back", root).addEventListener("click", () => {
      mockSession = null;
      this.render(root);
    });
  },

  renderReading(root) {
    const ex = getSet(mockSession.examId);
    const scope = readScope();
    const parts = readParts(ex);
    if (!parts.length) {
      return this.renderEmpty(root, scope.label, "リーディング問題がこのScopeにはありません");
    }

    const qCard = (item, extraClass = "") => {
      const chosen = mockSession.answers[item.no];
      return `
        <div class="qcard ${extraClass}" id="q-${item.no}">
          <span class="q-no">Q${item.no}</span>
          <div class="q-stem">${h(item.stem)}</div>
          <div class="opts">
            ${(item.options || []).map((o, i) => `
              <label class="opt ${chosen === i ? "selected" : ""}">
                <input type="radio" name="q${item.no}" value="${i}" ${chosen === i ? "checked" : ""}>
                <span class="o-no">${i + 1}</span><span>${h(o)}</span>
              </label>`).join("")}
          </div>
        </div>`;
    };

    // passage → questions split (2 passages: 3+3 / 3+4)
    const splitByPassages = (items, k) => {
      const base = Math.floor(items.length / k);
      const out = [];
      let i = 0;
      for (let j = 0; j < k; j++) {
        const size = base + (j >= k - (items.length - base * k) ? 1 : 0);
        out.push(items.slice(i, i + size));
        i += size;
      }
      return out;
    };

    const passageBlock = (p) => `
      <div class="passage mb">
        <h3>${h(p.title)}</h3>
        <div class="p-text">${p.text.split(/\n\n+/).map((t) => `<p>${h(t)}</p>`).join("")}</div>
      </div>`;

    const LEGEND = {
      1: "Part 1 — 語彙問題: 空欄に最も適切な語句を選択",
      2: "Part 2 — 空所補充",
      3: "Part 3 — 読解問題",
    };
    // one fieldset per part, keeping the passage in front of the questions that
    // depend on it
    const body = parts.map((p) => {
      const items = p.items || [];
      const nos = items.map((it) => it.no);
      const label = `${LEGEND[p.part]}（Q${nos[0]}–${nos[nos.length - 1]}）`;
      if (!items.length) {
        return `<fieldset class="sort-group"><legend>${h(label)}</legend>
          <div class="hint">このパートには問題が含まれていません</div></fieldset>`;
      }
      if (!p.passages || !p.passages.length) {
        return `<fieldset class="sort-group"><legend>${h(label)}</legend>${items.map((it) => qCard(it)).join("")}</fieldset>`;
      }
      const groups = splitByPassages(items, p.passages.length);
      return p.passages
        .map((passage, i) => `
          ${passageBlock(passage)}
          <fieldset class="sort-group">
            <legend>${h(label)}</legend>
            ${groups[i].map((it) => qCard(it)).join("")}
          </fieldset>`)
        .join("");
    }).join("");

    const allItems = readItems(ex);
    const navBtns = allItems.map((it) =>
      `<button data-go="${it.no}" class="${mockSession.answers[it.no] != null ? "answered" : ""}">${it.no}</button>`
    ).join("");

    root.innerHTML = `
      <div class="session-bar">
        <div>
          <div class="s-title">${h(scope.label)} — ${h(ex.label)}</div>
          <div class="s-sub">${h(scopeSub("reading", (mockSession && mockSession.scope) || "all", ex))} / 全${allItems.length}問</div>
        </div>
        <div class="spacer"></div>
        ${scope.timed
          ? `<div class="timer" id="rd-timer">${fmtClock(scope.timed)}</div>`
          : `<span class="badge" title="練習は時間制限なし">時間制限なし</span>`}
        <button class="btn primary" id="rd-submit">採点する</button>
        <button class="btn ghost sm" id="rd-abort">中止</button>
      </div>

      <div class="card tight mb">
        <div class="qnav">${navBtns}</div>
      </div>

      ${body}

      <div class="btn-row mt">
        <button class="btn primary big" id="rd-submit2">採点する</button>
        <span class="hint">未解答の問題があっても採点できます</span>
      </div>`;

    if (scope.timed) this.startReadingTimer(root);

    onRoot(root, "change", (e) => {
      if (e.target.name && e.target.name.startsWith("q")) {
        const no = Number(e.target.name.slice(1));
        mockSession.answers[no] = Number(e.target.value);
        const card = e.target.closest(".qcard");
        $$(".opt", card).forEach((o, i) => o.classList.toggle("selected", i === Number(e.target.value)));
        const btn = $(`.qnav button[data-go="${no}"]`, root);
        if (btn) btn.classList.add("answered");
      }
    });
    onRoot(root, "click", (e) => {
      const go = e.target.closest("[data-go]");
      if (go) {
        const el = $(`#q-${go.dataset.go}`, root);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          $$(".qcard", root).forEach((c) => (c.style.outline = ""));
          el.style.outline = "2px solid var(--accent)";
          setTimeout(() => (el.style.outline = ""), 1200);
        }
      }
    });
    $("#rd-submit", root).addEventListener("click", () => this.submit(root, false));
    $("#rd-submit2", root).addEventListener("click", () => this.submit(root, false));
    $("#rd-abort", root).addEventListener("click", () => {
      if (confirm("このセッションを中止しますか？解答は保存されません。")) {
        mockSession.timer && mockSession.timer.stop();
        mockSession = null;
        this.render(root);
      }
    });
  },

  /* ------------------------------------------------ listening */
  renderListening(root) {
    const ex = getSet(mockSession.examId);
    const scope = lsScope();
    const locked = !!scope.part; // a part drill: no switching, no 35-min cutoff
    const parts = lsParts(ex);
    if (!parts.length) {
      return this.renderEmpty(root, scope.label, "リスニング問題がこのScopeにはありません");
    }
    /* A part may exist and still carry no items, so pick from the ones that do.
       A deep link may also name a part this set does not carry at all. */
    const withItems = parts.filter((p) => (p.items || []).length);
    if (!withItems.length) {
      return this.renderEmpty(root, scope.label, "リスニング問題がこのScopeにはありません");
    }
    let cur = locked ? scope.part : (mockSession.part || withItems[0].part);
    if (!withItems.some((p) => p.part === cur)) cur = withItems[0].part;
    const curPart = parts.find((p) => p.part === cur);
    const curItems = partItems(curPart ? [curPart] : []);
    const scopeTotal = partItems(parts).length;

    /* One clip per item, played from that item's own card. The note lives in
       the card so the reason for a different voice is next to the control that
       caused it, not in a banner at the top of the page. */
    const audioRow = (item) => `
      <div class="ls-audio">
        <button class="btn sm soft" data-ls-play="${item.no}"
          aria-label="No.${item.no} の音声を再生">音声を再生</button>
        <span class="hint" id="ls-note-${item.no}" role="status" aria-live="polite"></span>
      </div>`;

    const qCard = (item) => {
      const chosen = mockSession.answers[item.no];
      return `
        <div class="qcard" id="q-${item.no}">
          <span class="q-no">No.${item.no}</span>
          ${item.group ? `<span class="badge" style="margin-left:6px">Group ${h(item.group)}</span>` : ""}
          ${item.situation ? `<div class="q-group" style="margin-top:8px">${h(item.situation)}</div>` : ""}
          <div class="q-stem">${h(item.question || "Choose the best answer.")}</div>
          ${audioRow(item)}
          <div class="opts">
            ${(item.options || []).map((o, i) => `
              <label class="opt ${chosen === i ? "selected" : ""}">
                <input type="radio" name="q${item.no}" value="${i}" ${chosen === i ? "checked" : ""}>
                <span class="o-no">${i + 1}</span><span>${h(o)}</span>
              </label>`).join("")}
          </div>
        </div>`;
    };

    const partBtns = withItems.map((p) => `
      <button class="chip ${p.part === cur ? "on" : ""}" data-part="${p.part}">
        Part ${p.part}（No.${p.items[0].no}–${p.items[p.items.length - 1].no}）
      </button>`).join("");

    root.innerHTML = `
      <div class="session-bar">
        <div>
          <div class="s-title">${h(scope.label)} — ${h(ex.label)}</div>
          <div class="s-sub">${h(scopeSub("listening", (mockSession && mockSession.scope) || "all", ex))} / 全${scopeTotal}問${locked ? "。時間は自由（35分の自動採点はしません）" : "。35分で自動採点。"}</div>
        </div>
        <div class="spacer"></div>
        <div class="timer" id="ls-timer">00:00</div>
        <button class="btn primary" id="ls-submit">採点する</button>
        <button class="btn ghost sm" id="ls-abort">中止</button>
      </div>

      ${locked ? "" : `<div class="filter-row">${partBtns}</div>`}

      <div class="notice mb">
        問題はPart ${cur}の順に1つずつ再生します。各問題の「音声を再生」を押すと、その問題の音声を個別に聞けます（聴き直し可）。
        音声ファイルが同梱されていない場合は、その問題のスクリプトを読み上げます。
      </div>

      <div class="card tight mb">
        <div class="qnav">${parts.map((p) => (p.items || []).map((it) =>
          `<button data-go="${it.no}" class="${mockSession.answers[it.no] != null ? "answered" : ""}">${it.no}</button>`
        ).join("")).join("")}</div>
      </div>

      ${curItems.map((it) => qCard(it)).join("")}

      <div class="btn-row mt">
        ${!locked && withItems.some((p) => p.part === cur - 1) ? `<button class="btn" data-nav="${cur - 1}">← Part ${cur - 1}</button>` : ""}
        ${!locked && withItems.some((p) => p.part === cur + 1) ? `<button class="btn soft" data-nav="${cur + 1}">Part ${cur + 1} →</button>` : ""}
        <button class="btn primary" id="ls-submit2">採点する</button>
        <span class="hint">音声が流れなくても問題文だけでも解答できます</span>
      </div>`;

    // count-up timer, auto-submit at 35 min
    if (!mockSession.timer) {
      let sec = mockSession.elapsedSec || 0;
      const handle = setInterval(() => {
        sec++;
        mockSession.elapsedSec = sec;
        const el = $("#ls-timer", root);
        if (el) {
          el.textContent = fmtClock(sec);
          el.classList.toggle("warn", sec >= 25 * 60);
          el.classList.toggle("bad", sec >= 33 * 60);
        }
        if (sec >= 35 * 60 && !lsScope().part) this.submit(root, true);
      }, 1000);
      mockSession.timer = { handle };
      ViewCleanup.add(() => {
        if (mockSession && mockSession.timer && mockSession.timer.handle === handle) {
          clearInterval(handle);
          mockSession.timer = null;
        }
      });
    } else {
      // returning from another route: show elapsed time immediately
      const el = $("#ls-timer", root);
      if (el) el.textContent = fmtClock(mockSession.elapsedSec || 0);
    }

    /* Per-item playback. `listening` decides file vs. script and reports what
       happened; the note and the button label follow that state. Nothing is
       fetched from the network: the clip path in the bank is relative.

       Registering the stop per render (rather than per click) means the audio
       also dies on a route change, on 中止, and when the part changes. */
    ViewCleanup.add(() => listening.stop());

    const NOTE = {
      playing: "再生中 — もう一度押すと停止します",
      reading: "音声ファイルが同梱されていません。スクリプトを読み上げています",
      unavailable: "この問題は音声でも読み上げでも再生できません。問題文と選択肢から答えてください",
      blocked: "ブラウザが自動再生を止めています。画面を1回クリックすると鳴ります",
    };
    const NOTE_CLS = { playing: "", reading: "sound-warn", unavailable: "sound-warn", blocked: "sound-warn" };
    $$("[data-ls-play]", root).forEach((b) => {
      b.addEventListener("click", (ev) => {
        ev.stopPropagation(); // the qcard click handler must not fight this
        const no = b.dataset.lsPlay;
        const item = curItems.find((it) => String(it.no) === String(no));
        if (!item) return;
        const note = $(`#ls-note-${no}`, root);
        const setNote = (state) => {
          if (note) {
            note.textContent = NOTE[state] || "";
            note.className = `hint ${NOTE_CLS[state] || ""}`.trim();
          }
          const playing = state === "playing";
          b.textContent = playing ? "停止" : "音声を再生";
          b.setAttribute("aria-label", playing ? `No.${no} の音声を停止` : `No.${no} の音声を再生`);
        };
        if (b.dataset.playing === "1") {
          listening.stop();
          b.dataset.playing = "";
          setNote("");
          return;
        }
        listening.play(item, (state) => {
          b.dataset.playing = state === "playing" ? "1" : "";
          setNote(state);
        });
      });
    });

    $$("[data-part]", root).forEach((b) =>
      b.addEventListener("click", () => {
        mockSession.part = Number(b.dataset.part);
        this.renderListening(root);
      })
    );
    $$("[data-nav]", root).forEach((b) =>
      b.addEventListener("click", () => {
        mockSession.part = Number(b.dataset.nav);
        this.renderListening(root);
      })
    );

    onRoot(root, "change", (e) => {
      if (e.target.name && e.target.name.startsWith("q")) {
        const no = Number(e.target.name.slice(1));
        mockSession.answers[no] = Number(e.target.value);
        const card = e.target.closest(".qcard");
        $$(".opt", card).forEach((o, i) => o.classList.toggle("selected", i === Number(e.target.value)));
        const btn = $(`.qnav button[data-go="${no}"]`, root);
        if (btn) btn.classList.add("answered");
      }
    });
    onRoot(root, "click", (e) => {
      const go = e.target.closest("[data-go]");
      if (go) {
        const el = $(`#q-${go.dataset.go}`, root);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });

    $("#ls-submit", root).addEventListener("click", () => this.submit(root, false));
    $("#ls-submit2", root).addEventListener("click", () => this.submit(root, false));
    $("#ls-abort", root).addEventListener("click", () => {
      if (confirm("このセッションを中止しますか？解答は保存されません。")) {
        clearInterval(mockSession.timer.handle);
        mockSession = null;
        this.render(root);
      }
    });
  },

  /* ------------------------------------------------ grading */
  submit(root, timedOut) {
    if (!mockSession || mockSession.done) return;
    const mode = mockSession.mode;
    const ex = getSet(mockSession.examId);
    const items = mode === "reading" ? readItems(ex) : lsItems(ex);
    // grading nothing would divide by zero and print "0 / 0"
    if (!items.length) {
      mockSession = null;
      return this.renderEmpty(root, mode === "reading" ? "リーディング" : "リスニング", "採点できる問題がありません");
    }

    if (!timedOut) {
      const unanswered = items.filter((it) => mockSession.answers[it.no] == null).length;
      if (unanswered > 0 &&
          !confirm(`未解答が ${unanswered} 問あります。このまま採点しますか？`)) {
        return;
      }
    }
    if (timedOut) alert("時間終了です。自動採点します。");

    if (mockSession.timer) {
      if (mode === "reading" && mockSession.timer.stop) mockSession.timer.stop();
      if (mode === "listening" && mockSession.timer.handle) clearInterval(mockSession.timer.handle);
      mockSession.timer = null;
    }

    let correct = 0;
    const review = [];
    for (const it of items) {
      const chosen = mockSession.answers[it.no];
      const ok = chosen != null && chosen === ansIdx(it);
      if (ok) correct++;
      review.push({ item: it, chosen, ok });
      if (!ok) {
        Store.addWrong({
          section: mode, examId: ex.id, no: it.no,
          stem: it.question ? `${it.situation ? it.situation + " " : ""}${it.question}` : it.stem,
          options: it.options || [], answer: it.answer, chosen,
          why: Store.explain(ex.id, mode, it),
        });
      }
    }

    Store.addAttempt({ type: mode, examId: ex.id, correct, total: items.length,
      meta: { timedOut: !!timedOut, date: todayStr() } });

    mockSession.done = true;
    mockSession.result = { correct, total: items.length, review };
    mockSession = Object.assign(mockSession, mockSession.result);
    this.renderResult(root);
    window.scrollTo(0, 0);
  },

  /* ------------------------------------------------ result */
  renderResult(root) {
    const s = mockSession;
    const ex = getSet(s.examId);
    const isR = s.mode === "reading";
    const scope = isR ? readScope() : lsScope();
    const parts = isR ? readParts(ex) : lsParts(ex);
    const isDrill = (s.scope || "all") !== "all";
    const total = s.total || 1; // submit() refuses an empty scope, so this is 0-safe
    const score = practiceScore(s.correct, total);
    const band = readiness(score);
    const wrongN = s.total - s.correct;

    const verdict = band === "ready"
      ? `<span style="color:var(--ok)">Readiness ${h(PRACTICE_SCORE.BANDS.ready)} — ${PRACTICE_SCORE.READY}以上</span>`
      : band === "building"
        ? `<span style="color:var(--warn)">Readiness ${h(PRACTICE_SCORE.BANDS.building)} — ${PRACTICE_SCORE.BUILDING}以上。あと${Math.ceil((PRACTICE_SCORE.READY - score) / 10) * 10}で ${h(PRACTICE_SCORE.BANDS.ready)}</span>`
        : `<span style="color:var(--bad)">Readiness ${h(PRACTICE_SCORE.BANDS.low)} — ${PRACTICE_SCORE.BUILDING}まであと${Math.ceil((PRACTICE_SCORE.BUILDING - score) / 10) * 10}</span>`;

    const partRows = parts.filter((p) => (p.items || []).length).map((p) => {
      const its = p.items || [];
      const c = its.filter((it) => s.answers[it.no] === ansIdx(it)).length;
      return `<tr><td>Part ${p.part}（${its.length}問）</td>
        <td class="num">${c} / ${its.length}</td>
        <td class="num">${fmtPractice(practiceScore(c, its.length))}%</td></tr>`;
    }).join("");

    const reviewHTML = s.review.map(({ item, chosen, ok }) => {
      const script = item.script && item.script.length ? `
        <details style="margin-top:8px">
          <summary style="cursor:pointer;font-size:12.5px;color:var(--accent)">スクリプトを見る</summary>
          <div class="script mt-s">
            ${item.script.map((l) => l.speaker
              ? `<div class="line"><span class="spk">${h(l.speaker)}</span>${h(l.text)}</div>`
              : `<div class="line narr">${h(l.text)}</div>`).join("")}
          </div>
        </details>` : "";
      return `
        <details class="review" ${ok ? "" : "open"}>
          <summary>
            <span class="badge ${ok ? "ok" : "bad"}">${ok ? "正解" : "不正解"}</span>
            <span class="mono">${isR ? "Q" : "No."}${item.no}</span>
            <span class="muted" style="font-weight:500">${h((item.stem || item.question || "").slice(0, 60))}${(item.stem || item.question || "").length > 60 ? "…" : ""}</span>
          </summary>
          <div class="rev-body">
            ${item.stem ? `<div class="q-stem" style="margin-top:0">${h(item.stem)}</div>` : ""}
            ${item.question && !item.stem ? `<div class="q-stem" style="margin-top:0">${h(item.situation ? item.situation + " " : "")}${h(item.question)}</div>` : ""}
            <div class="opts">
              ${(item.options || []).map((o, i) => `
                <div class="opt ${i === ansIdx(item) ? "correct" : ""} ${i === chosen && !ok ? "wrong" : ""} ${i !== ansIdx(item) && i !== chosen ? "dim" : ""}">
                  <span class="o-no">${i + 1}</span><span>${h(o)}</span>
                </div>`).join("")}
            </div>
            ${script}
            ${explainHTML(Store.explain(ex.id, isR ? "reading" : "listening", item), ansIdx(item))}
          </div>
        </details>`;
    }).join("");

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>${h(scope.label)} — 結果</h1>
          <div class="sub">${h(ex.label)}${s.meta && s.meta.timedOut ? " / 時間終了" : ""}${isDrill ? " / 練習モード" : ""}</div>
        </div>
        <div class="btn-row">
          <a class="btn" href="#/notebook">復習ノートへ（${wrongN}問登録）</a>
          <button class="btn soft" id="retry">もう一度</button>
          <button class="btn primary" id="to-chooser">模擬テストトップ</button>
        </div>
      </div>

      <div class="grid grid-side mb">
        <div class="card">
          <div class="result-hero">
            <div class="label">正答数（全${s.total}問中）</div>
            <div class="score">${s.correct}<small> / ${s.total}</small></div>
            <div class="verdict">${verdict}</div>
          </div>
          <table class="score-table">
            <thead><tr><th>パート</th><th class="right">正答</th><th class="right">Practice Score</th></tr></thead>
            <tbody>${partRows}</tbody>
          </table>
        </div>
        <div class="card">
          <h2>Practice Score</h2>
          <div class="list-line"><span class="ll-main">正答率</span><b>${fmtPractice(score)}%</b></div>
          <div class="list-line"><span class="ll-main">Readiness</span><b>${h(readinessLabel(score))}</b></div>
          <div class="list-line"><span class="ll-main">${h(PRACTICE_SCORE.BANDS.ready)}の目安</span><b>${PRACTICE_SCORE.READY}以上</b></div>
          <div class="list-line"><span class="ll-main">${h(PRACTICE_SCORE.BANDS.building)}の目安</span><b>${PRACTICE_SCORE.BUILDING}以上</b></div>
          ${practiceNoteHTML()}
        </div>
      </div>

      <h2 style="font-size:16px;margin-bottom:10px">答え合わせ（不正解が先頭に開きます）</h2>
      ${reviewHTML}`;

    $("#retry", root).addEventListener("click", () => {
      mockSession = { mode: s.mode, examId: s.examId, scope: s.scope || "all", answers: {}, done: false };
      this.render(root);
      window.scrollTo(0, 0);
    });
    $("#to-chooser", root).addEventListener("click", () => {
      mockSession = null;
      this.render(root);
      window.scrollTo(0, 0);
    });
  },
};
