/* ============================================================
   Prepvela — dashboard.js
   学習計画ダッシュボード: カウントダウン / 週間プラン / 統計
   ============================================================ */
"use strict";

const DashboardView = {
  render(root) {
    const s = Store.state;
    const st = Store.stats();
    const vocab = Store.vocabStats();
    const today = todayStr();
    const target = s.settings.targetDate;
    const daysLeft = diffDays(today, target);

    /* The hero quotes how many questions the next set actually holds. A hardcoded
       count would be a lie for any bank but this one. */
    const next = getSet(Store.nextSetId());
    const nRead = next ? partItems(readingParts(next, [1, 2, 3])).length : 0;
    const nListen = next ? partItems(listeningParts(next, null)).length : 0;
    /* Readiness follows the Practice Score of every graded question so far. */
    const graded = st.best.reduce(
      (o, a) => ({ c: o.c + (a.correct || 0), t: o.t + (a.total || 0) }),
      { c: 0, t: 0 }
    );
    const overall = practiceScore(graded.c, graded.t);

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>ホーム</h1>
          <div class="sub">${h(fmtDateJP(today))} 現在 — 登録済みの練習セットで学習できます</div>
        </div>
        <div class="btn-row">
          <a class="btn soft" href="#/mock">模擬テストをはじめる</a>
        </div>
      </div>

      <div class="grid grid-side mb">
        <div class="card hero">
          <div class="hero-label">${h(s.settings.targetLabel)}</div>
          <div class="hero-days"><b>${Math.max(0, daysLeft)}</b><span>日</span></div>
          <div class="hero-date">${h(fmtDateJP(target))}（${"日月火水木金土"[new Date(target + "T00:00:00").getDay()]}）— 目標日まで</div>
          <div class="hero-sub">
            <span class="badge">${nRead ? `リーディング${nRead}問＋ライティング2題 / 90分` : "リーディング問題なし"}</span>
            <span class="badge">${nListen ? `リスニング${nListen}問 / 約30分` : "リスニング問題なし"}</span>
            <span class="badge acc">Readiness ${h(readinessLabel(overall))}</span>
          </div>
        </div>

        <div class="card">
          <h2>今週の積み上げ <span class="h2-note">直近7日</span></h2>
          <div class="stat-grid" style="grid-template-columns: repeat(2,1fr)">
            <div class="stat"><div class="k">学習時間</div><div class="v" id="week-min">${st.weekMin}<small>分</small></div></div>
            <div class="stat"><div class="k">連続学習</div><div class="v" id="week-streak">${st.streak}<small>日</small></div></div>
          </div>
          <div class="mt-s plan-grid" id="mini-plan"></div>
        </div>
      </div>

      <div class="card launcher mb">
        <div class="lch-text">
          <div class="lch-title">今からやるなら、1つだけ</div>
          <div class="lch-sub">全部終わらせなくていいです。まず1つだけ。</div>
        </div>
        <div class="lch-btns">
          <a class="btn primary" href="#/cards?start=1">単語を1枚</a>
          <a class="btn" href="#/mock?act=reading&scope=long&exam=${h(Store.nextSetId())}">長文読解を1問</a>
          <a class="btn" href="#/mock?act=reading&scope=vocab&exam=${h(Store.nextSetId())}">語彙を1問</a>
          <a class="btn" href="#/mock?act=listening&scope=1&exam=${h(Store.nextSetId())}">リスニングを1問</a>
        </div>
      </div>

      <div class="stat-grid mb">
        <div class="stat">
          <div class="k">リーディング Practice Score（累計）</div>
          <div class="v">${fmtPractice(st.readScore)}<small>${st.readScore == null ? "" : "%"}</small></div>
          <div class="d">${st.readCount ? `${st.readCount}問 解答` : "まだ模擬テストを解いていません"}</div>
        </div>
        <div class="stat">
          <div class="k">リスニング Practice Score（累計）</div>
          <div class="v">${fmtPractice(st.listScore)}<small>${st.listScore == null ? "" : "%"}</small></div>
          <div class="d">${st.listCount ? `${st.listCount}問 解答` : "まだ模擬テストを解いていません"}</div>
        </div>
        <div class="stat">
          <div class="k">単語カード</div>
          <div class="v">${vocab.mastered}<small>枚 習得</small></div>
          <div class="d">${vocab.seen}/${vocab.total}枚 学習済${vocab.rate == null ? "" : ` / 正答率 ${vocab.rate}%`}</div>
        </div>
        <div class="stat">
          <div class="k">復習ノート</div>
          <div class="v">${st.due}<small>問 復習期限</small></div>
          <div class="d">登録 ${st.nbTotal}問 / 習得 ${st.learned}問</div>
        </div>
        <div class="stat">
          <div class="k">アウトプット練習</div>
          <div class="v">${st.writingCount + st.speakingCount}<small>回</small></div>
          <div class="d">ライティング ${st.writingCount} / スピーキング ${st.speakingCount}</div>
        </div>
      </div>

      <div class="grid grid-side">
        <div class="card">
          <h2>今日の学習プラン <span class="h2-note" id="plan-progress"></span></h2>
          <div class="task-list" id="task-list"></div>
          <div class="hr"></div>
          <div class="btn-row">
            <label class="muted" style="font-size:13px">今日の学習時間</label>
            <input type="number" id="min-input" min="0" max="600" step="5"
              value="${Store.planDay(today).minutes || ""}"
              placeholder="例: 30"
              style="width:110px;padding:7px 10px;border:1px solid var(--line);border-radius:9px;font-size:14px">
            <span class="muted" style="font-size:13px">分</span>
            <span class="hint" style="margin-left:auto">チェックと時間をつけると連続学習日数に記録されます</span>
          </div>
        </div>

        <div class="card">
          <h2>おすすめの次の一歩</h2>
          <div id="next-actions"></div>
          <div class="hr"></div>
          <h2>最近の記録</h2>
          <div id="recent"></div>
        </div>
      </div>

      <div class="card mt">
        <h2>スコアの見かた</h2>
        <div class="notice">
          <b>Practice Score</b> は正答率そのもの（0〜100、小数1桁）です。
          <b>Readiness</b> はその値だけで決まる3段階 —
          <b>${h(PRACTICE_SCORE.BANDS.low)}</b>（${PRACTICE_SCORE.BUILDING}未満）/
          <b>${h(PRACTICE_SCORE.BANDS.building)}</b>（${PRACTICE_SCORE.BUILDING}以上${PRACTICE_SCORE.READY}未満）/
          <b>${h(PRACTICE_SCORE.BANDS.ready)}</b>（${PRACTICE_SCORE.READY}以上）。
          技能ごとに分けた値も、カウントダウンや復習ノートの記録も、この2つの数字と表計算から出てきます。
        </div>
        ${practiceNoteHTML()}
      </div>`;

    this.renderMiniPlan(root);
    this.renderTasks(root);
    this.renderNext(root, st);
    this.renderRecent(root);

    $("#min-input", root).addEventListener("change", (e) => {
      Store.setPlanMinutes(today, e.target.value);
      this.afterPlanChange(root);
    });
  },

  /* one place to refresh everything the plan card shows, so checking a task
     or typing minutes updates the week stats too (not just on reload) */
  afterPlanChange(root) {
    // syncTasks, not renderTasks: rebuilding the rows would swap the DOM node
    // out from under a pointer that is mid-click.
    this.syncTasks(root);
    this.renderMiniPlan(root);
    this.renderWeekStats(root);
  },

  renderWeekStats(root) {
    const st = Store.stats();
    const m = $("#week-min", root);
    const s = $("#week-streak", root);
    if (m) m.innerHTML = `${st.weekMin}<small>分</small>`;
    if (s) s.innerHTML = `${st.streak}<small>日</small>`;
  },

  weekDates() {
    const out = [];
    const today = todayStr();
    // last 7 days ending today
    for (let i = 6; i >= 0; i--) out.push(addDays(today, -i));
    return out;
  },

  renderMiniPlan(root) {
    const el = $("#mini-plan", root);
    if (!el) return;
    const names = ["日", "月", "火", "水", "木", "金", "土"];
    const nTasks = Store.state.planTasks.length;
    el.innerHTML = this.weekDates().map((ds) => {
      const d = new Date(ds + "T00:00:00");
      const p = Store.planDay(ds);
      const pips = Array.from({ length: nTasks }, (_, i) => {
        const cls = p.checks[i] ? "on" : "";
        return `<i class="${cls}"></i>`;
      }).join("");
      return `
        <div class="plan-day ${ds === todayStr() ? "today" : ""}" title="${ds}">
          <div class="d-name">${names[d.getDay()]}</div>
          <div class="d-date">${d.getDate()}</div>
          <div class="d-pips">${pips}</div>
          <div class="d-min">${p.minutes ? p.minutes + "分" : "—"}</div>
        </div>`;
    }).join("");
  },

  renderTasks(root) {
    const el = $("#task-list", root);
    if (!el) return;
    const today = todayStr();
    const day = Store.planDay(today);
    const tasks = Store.state.planTasks || [];
    el.innerHTML = tasks.map((t, i) => {
      const done = !!day.checks[i];
      const href = Store.taskLink(i);
      const body = href
        ? `<a class="task-go" href="${h(href)}">${h(t)}</a>`
        : `<span class="task-go plain">${h(t)}</span>`;
      // The whole row is the hit area: .task-go::after stretches the link over
      // the row, and the checkbox sits above it so it stays its own control.
      return `
        <div class="task ${done ? "done" : ""}">
          <input type="checkbox" data-i="${i}" ${done ? "checked" : ""} aria-label="${h(t)}を完了にする">
          ${body}
        </div>`;
    }).join("");
    $$("input[type=checkbox]", el).forEach((cb) => {
      cb.addEventListener("change", () => {
        Store.setPlanCheck(today, Number(cb.dataset.i), cb.checked);
        this.afterPlanChange(root);
      });
    });
    this.syncTasks(root);
  },

  /* Update the rows in place. Rebuilding them here breaks clicks: blurring the
     minutes field fires `change`, which would replace the node between the
     mousedown and the mouseup, and the browser then never emits `click`. */
  syncTasks(root) {
    const el = $("#task-list", root);
    if (!el) return;
    const day = Store.planDay(todayStr());
    const tasks = Store.state.planTasks || [];
    $$(".task", el).forEach((row, i) => {
      const done = !!day.checks[i];
      row.classList.toggle("done", done);
      const cb = row.querySelector("input[type=checkbox]");
      if (cb && cb.checked !== done) cb.checked = done;
    });
    // progress next to the heading, so ticking a row always gives feedback
    const prog = $("#plan-progress", root);
    if (prog) {
      const n = tasks.filter((_, i) => day.checks[i]).length;
      prog.textContent = `${n}/${tasks.length} 完了`;
    }
  },

  renderNext(root, st) {
    const el = $("#next-actions", root);
    const items = [];
    if (st.due > 0) {
      items.push({ href: "#/notebook", cls: "btn danger", label: `復習ノート: ${st.due}問の期限が到来` });
    }
    if (st.readCount === 0) {
      items.push({ href: "#/mock", cls: "btn primary", label: "まずは模擬テストを1回" });
    } else {
      const score = st.readScore ?? 0;
      if (score < PRACTICE_SCORE.BUILDING) {
        items.push({ href: "#/mock", cls: "btn primary",
          label: `リーディング Practice Score ${fmtPractice(score)}% — あと${Math.ceil((PRACTICE_SCORE.BUILDING - score) / 10) * 10}で「${PRACTICE_SCORE.BANDS.building}」` });
      } else if (score < PRACTICE_SCORE.READY) {
        items.push({ href: "#/mock", cls: "btn primary",
          label: `リーディング Practice Score ${fmtPractice(score)}% — あと${Math.ceil((PRACTICE_SCORE.READY - score) / 10) * 10}で「${PRACTICE_SCORE.BANDS.ready}」` });
      } else {
        items.push({ href: "#/mock", cls: "btn soft", label: "次の回の模擬テストを受ける" });
      }
    }
    if (st.writingCount < 2) {
      items.push({ href: "#/writing", cls: "btn soft", label: "ライティング: テーマで1題書いてみる" });
    }
    if (st.speakingCount < 2) {
      items.push({ href: "#/speaking", cls: "btn soft", label: "スピーキング: 1場面を2分半で話す" });
    }
    el.innerHTML = items.slice(0, 4).map((it) =>
      `<a class="btn wide ${it.cls}" style="margin-bottom:8px" href="${it.href}">${h(it.label)}</a>`
    ).join("");
  },

  renderRecent(root) {
    const el = $("#recent", root);
    const list = Store.state.attempts.slice(-5).reverse();
    if (!list.length) {
      el.innerHTML = `<div class="empty"><div class="e-big">まだ記録がありません</div>模擬テスト・ライティング・スピーキングの記録がここに並びます</div>`;
      return;
    }
    const typeName = { reading: "リーディング", listening: "リスニング", writing: "ライティング", speaking: "スピーキング" };
    el.innerHTML = list.map((a) => {
      const ex = getSet(a.examId);
      const right = a.total != null
        ? `${a.correct}/${a.total} (${fmtPractice(practiceScore(a.correct, a.total))}%)`
        : (a.meta && a.meta.rubricAvg != null ? `自己評価 ${a.meta.rubricAvg}/5` : "記録");
      return `
        <div class="list-line">
          <span class="badge">${typeName[a.type] || a.type}</span>
          <span class="ll-main">${h(ex ? ex.label : a.examId || "（セットなし）")}<div class="ll-sub">${h(a.date)}</div></span>
          <span class="nowrap" style="font-weight:750;font-variant-numeric:tabular-nums">${right}</span>
        </div>`;
    }).join("");
  },
};
