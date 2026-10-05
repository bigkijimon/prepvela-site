/* ============================================================
   Prepvela — writing.js
   ライティング練習: 要約60–70語 + 英作文120–150語
   ワード数検証 / 模範解答 / 採点基準自己評価
   ============================================================ */
"use strict";

let writingState = null; // {examId, summaryText, essayText, rubric, submitted}

const RUBRIC = [
  { key: "content", name: "内容（課題の要求を満たす）", desc: "要約は passage の要点を漏れなく。英作文は TOPIC に答え、POINTS を2つ以上使う。" },
  { key: "structure", name: "構成（導入・本論・結論）", desc: "段落と接続詞で論理的に展開。60–70語 / 120–150語の分量遵守。" },
  { key: "vocab", name: "語彙（幅・正確さ）", desc: "適切な語彙を正確に。同一語の繰り返しを避け、書き換えを示す。" },
  { key: "grammar", name: "文法（正確さ・多様性）", desc: "時制・主語・冠詞など基本文法に誤りがない。構文のバリエーションがある。" },
];

const WritingView = {
  render(root, query = {}) {
    // a deep link can name a set that has no writing tasks, or none at all
    const asked = query.exam ? getSet(query.exam) : null;
    if (query.exam && (!asked || !asked.writing || !asked.writing.summary || !asked.writing.essay)) {
      writingState = null;
      return this.renderChooser(root);
    }
    if (query.exam && (!writingState || writingState.examId !== query.exam)) {
      writingState = { examId: query.exam, summaryText: "", essayText: "", rubric: {}, submitted: false, timerLeft: null };
    }
    if (writingState && writingState.submitted) return this.renderResult(root);
    if (writingState) return this.renderSession(root);
    this.renderChooser(root);
  },

  renderChooser(root) {
    /* Only a set that actually carries both writing tasks can be practised; a set
       without them is listed as "this set has no writing task" instead of
       rendering a button that throws. */
const writable = SETS.filter((s) => s.writing && s.writing.summary && s.writing.essay);
    if (!writable.length) {
      root.innerHTML = `
        <div class="page-head">
          <div>
            <h1>ライティング練習</h1>
            <div class="sub">Task 1（要約）と Task 2（英作文）をこのアプリ内に作る練習です。</div>
          </div>
        </div>
        <div class="card">
          <div class="empty">
            <div class="e-big">まだライティング問題が登録されていません</div>
            ライティング問題のデータが見つかりません。アプリを入れ直してください。
            <div class="mt"><a class="btn soft" href="#/mock">模擬テストへ</a></div>
          </div>
        </div>`;
      return;
    }

    /* No date line here: a set carries no exam date (the authored parts have
       none), so the card shows the label and, below, what the task asks for. */
    const cards = writable.map((ex) => `
      <div class="card exam-card">
        <div class="exam-top">
          <div>
            <div class="exam-title">${h(ex.label)}</div>
          </div>
        </div>
        <div class="hint">要約: ${h(ex.writing.summary.words.join("–"))}語 / 英作文: ${h(ex.writing.essay.words.join("–"))}語<br>
        トピック: ${h(ex.writing.essay.topic.slice(0, 48))}…</div>
        <div class="exam-actions">
          <button class="btn primary" data-exam="${ex.id}">この回で書く（30分）</button>
        </div>
      </div>`).join("");

    const history = Store.state.writingDrafts.slice().reverse().slice(0, 8);

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>ライティング練習</h1>
          <div class="sub">Task 1（要約）と Task 2（英作文）。模範解答は提出後に表示されます。</div>
        </div>
      </div>

      <div class="notice mb">
        <b>この練習の指定:</b> Task 1 は <b>60–70語</b> で要約、Task 2 は <b>120–150語</b> で英作文。
        2題で <b>30分</b>（リーディングの60分と合わせると90分）。
        答えは指定の語数から外れると減点対象になります — 語数と指定の指示の遵守がまず最初の関門です。
      </div>

      <div class="grid grid-3 mb">${cards}</div>

      <div class="card">
        <h2>これまでの練習</h2>
        ${history.length ? history.map((d) => {
          const ex = getSet(d.examId);
          return `
            <div class="list-line">
              <span class="badge">${h(ex ? ex.label : "")}</span>
              <span class="ll-main">要約 ${countWords(d.summaryText)}語 / 英作文 ${countWords(d.essayText)}語
                <div class="ll-sub">${h(d.date)}${d.rubricAvg != null ? ` / 自己評価 ${d.rubricAvg}/5` : ""}</div></span>
              <button class="btn sm" data-open="${d.id}">見る</button>
            </div>`;
        }).join("") : `<div class="empty"><div class="e-big">まだ書き上がっていません</div>上のセットから1つ選んで書いてみましょう</div>`}
      </div>

      <div id="history-view"></div>`;

    $$("button[data-exam]", root).forEach((b) =>
      b.addEventListener("click", () => {
        writingState = { examId: b.dataset.exam, summaryText: "", essayText: "", rubric: {}, submitted: false, timerLeft: null };
        this.render(root);
        window.scrollTo(0, 0);
      })
    );
    $$("button[data-open]", root).forEach((b) =>
      b.addEventListener("click", () => {
        const d = Store.state.writingDrafts.find((x) => x.id === b.dataset.open);
        if (d) this.showHistory(root, d);
      })
    );
  },

  showHistory(root, d) {
    // a draft can outlive the set it was written against (bank edit, import)
    const ex = getSet(d.examId);
    const box = $("#history-view", root);
    box.innerHTML = `
      <div class="card mt">
        <h2>${h(ex ? ex.label : d.examId || "解答")}（${h(d.date)}）</h2>
        <div class="grid grid-2">
          <div>
            <div class="task-label">Task 1 要約（${countWords(d.summaryText)}語）</div>
            <div class="model-box" style="background:#fff;border-color:var(--line)">${h(d.summaryText) || "（空）"}</div>
          </div>
          <div>
            <div class="task-label">Task 2 英作文（${countWords(d.essayText)}語）</div>
            <div class="model-box" style="background:#fff;border-color:var(--line)">${h(d.essayText) || "（空）"}</div>
          </div>
        </div>
        <div class="btn-row mt">
          <button class="btn sm" id="hide-hist">閉じる</button>
          ${d.modelRevealed ? `<a class="btn sm soft" href="#/writing">模範解答と見比べるには新しい演習を開始</a>` : ""}
        </div>
      </div>`;
    $("#hide-hist", box).addEventListener("click", () => (box.innerHTML = ""));
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  },

  /* ------------------------------------------------ session */
  renderSession(root) {
    const ex = getSet(writingState.examId);
    if (!ex || !ex.writing) {
      writingState = null;
      return this.renderChooser(root);
    }
    const sum = ex.writing.summary, esa = ex.writing.essay;

    const wc = (text, range) => {
      const n = countWords(text);
      const ok = n >= range[0] && n <= range[1];
      return `<span class="wc ${n === 0 ? "" : ok ? "ok" : "bad"}">${n}語${ok ? " ✓" : ""}</span>
              <span class="wc-target">/ 指定 ${range[0]}–${range[1]}語${n > 0 && !ok ? (n < range[0] ? `（あと${range[0] - n}語）` : `（${n - range[1]}語オーバー）`) : ""}</span>`;
    };

    root.innerHTML = `
      <div class="session-bar">
        <div>
          <div class="s-title">ライティング演習 — ${h(ex.label)}</div>
          <div class="s-sub">Task 1 要約 + Task 2 英作文 / 30分タイマー（リーディング60分と合わせると90分）</div>
        </div>
        <div class="spacer"></div>
        <div class="timer" id="wr-timer">${fmtClock(writingState.timerLeft != null ? writingState.timerLeft : 30 * 60)}</div>
        <button class="btn" id="wr-timer-btn">${writingState.timerPaused ? "再開" : "一時停止"}</button>
        <button class="btn primary" id="wr-submit">提出して採点基準を見る</button>
      </div>

      <div class="grid grid-2">
        <div class="card task-block">
          <span class="task-label">Task 1 — English Summary</span>
          <div class="instr">
            <ul>${(sum.instructions || []).map((i) => `<li>${h(i)}</li>`).join("")}</ul>
          </div>
          <div class="passage mt-s" style="box-shadow:none;padding:16px 18px">
            <div class="p-text">${sum.passage.split(/\n\n+/).map((t) => `<p>${h(t)}</p>`).join("")}</div>
          </div>
          <textarea class="writing-area mt-s" id="sum-area" placeholder="Write your summary here…">${h(writingState.summaryText)}</textarea>
          <div class="wc-row" id="sum-wc">${wc(writingState.summaryText, sum.words)}</div>
        </div>

        <div class="card task-block">
          <span class="task-label">Task 2 — English Composition</span>
          <div class="instr">
            <ul>${esa.instructions.map((i) => `<li>${h(i)}</li>`).join("")}</ul>
          </div>
          <div class="topic-box">
            <div class="t-label">TOPIC</div>
            <div class="t-topic">${h(esa.topic)}</div>
            <div class="points">${(esa.points || []).map((p) => `<span>${h(p)}</span>`).join("")}</div>
          </div>
          <textarea class="writing-area" id="esa-area" placeholder="Write your essay here…">${h(writingState.essayText)}</textarea>
          <div class="wc-row" id="esa-wc">${wc(writingState.essayText, esa.words)}</div>
          <div class="hint mt-s">POINTS から <b>2つ</b> を選び、立場を明確に。導入→本論→結論の3段構成を意識しましょう。</div>
        </div>
      </div>

      <div class="btn-row mt">
        <button class="btn primary big" id="wr-submit2">提出して採点基準を見る</button>
        <button class="btn" id="wr-cancel">やめて選択に戻る</button>
        <span class="hint">提出後に入力内容は保存され、模範解答と見比べられます</span>
      </div>`;

    const sumArea = $("#sum-area", root), esaArea = $("#esa-area", root);
    const update = () => {
      writingState.summaryText = sumArea.value;
      writingState.essayText = esaArea.value;
      $("#sum-wc", root).innerHTML = wc(sumArea.value, sum.words);
      $("#esa-wc", root).innerHTML = wc(esaArea.value, esa.words);
    };
    sumArea.addEventListener("input", update);
    esaArea.addEventListener("input", update);

    // The remaining time lives in writingState, so pausing resumes where it
    // stopped and leaving the page (then coming back) does not reset to 30:00.
    let timer = null;
    const tick = (left) => {
      writingState.timerLeft = left;
      const el = $("#wr-timer", root);
      if (!el) return;
      el.textContent = fmtClock(left);
      el.classList.toggle("warn", left <= 600 && left > 120);
      el.classList.toggle("bad", left <= 120);
    };
    const onEnd = () => {
      timer = null;
      const btn = $("#wr-timer-btn", root);
      if (btn) { btn.textContent = "時間終了"; btn.disabled = true; }
      if (!writingState.timeUp) {
        writingState.timeUp = true; // alert once, not on every return to the page
        alert("30分です。提出しましょう。");
      }
    };
    const run = () => {
      const left = writingState.timerLeft != null ? writingState.timerLeft : 30 * 60;
      if (left <= 0) return onEnd();
      timer = startCountdown(left, tick, onEnd);
    };
    if (!writingState.timerPaused) run();
    else tick(writingState.timerLeft != null ? writingState.timerLeft : 30 * 60);
    ViewCleanup.add(() => timer && timer.stop());
    $("#wr-timer-btn", root).addEventListener("click", () => {
      const btn = $("#wr-timer-btn", root);
      if (timer) {
        timer.stop(); timer = null;
        writingState.timerPaused = true;
        btn.textContent = "再開";
      } else {
        writingState.timerPaused = false;
        btn.textContent = "一時停止";
        run();
      }
    });

    const submit = () => {
      update();
      if (countWords(writingState.summaryText) < 10 && countWords(writingState.essayText) < 10) {
        if (!confirm("両方ともほぼ空です。このまま提出しますか？")) return;
      }
      timer && timer.stop();
      writingState.submitted = true;
      const draft = {
        id: uid(), examId: ex.id, date: todayStr(),
        summaryText: writingState.summaryText, essayText: writingState.essayText,
        rubric: writingState.rubric || {}, rubricAvg: null, modelRevealed: false,
      };
      writingState.draftId = draft.id;
      Store.state.writingDrafts.push(draft);
      Store.save();
      this.render(root);
      window.scrollTo(0, 0);
    };
    $("#wr-submit", root).addEventListener("click", submit);
    $("#wr-submit2", root).addEventListener("click", submit);
    $("#wr-cancel", root).addEventListener("click", () => {
      if (confirm("入力内容を破棄して戻りますか？")) {
        timer && timer.stop();
        writingState = null;
        this.render(root);
      }
    });
  },

  /* ------------------------------------------------ result / self-scoring */
  renderResult(root) {
    const ex = getSet(writingState.examId);
    if (!ex || !ex.writing) {
      writingState = null;
      return this.renderChooser(root);
    }
    const sum = ex.writing.summary, esa = ex.writing.essay;
    const draft = Store.state.writingDrafts.find((d) => d.id === writingState.draftId)
      || Store.state.writingDrafts[Store.state.writingDrafts.length - 1];
    const rubric = writingState.rubric || (writingState.rubric = {});

    const sw = countWords(writingState.summaryText);
    const ew = countWords(writingState.essayText);
    const swOk = sw >= sum.words[0] && sw <= sum.words[1];
    const ewOk = ew >= esa.words[0] && ew <= esa.words[1];

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>提出完了 — 自己採点</h1>
          <div class="sub">${h(ex.label)} / 模範解答と見比べて採点基準で自己評価しましょう</div>
        </div>
        <div class="btn-row">
          <button class="btn soft" id="reveal">模範解答を見る</button>
          <button class="btn" id="finish">保存して終了</button>
        </div>
      </div>

      <div class="grid grid-2 mb">
        <div class="card">
          <span class="task-label">Task 1 — あなたの要約</span>
          <div class="wc-row" style="margin-bottom:8px">
            <span class="wc ${swOk ? "ok" : sw === 0 ? "" : "bad"}">${sw}語</span>
            <span class="wc-target">/ 指定 ${sum.words.join("–")}語 ${swOk ? "✓ 適正" : sw === 0 ? "" : "✗ 範囲外（減点対象）"}</span>
          </div>
          <div class="model-box" style="background:#fff;border-color:var(--line)">${h(writingState.summaryText) || "<span class='muted'>（未記入）</span>"}</div>
        </div>
        <div class="card">
          <span class="task-label">Task 2 — あなたの英作文</span>
          <div class="wc-row" style="margin-bottom:8px">
            <span class="wc ${ewOk ? "ok" : ew === 0 ? "" : "bad"}">${ew}語</span>
            <span class="wc-target">/ 指定 ${esa.words.join("–")}語 ${ewOk ? "✓ 適正" : ew === 0 ? "" : "✗ 範囲外（減点対象）"}</span>
          </div>
          <div class="model-box" style="background:#fff;border-color:var(--line)">${h(writingState.essayText) || "<span class='muted'>（未記入）</span>"}</div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h2>採点基準による自己評価 <span class="h2-note">0〜5点</span></h2>
          <div class="hint mb">内容・構成・語彙・文法の4項目を自分で確認します。平均が自己評価スコアになります。</div>
          <div class="rubric">
            ${RUBRIC.map((r) => `
              <div class="rubric-row">
                <div class="r-name">${h(r.name)}</div>
                <div class="r-opts" data-key="${r.key}">
                  ${[0, 1, 2, 3, 4, 5].map((n) =>
                    `<button data-n="${n}" class="${rubric[r.key] === n ? "on" : ""}">${n}</button>`).join("")}
                </div>
              </div>
              <div class="rubric-desc">${h(r.desc)}</div>`).join("")}
          </div>
          <div class="hr"></div>
          <div id="rubric-avg" class="list-line"><span class="ll-main">自己評価スコア</span><b>${this.avg(rubric)}</b></div>
          <div class="hint mt-s">0〜5点は、このアプリのための自己評価用の目盛りです。外部の採点基準や判定とは関係ありません。</div>
          ${practiceNoteHTML()}
        </div>

        <div class="card">
          <h2>模範解答</h2>
          <div id="model-slot">
            <div class="empty">「模範解答を見る」を押すと表示されます。先に自分で書き切りましょう。</div>
          </div>
          <div class="hr"></div>
          <div class="notice">
            <b>模範解答との見かた:</b> ①要点の数と種類（要約）②POINTSの使い方と立論の展開（英作文）
            ③使っている接続詞・語彙の幅。1つだけでも自分の書き方に持ち帰りましょう。
          </div>
        </div>
      </div>`;

    $$(".r-opts", root).forEach((grp) => {
      grp.addEventListener("click", (e) => {
        const b = e.target.closest("button[data-n]");
        if (!b) return;
        rubric[grp.dataset.key] = Number(b.dataset.n);
        $$("button", grp).forEach((x) => x.classList.toggle("on", x === b));
        $("#rubric-avg", root).innerHTML = `<span class="ll-main">自己評価スコア</span><b>${this.avg(rubric)}</b>`;
        if (draft) { draft.rubric = rubric; Store.save(); }
      });
    });

    $("#reveal", root).addEventListener("click", () => {
      $("#model-slot", root).innerHTML = `
        <div class="model-box mb">
          <div class="m-label">TASK 1 模範解答（${countWords(sum.modelAnswer)}語）</div>
          ${h(sum.modelAnswer)}
        </div>
        <div class="model-box">
          <div class="m-label">TASK 2 模範解答（${countWords(esa.modelAnswer)}語）</div>
          ${h(esa.modelAnswer)}
        </div>`;
      if (draft) { draft.modelRevealed = true; Store.save(); }
      $("#reveal", root).disabled = true;
      $("#reveal", root).textContent = "模範解答を表示済み";
    });

    $("#finish", root).addEventListener("click", () => {
      const avg = this.avg(rubric);
      const num = avg == null ? null : Number(avg.split("/")[0]);
      Store.addAttempt({ type: "writing", examId: ex.id, correct: null, total: null,
        meta: { rubricAvg: num, summaryWords: sw, essayWords: ew } });
      if (draft) { draft.rubric = rubric; draft.rubricAvg = num; Store.save(); }
      writingState = null;
      location.hash = "#/dashboard";
    });
  },

  avg(rubric) {
    const vals = Object.values(rubric).filter((v) => typeof v === "number");
    if (!vals.length) return "— / 5";
    const a = vals.reduce((x, y) => x + y, 0) / vals.length;
    return `${a.toFixed(1)} / 5`;
  },
};
