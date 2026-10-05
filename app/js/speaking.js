/* ============================================================
   Prepvela — speaking.js
   スピーキング練習: 1つの場面を2分30秒で話し、続けて質問3問に答える
   準備1分 → 話し続けて1分30秒 → 質問3問（各1分）
   データは data/bank.js の speaking（python3 tools/merge_bank.py が生成）

   絵は MoviePro が後から差し込む画像ファイルで、ここでは一切描かない。
   画像が無いときは「場面」パネルとして指示文と絵の説明を見せる。空の枠や
   壊れた画像の記号を出さないのは、練習が始められないうえに嘘になるから。
   ============================================================ */
"use strict";

let speakingState = null; // {cardId, stage, checks:{}}

const SpeakingView = {
  /* 1分の準備は「見て・考える」時間、残り1分30秒は途切れず話す時間。
     どちらも speaking.json の format（2.5分 = 1分 + 1.5分）と同じ数字に
     置いてあるので、説明とタイマーがずれない。 */
  PREP_SEC: 60,
  TALK_SEC: 90,

  /* 2.5分 is not how Japanese writes two and a half minutes. */
  fmtMinutes(m) {
    const whole = Math.floor(m);
    const rest = Math.round((m - whole) * 60);
    if (!rest) return `${whole}分`;
    if (!whole) return `${rest}秒`;
    return `${whole}分${rest}秒`;
  },

  /* One label for a task kind, so the deck and the practice screen cannot
     drift apart. A picture is an image file; nothing here draws one. */
  kindLabel(kind) {
    return kind === "sample" ? "練習カード" : "練習トピック";
  },

  /* The picture when the tree ships one, the 場面 panel when it does not.
     Both fill the same slot, so the practice flow below never changes — and
     the panel is written either way, because a file the bank lists but the
     bundle does not carry paints a broken-image glyph in an empty frame, and
     that is the one thing this slot must never show. bindScene swaps them. */
  sceneHTML(card) {
    const panel = `
      <div class="scene mb" id="sp-scene"${card.image ? " hidden" : ""}>
        <div class="s-label">場面</div>
        <div class="s-situation">${h(card.scenario)}</div>
        <div class="s-brief">${h(card.imageBrief)}</div>
      </div>`;
    if (!card.image) return panel;
    return `<img class="four-panel sp-pic mb" id="sp-pic" src="${h(card.image)}"
      alt="${h(card.title)} の場面">${panel}`;
  },

  /* The fallback half of sceneHTML: one error listener, and the panel takes the
     picture's place. Nothing else on the screen asks which of the two is up. */
  bindScene(root) {
    const pic = $("#sp-pic", root);
    if (!pic) return;
    pic.addEventListener("error", () => {
      pic.remove();
      const scene = $("#sp-scene", root);
      if (scene) scene.hidden = false;
    });
  },

  render(root, query = {}) {
    const deck = (DATA.speaking && DATA.speaking.cards) || [];
    if (query.card && deck.some((c) => c.id === query.card)) {
      if (!speakingState || speakingState.cardId !== query.card) {
        speakingState = { cardId: query.card, stage: "idle", checks: {} };
      }
      return this.renderCard(root, deck.find((c) => c.id === query.card));
    }
    speakingState = null;
    this.renderDeck(root);
  },

  /* ------------------------------------------------ deck */
  renderDeck(root) {
    const sp = DATA.speaking;
    const deck = (sp && sp.cards) || [];
    const fmt = sp && sp.format;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>スピーキング練習</h1>
          <div class="sub">1つの場面を2分30秒で話し、続けて質問3問に答えます。</div>
        </div>
      </div>

      ${fmt ? `
      <div class="card mb">
        <h2>練習の構成 <span class="h2-note">1題あたり約${h(this.fmtMinutes(fmt.totalMinutes))}</span></h2>
        <div class="stage-track" style="justify-content:flex-start;margin-bottom:10px">
          ${fmt.stages.map((s) => `<span class="stage-chip">${h(s.name)} ${h(this.fmtMinutes(s.minutes))}</span>`).join("")}
        </div>
        <div class="hint" style="font-weight:700;color:var(--ink-2)">流れ</div>
        ${fmt.stages.map((s) => `<div class="list-line"><span class="ll-main">${h(s.name)}
          <div class="ll-sub">${h(s.description)}</div></span><b>${h(this.fmtMinutes(s.minutes))}</b></div>`).join("")}
        <div class="hint mt" style="font-weight:700;color:var(--ink-2)">評価項目</div>
        <div class="points" style="margin-top:6px">${fmt.evaluation.map((e) => `<span>${h(e)}</span>`).join("")}</div>
        <div class="disclaimer mt-s">
          場面・書き出し文・質問・参考ナレーション・模範回答例は、このアプリのために書き下ろした練習用のテキストです。
          評価項目は自分で確認するためのチェックリストで、外部の採点基準を示すものではありません。
        </div>
      </div>` : ""}

      <div class="deck">
        ${deck.map((c) => `
          <a class="deck-card" href="#/speaking?card=${h(c.id)}" data-card="${h(c.id)}">
            <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
              <span class="badge acc">${h(c.id)}</span>
              <span class="badge">${h(this.kindLabel(c.kind))}</span>
            </div>
            <div class="dk-title">${h(c.title)}</div>
            <div class="dk-prompt">${h(c.scenario)}</div>
          </a>`).join("")}
      </div>

      <div class="card mt">
        <h2>練習の記録</h2>
        ${Store.state.speakingLog.length ? Store.state.speakingLog.slice(-5).reverse().map((l) => {
          const c = deck.find((x) => x.id === l.cardId);
          const n = l.checks.filter(Boolean).length;
          const total = l.checks.length;
          return `<div class="list-line">
            <span class="badge">${n}/${total} 達成</span>
            <span class="ll-main">${h(c ? c.title : l.cardId)}<div class="ll-sub">${h(l.date)}</div></span>
          </div>`;
        }).join("") : `<div class="empty"><div class="e-big">まだ記録がありません</div>場面を選ぶと練習フローが始まります</div>`}
      </div>`;
  },

  /* ------------------------------------------------ task practice */
  renderCard(root, card) {
    const fmt = DATA.speaking.format;
    const st = speakingState;
    st.stage = "idle"; // a timer never survives leaving the page, so neither does its stage

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>${h(card.title)}</h1>
          <div class="sub">${h(card.id)} — ${h(this.kindLabel(card.kind))} — <a href="#/speaking">デッキに戻る</a></div>
        </div>
        <div class="btn-row">
          <a class="btn" href="#/speaking">← デッキ</a>
        </div>
      </div>

      <div class="grid grid-side mb">
        <div>
          ${this.sceneHTML(card)}

          <div class="card">
            <h2>書き出し文</h2>
            <div class="hint" style="font-weight:700;color:var(--ink-2)">ナレーションは必ずこの文から始めてください</div>
            <div class="script mt-s" style="font-size:15px"><div class="line">${h(card.opening)}</div></div>
          </div>

          <div class="card mt">
            <h2>質問 <span class="h2-note">${card.questions.length}問 / 各1分</span></h2>
            ${card.questions.map((q, i) => `
              <div class="qa-item">
                <span class="qa-no">Q${i + 1}</span>
                <div class="qa-q">${h(q)}</div>
              </div>`).join("")}
            <div class="notice mt-s">
              <b>練習のコツ:</b> 質問には <span class="kbd">Well, …</span> でつないで、結論から話すと聞き取りやすくなります。
              聞き返しは、内容が固まっていれば問題ありません。
            </div>
          </div>

          <div class="card mt">
            <h2>模範解答</h2>
            <p class="hint">先に自分で声に出してから開いてください。先に読むと、答えの型しか残りません。</p>
            <button class="btn soft wide mt-s" id="sp-reveal" aria-expanded="false" aria-controls="sp-model">模範解答を見る</button>
            <div id="sp-model" class="model-box mt-s" hidden>
              <div class="m-label">参考ナレーション</div>
              <div>${h(card.modelDescription)}</div>
              ${card.modelAnswers.map((a, i) => `
                <div class="m-label" style="margin-top:12px">Q${i + 1} の模範回答例</div>
                <div>${h(a)}</div>`).join("")}
              <div class="hint mt-s" style="color:var(--ink-3)">※ このアプリのために書き下ろした参考例です。</div>
            </div>
          </div>
        </div>

        <div>
          <div class="card">
            <h2>タイマー練習</h2>
            <div class="stage-timer">
              <div class="st-label" id="st-label">準備1分 / 話し続けて1分30秒</div>
              <div class="st-time" id="st-time">01:00</div>
            </div>
            <div class="stage-track" id="st-track">
              <span class="stage-chip" data-stage="prep" data-name="① 準備 1分">① 準備 1分</span>
              <span class="stage-chip" data-stage="talk" data-name="② 話し続けて 1分30秒">② 話し続けて 1分30秒</span>
              <span class="stage-chip" data-stage="qa" data-name="③ 質問3問">③ 質問3問</span>
            </div>
            <div class="btn-row mt" style="justify-content:center">
              <button class="btn primary" id="st-start">▶ 準備を開始（1分）</button>
              <button class="btn" id="st-reset">リセット</button>
            </div>
            <div class="hint mt-s" style="text-align:center">準備1分が終わると自動で話し始めます。話し続けて1分30秒で止まります。</div>
          </div>

          <div class="card mt">
            <h2>評価チェック <span class="h2-note">評価項目 ${fmt.evaluation.length}つ</span></h2>
            <div class="checklist" id="checklist">
              ${fmt.evaluation.map((e, i) => `
                <label class="check-item ${st.checks[i] ? "done" : ""}">
                  <input type="checkbox" data-i="${i}" ${st.checks[i] ? "checked" : ""}>
                  <span>${h(e)}</span>
                </label>`).join("")}
            </div>
            <button class="btn primary wide mt" id="sp-save">この回の練習を記録</button>
          </div>
        </div>
      </div>`;

    this.bindScene(root);

    /* ---- stage chips: the current stage is "now", earlier ones "done".
       The state is a word as well as a background colour, so it survives a
       monochrome screen and reaches a screen reader as text. */
    const ORDER = ["prep", "talk", "qa"];
    const paintStages = () => {
      const at = ORDER.indexOf(speakingState.stage);
      $$("#st-track [data-stage]", root).forEach((chip) => {
        const i = ORDER.indexOf(chip.dataset.stage);
        const now = i === at, done = at > -1 && i < at;
        chip.classList.toggle("now", now);
        chip.classList.toggle("done", done);
        chip.textContent = chip.dataset.name + (now ? " いま" : done ? " 済" : "");
      });
    };
    paintStages();

    /* ---- timers */
    let handle = null;
    const stopTimer = () => { if (handle) { handle.stop(); handle = null; } };
    ViewCleanup.add(stopTimer);

    const setDisplay = (label, sec) => {
      const lbl = $("#st-label", root), tm = $("#st-time", root);
      if (!lbl || !tm) return;
      lbl.textContent = label;
      tm.textContent = fmtClock(sec);
      tm.classList.toggle("warn", sec <= 20 && sec > 5);
      tm.classList.toggle("bad", sec <= 5);
    };

    const runStage = (stage, label, seconds, onDone) => {
      stopTimer();
      speakingState.stage = stage;
      paintStages();
      handle = startCountdown(seconds, (left) => setDisplay(label, left), onDone);
    };

    const startTalk = () => {
      runStage("talk", "② 話し続けて 1分30秒 — 書き出し文から話す", this.TALK_SEC, () => {
        speakingState.stage = "qa";
        paintStages();
        const lbl = $("#st-label", root), tm = $("#st-time", root), btn = $("#st-start", root);
        if (!lbl) return;
        lbl.textContent = "③ 質問3問 — 下の質問に答える";
        tm.textContent = "完了";
        tm.classList.remove("warn", "bad");
        btn.textContent = "もう一度練習する";
        const qa = $(".qa-item", root);
        if (qa) qa.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      const btn = $("#st-start", root);
      if (btn) btn.textContent = "話し中…（1分30秒で終了）";
    };

    $("#st-start", root).addEventListener("click", () => {
      runStage("prep", "① 準備 1分 — 場面を黙読して、話す順番を決める", this.PREP_SEC, startTalk);
      $("#st-start", root).textContent = "準備中…（終わると自動で話し始めます）";
    });
    $("#st-reset", root).addEventListener("click", () => {
      stopTimer();
      speakingState.stage = "idle";
      paintStages();
      setDisplay("準備1分 / 話し続けて1分30秒", this.PREP_SEC);
      $("#st-start", root).textContent = "▶ 準備を開始（1分）";
    });

    /* ---- checklist */
    $$("#checklist input", root).forEach((cb) =>
      cb.addEventListener("change", () => {
        speakingState.checks[Number(cb.dataset.i)] = cb.checked;
        cb.closest(".check-item").classList.toggle("done", cb.checked);
      })
    );

    /* ---- model answers, behind one disclosure */
    const reveal = $("#sp-reveal", root);
    const model = $("#sp-model", root);
    reveal.addEventListener("click", () => {
      const open = reveal.getAttribute("aria-expanded") === "true";
      reveal.setAttribute("aria-expanded", open ? "false" : "true");
      reveal.textContent = open ? "模範解答を見る" : "模範解答を隠す";
      model.hidden = open;
    });

    /* ---- save */
    $("#sp-save", root).addEventListener("click", () => {
      const checks = fmt.evaluation.map((_, i) => !!speakingState.checks[i]);
      const n = checks.filter(Boolean).length;
      Store.state.speakingLog.push({ id: uid(), cardId: card.id, date: todayStr(), checks });
      Store.save();
      Store.addAttempt({ type: "speaking", examId: null, correct: null, total: null,
        meta: { checks: n } });
      alert(`記録しました（達成 ${n}/${checks.length}）。`);
      location.hash = "#/dashboard";
    });
  },
};
