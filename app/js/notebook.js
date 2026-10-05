/* ============================================================
   Prepvela — notebook.js
   復習ノート: 誤答の間隔反復（1日→3日→7日→習得）
   ============================================================ */
"use strict";

let nbFilter = "due"; // due | all | reading | listening | learned

const NotebookView = {
  render(root) {
    const cards = Store.nbCards();
    const due = cards.filter((c) => c.stage < 4 && isDue(c));
    const learned = cards.filter((c) => c.stage >= 4);

    let list = cards;
    if (nbFilter === "due") list = due;
    else if (nbFilter === "reading") list = cards.filter((c) => c.section === "reading");
    else if (nbFilter === "listening") list = cards.filter((c) => c.section === "listening");
    else if (nbFilter === "learned") list = learned;
    // due first, then by stage desc
    list = list.slice().sort((a, b) => (isDue(b) - isDue(a)) || (b.stage - a.stage));

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>復習ノート</h1>
          <div class="sub">模擬テストで間違えた問題が自動登録され、間隔反復で復習期限が来ます</div>
        </div>
        <div class="btn-row">
          <span class="badge bad">期限 ${due.length}問</span>
          <span class="badge">登録 ${cards.length}問</span>
          <span class="badge ok">習得 ${learned.length}問</span>
        </div>
      </div>

      <div class="filter-row">
        <button class="chip ${nbFilter === "due" ? "on" : ""}" data-f="due">復習期限のみ（${due.length}）</button>
        <button class="chip ${nbFilter === "all" ? "on" : ""}" data-f="all">すべて（${cards.length}）</button>
        <button class="chip ${nbFilter === "reading" ? "on" : ""}" data-f="reading">リーディング</button>
        <button class="chip ${nbFilter === "listening" ? "on" : ""}" data-f="listening">リスニング</button>
        <button class="chip ${nbFilter === "learned" ? "on" : ""}" data-f="learned">習得済み（${learned.length}）</button>
        ${learned.length ? `<button class="chip" id="purge">習得済みを削除</button>` : ""}
      </div>

      ${list.length ? list.map((c) => this.cardHTML(c)).join("") : `
        <div class="card">
          <div class="empty">
            <div class="e-big">${nbFilter === "due" ? "復習期限の問題はありません" : "該当する問題がありません"}</div>
            ${nbFilter === "due"
              ? (cards.length ? "すべて順調です。模擬テストで新しい誤答を登録しましょう。" : "模擬テストで間違えた問題がここに自動で入ります。")
              : "フィルタを変えてみてください。"}
          </div>
        </div>`}

      <div class="card mt">
        <h2>間隔反復の仕組み</h2>
        <div class="stage-track" style="justify-content:flex-start">
          <span class="stage-chip">1日後</span><span class="stage-chip">→ 3日後</span>
          <span class="stage-chip">→ 7日後</span>
          <span class="stage-chip done">→ 習得</span>
        </div>
        <div class="hint mt-s">「覚えた」で1段階進み（7日後の復習で覚えていれば習得）、「まだ」で1段階戻って今日中に再出題されます。模擬テストで再び誤答すると最初に戻ります。</div>
      </div>`;

    $$("button[data-f]", root).forEach((b) =>
      b.addEventListener("click", () => { nbFilter = b.dataset.f; this.render(root); })
    );
    const purge = $("#purge", root);
    if (purge) purge.addEventListener("click", () => {
      if (!confirm("習得済みの問題をノートから削除しますか？（この操作は元に戻せません）")) return;
      Object.keys(Store.state.notebook).forEach((k) => {
        if (Store.state.notebook[k].stage >= 4) delete Store.state.notebook[k];
      });
      Store.save();
      this.render(root);
    });

    // per-card interactions
    $$(".nb-item", root).forEach((el) => {
      const key = el.dataset.key;
      const head = $(".nb-head", el);
      head.addEventListener("click", () => {
        const body = $(".nb-body", el);
        body.style.display = body.style.display === "none" ? "" : "none";
      });
      const reveal = $("button[data-reveal]", el);
      if (reveal) reveal.addEventListener("click", (e) => {
        e.stopPropagation();
        $(".opts", el).style.display = "";
        reveal.style.display = "none";
      });
      $("button[data-grade='1']", el).addEventListener("click", () => {
        Store.nbGrade(key, true);
        this.render(root);
      });
      $("button[data-grade='0']", el).addEventListener("click", () => {
        Store.nbGrade(key, false);
        this.render(root);
      });
    });
  },

  cardHTML(c) {
    const ex = getSet(c.examId);
    const dueStr = c.stage >= 4 ? "習得" : (isDue(c) ? "今日復習" : `${c.due} 復習`);
    const dueBadge = c.stage >= 4 ? "ok" : (isDue(c) ? "bad" : "");
    const secName = c.section === "reading" ? "リーディング" : "リスニング";

    return `
      <div class="nb-item" data-key="${h(c.key)}">
        <div class="nb-head">
          <span class="badge ${c.section === "reading" ? "acc" : "info"}">${secName}</span>
          <span class="badge">${h(ex ? ex.label : c.examId)}</span>
          <span class="badge ${dueBadge}">${dueStr}</span>
          <span class="nb-stem">${h(c.stem)}</span>
          <span class="badge warn">${SRS_LABELS[c.stage]}</span>
        </div>
        <div class="nb-body" style="display:none">
          <div class="nb-meta">
            <span class="badge">${c.section === "reading" ? "Q" : "No."}${c.no}</span>
            ${c.wrongCount > 1 ? `<span class="badge bad">誤答 ${c.wrongCount}回</span>` : ""}
            ${c.reviews ? `<span class="badge">復習 ${c.reviews}回</span>` : ""}
            <span class="badge">次の期限 ${h(c.due || "—")}</span>
          </div>
          <div class="q-stem">${h(c.stem)}</div>
          <div class="opts" style="display:none">
            ${c.options.map((o, i) => `
              <div class="opt ${i === ansIdx(c) ? "correct" : ""} ${i === c.chosen && i !== ansIdx(c) ? "wrong" : ""} ${i !== ansIdx(c) && i !== c.chosen ? "dim" : ""}">
                <span class="o-no">${i + 1}</span><span>${h(o)}</span>
              </div>`).join("")}
            ${explainHTML(c.why, ansIdx(c))}
          </div>
          <div class="btn-row mt-s">
            <button class="btn sm" data-reveal>答えを見る</button>
            <button class="btn sm primary" data-grade="1">○ 覚えた（次は ${h(this.nextDueLabel(c, true))}）</button>
            <button class="btn sm danger" data-grade="0">✗ まだ（今日中にもう一度）</button>
          </div>
        </div>
      </div>`;
  },

  nextDueLabel(c, up) {
    const stage = up ? Math.min(4, c.stage + 1) : c.stage;
    if (stage >= 4) return "習得扱い";
    return addDays(todayStr(), SRS_INTERVALS[stage]) + " 復習";
  },
};
