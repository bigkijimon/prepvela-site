/* ============================================================
   Prepvela — cards.js
   単語・熟語の暗記カード（30秒で1枚 / 音声つき / 間隔反復）
   データは data/bank.js の vocab（書き下ろした単語一覧 ＋ フレーズ一覧）。
   data/bank.js は python3 tools/merge_bank.py が生成する。
   ============================================================ */
"use strict";

let deckState = null; // {cards:[], i:0, flipped:false, filter, done:0, ok:0}

const CardsView = {
  /* ------------------------------------------------ helpers */
  /* The bundled clip for one part of a card. Pre-rendered clips are indexed by
     the card's own English (assets/audio/index.json), so the word is the key.
     A bank that names its clips with `base` still resolves, and an example
     sentence is never indexed, so it reads through the platform voice. */
  clipKey(c, part = "w") {
    if (!c) return null;
    if (c.base) return `${c.base}-${part}`;
    return part === "w" ? (c.w || null) : null;
  },

  filters: {
    due: { label: "復習すべきもの", match: (c) => { const v = Store.vocabCard(c); return !!v && v.seen > 0 && isDue(v); } },
    new: { label: "はじめて", match: (c) => !Store.vocabCard(c) || !Store.vocabCard(c).seen },
    key: { label: "正解の単語だけ", match: (c) => c.key },
    word: { label: "単語", match: (c) => c.kind === "word" },
    idiom: { label: "熟語・フレーズ", match: (c) => c.kind !== "word" },
    all: { label: "すべて", match: () => true },
  },

  shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  pick(filterKeys, limit) {
    const all = allCards();
    const keys = filterKeys && filterKeys.length ? filterKeys : ["due", "new"];
    const matched = all.filter((c) =>
      keys.some((k) => this.filters[k] && this.filters[k].match(c))
    );
    // due cards first, then unseen: the review that matters comes before new work
    const due = this.shuffle(matched.filter((c) => this.filters.due.match(c)));
    const rest = this.shuffle(matched.filter((c) => !this.filters.due.match(c)));
    const ordered = [...due, ...rest];
    return limit ? ordered.slice(0, limit) : ordered;
  },

  /* Muted on purpose -> stay silent. Only complain when the platform really
     cannot speak, which auto-play on every card render would otherwise turn
     into a wrong warning right after the user pressed the mute button. */
  say(text, lang, key) {
    if (speech.muted) return false;
    if (!speech.say(text, lang, key)) {
      toast("この環境では音声を再生できません");
    }
    return true;
  },

  /* Sound controls. Chrome blocks playback until the page sees a gesture, so
     the state is always visible instead of failing silently. The gap presets
     exist because a single word is only ~0.5s long: the pause between
     repetitions is what makes it catchable. */
  GAPS: [
    { ms: 600, label: "短い" },
    { ms: 1200, label: "ふつう" },
    { ms: 2000, label: "ゆっくり" },
    { ms: 3000, label: "とてもゆっくり" },
  ],

  soundBar() {
    const cur = speech.loopGap;
    const gaps = this.GAPS.map((g) => `
      <button class="chip ${cur === g.ms ? "on" : ""}" data-gap="${g.ms}">${h(g.label)}</button>
    `).join("");
    return `
      <div class="sound-row">
        <button class="btn sm ${speech.muted ? "" : "soft"}" data-sound="toggle">
          ${speech.muted ? "🔇 消音中（クリックで音を出す）" : "🔊 音声オン"}
        </button>
        <button class="btn sm soft" data-sound="test">🔊 音声テスト</button>
        <span class="sound-now" id="sound-now"><i></i>${speech.muted ? "消音中" : "待機中"}</span>
        <span class="muted" style="font-size:12px">単語の間隔</span>
        <span class="chip-row">${gaps}</span>
        ${speech.blocked
          ? `<span class="sound-warn">ブラウザが自動再生を止めています。画面を1回クリックすると鳴ります</span>`
          : ""}
      </div>`;
  },

  bindSound(root) {
    $$("[data-gap]", root).forEach((b) => {
      b.addEventListener("click", () => {
        speech.setGap(Number(b.dataset.gap));
        this._gapIdle = Math.max(4000, speech.loopGap * 2);
        this.refreshSoundRow(root);
      });
    });
    $$("[data-sound]", root).forEach((b) => {
      b.addEventListener("click", () => {
        if (b.dataset.sound === "toggle") {
          speech.setMuted(!speech.muted);
          this.renderCard(root);
        } else {
          const d = deckState;
          const c = d && d.cards[d.i];
          if (c) this.say(c.w, "en-US", this.clipKey(c));
          else this.say("test", "en-US");
        }
      });
    });
    const now = $("#sound-now", root);
    speech.onPlay = (playing) => {
      if (!now) return;
      now.classList.toggle("on", playing);
      now.lastChild.textContent = playing ? "再生中" : (speech.muted ? "消音中" : "待機中");
    };
  },

  refreshSoundRow(root) {
    const row = $(".sound-row", root);
    if (!row) return;
    const holder = document.createElement("div");
    holder.innerHTML = this.soundBar();
    row.replaceWith(holder.firstElementChild);
    this.bindSound(root);
  },

  /* ------------------------------------------------ typing */
  /* ms of silence after the last keystroke before the loop stops; kept above a
     couple of gaps so a wide setting still repeats a few times */
  get loopIdle() {
    return Math.max(4000, this._gapIdle || 4000);
  },
  idleTimer: null,
  _gapIdle: 4000,

  /* Recall of the English, ignoring case, spaces and punctuation.
       exact   the word                                  -> counts as 覚えた
       close   one slip (two for 9+ letters) -- a typo    -> counts as 覚えた
       prefix  the start of the word, still typing        -> live hint only
       ja      Japanese typed: the prompt IS the Japanese,
               so matching it would reward copying        -> not graded as known
       wrong   anything else
     Only exact/close pass on Enter (see passes()). A substring used to pass,
     so typing one letter and pressing Enter marked a card as learned. */
  judge(typed, c) {
    const norm = (s) => String(s || "")
      .toLowerCase()
      .replace(/[\s.,、。'"!?！？\-—–()（）「」]/g, "");
    const t = norm(typed);
    if (!t) return null;
    const en = norm(c.w);
    if (t === en) return "exact";
    if (!/[a-z]/.test(t)) return "ja";
    // an unfinished word is "still typing", never a near miss that passes
    if (t.length >= 2 && en.startsWith(t)) return "prefix";
    const slack = en.length >= 9 ? 2 : en.length >= 4 ? 1 : 0;
    if (slack && Math.abs(t.length - en.length) <= slack && this.editDistance(t, en) <= slack) return "close";
    return "wrong";
  },

  passes(verdict) {
    return verdict === "exact" || verdict === "close";
  },

  /* Edit distance where swapping two neighbouring letters ("abnadon") counts
     as one slip, the commonest typing error (optimal string alignment). */
  editDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  },

  verdictLabel(v) {
    if (v === "exact") return "一致";
    if (v === "close") return "ほぼ一致";
    if (v === "prefix") return "途中まで正しい";
    if (v === "ja") return "英語で入力";
    if (v === "wrong") return "違う";
    return "";
  },

  /* Just the letters of a string. judge() ignores spaces and punctuation, so
     grading uses this: "fell through" and "fellthrough" are the same answer. */
  letters(s) {
    return String(s || "").replace(/[^A-Za-z]/g, "");
  },

  /* The letter line counts every character, spaces included, so the line is as
     long as the word and a phrase reads as a phrase. Space cells are never
     typed into — the learner may type "fellthrough" or "fell through" and
     both fill the same letters. */
  isSpace(ch) {
    return !/[A-Za-z]/.test(ch);
  },

  /* The masked English on the front of the card: one element per letter so the
     hint can fade the answer in one letter at a time. Word gaps survive, so a
     phrase still reads as a phrase. */
  maskHTML(word, hinted) {
    let i = 0;
    return String(word || "")
      .split(/\s+/)
      .filter(Boolean)
      .map((g) => `<span class="fc-grp">${[...g]
        .map((ch) => `<i class="${hinted ? "lit" : ""}" style="--i:${i++}">${hinted ? h(ch) : "•"}</i>`)
        .join("")}</span>`)
      .join(" ");
  },

  /* The letter line is the whole typing display: every cell shows `_` until the
     letter that belongs there is typed, then it shows that letter. A letter that
     does not belong is tan, not red — this is a drill, not a mark sheet. */
  paintTrack(root, c, value) {
    const track = $("#fc-track", root);
    if (!track) return;
    const target = String(c.w || "");
    const typed = this.letters(value);
    const segs = track.children;
    // walk the word and the typed letters together; a space advances neither
    let ti = 0;
    for (let si = 0; si < segs.length; si++) {
      const seg = segs[si];
      const cell = seg.firstElementChild;
      if (this.isSpace(target[si])) {
        seg.className = "fc-seg sp";
        if (cell) cell.textContent = "";
        continue;
      }
      const done = ti < typed.length;
      const hit = done && typed[ti].toLowerCase() === target[si].toLowerCase();
      seg.className = "fc-seg" + (done ? " on" : "") + (hit ? " hit" : "") +
        (!done && ti === typed.length ? " now" : "");
      if (cell) cell.textContent = done ? typed[ti] : "_";
      ti++;
    }
    // a Japanese answer cannot be compared letter by letter; say so instead of
    // showing an empty line that looks like a failure
    const ja = !!String(value || "").trim() && !typed;
    track.dataset.mode = ja ? "ja" : "en";
    const count = $("#fc-count", root);
    if (!count) return;
    if (ja) {
      count.textContent = "日本語は文字ごとに照合しません";
    } else {
      const n = this.letters(target).length;
      const over = typed.length - n;
      count.innerHTML =
        `${typed.length}<b>/${n}文字</b>` +
        (over > 0 ? ` <span class="fc-over">+${over}</span>` : "");
    }
  },

  /* The hint is deliberately weak: the letters fade in at low opacity, so you
     can unblock yourself on a hard word without turning the card into a copy. */
  hint(root) {
    const d = deckState;
    if (!d || d.hinted) return;
    d.hinted = true;
    const c = d.cards[d.i];
    const mask = $("#fc-mask", root);
    if (mask) {
      mask.innerHTML = this.maskHTML(c.w, true);
      mask.classList.add("shown");
    }
    const btn = $("[data-hint]", root);
    if (btn) {
      btn.textContent = "答えは薄く表示中";
      btn.disabled = true;
    }
  },

  /* Typing keeps the English repeating; an idle pause lets it fall silent. */
  onTyped(root, value) {
    const d = deckState;
    if (!d) return;
    const c = d.cards[d.i];
    d.typed = value;
    d.verdict = this.judge(value, c);

    if (value.trim()) {
      // armLoop, not loopStart: a restart on every keystroke rewinds the clip
      speech.armLoop(c.w, "en-US", this.clipKey(c));
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => speech.loopStop(), this.loopIdle);
    } else {
      clearTimeout(this.idleTimer);
      speech.loopStop();
    }

    const el = $("#fc-input", root);
    if (el && el.value !== value) el.value = value;
    const v = $("#fc-verdict", root);
    if (v) {
      v.textContent = this.verdictLabel(d.verdict);
      v.className = `fc-verdict ${d.verdict ? "v-" + d.verdict : ""}`;
    }
    this.paintTrack(root, c, value);
  },

  /* ------------------------------------------------ render */
  render(root, query) {
    speech.refresh();
    const st = Store.state && Store.state.settings;
    speech.muted = !!(st && st.soundOff);
    if (st && st.loopGapMs) {
      speech.loopGap = st.loopGapMs;
      this._gapIdle = Math.max(4000, st.loopGapMs * 2);
    }
    if (query && query.start) {
      const n = Number(query.start) || 0;
      this.begin(root, query.filter ? String(query.filter).split(",") : null, n || null);
      return;
    }
    this.renderHome(root);
  },

  renderHome(root) {
    const s = Store.vocabStats();
    const counts = VOCAB.counts || {};
    const pool = Store.vocabPool();
    const dueN = pool.due.length;
    const freshN = pool.fresh.length;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>単語カード</h1>
          <div class="sub">単語${counts.words || 0}語 ＋ 熟語・フレーズ${counts.idioms || 0}件。
            1枚あたり約30秒。読み上げつき。</div>
        </div>
      </div>

      <div class="card deck-hero">
        <div class="deck-now">
          <div class="k">いま復習できる</div>
          <div class="v">${dueN}<small>枚</small></div>
          <div class="d">${freshN}枚が未学習</div>
        </div>
        <div class="deck-start">
          <a class="btn big ${dueN > 0 ? "primary" : "soft"}" href="#/cards?start=1">
            ${dueN > 0 ? "1枚だけ はじめる" : "1枚だけ はじめる"}
          </a>
          <div class="btn-row mt-s">
            <a class="btn" href="#/cards?start=1">1枚</a>
            <a class="btn" href="#/cards?start=5">5枚</a>
            <a class="btn" href="#/cards?start=15">15枚</a>
            <a class="btn" href="#/cards?start=999">全部</a>
            ${counts.keyWords
              ? `<a class="btn soft" href="#/cards?start=15&amp;filter=key">正解の単語だけ</a>`
              : ""}
          </div>
          <div class="hint mt-s">今日は1枚でもOK。終わらなくても大丈夫です。</div>
          <div class="hint mt-s">
            音声: ${speech.rendered > 0
              ? `収録済みの英語音声を再生（${speech.rendered}件）`
              : "この環境ではWeb Speechの読み上げを使用"}
          </div>
          ${this.soundBar()}
        </div>
      </div>

      <div class="stat-grid mt">
        <div class="stat"><div class="k">習得</div><div class="v">${s.mastered}<small>枚</small></div>
          <div class="d">全${s.total}枚中</div></div>
        <div class="stat"><div class="k">学習済み</div><div class="v">${s.seen}<small>枚</small></div>
          <div class="d">${s.total ? Math.round((s.seen / s.total) * 100) : 0}% を1回以上見た</div></div>
        <div class="stat"><div class="k">平均正答率</div><div class="v">${s.rate == null ? "—" : s.rate}<small>${s.rate == null ? "" : "%"}</small></div>
          <div class="d">${s.reviews}回の採点より</div></div>
        <div class="stat"><div class="k">復習待ち</div><div class="v">${dueN}<small>枚</small></div>
          <div class="d">復習期限が来ているカード</div></div>
      </div>
      ${practiceNoteHTML()}

      <div class="card mt">
        <h2>カードの内訳</h2>
        <div class="chip-row">
          <span class="chip">単語 ${counts.words || 0}</span>
          ${counts.keyWords ? `<span class="chip">そのうち正解だった語 ${counts.keyWords}</span>` : ""}
          <span class="chip">熟語・フレーズ ${counts.idioms || 0}</span>
          <span class="chip">読み上げクリップ ${speech.rendered}件</span>
        </div>
        <div class="hint mt-s">
          単語は B2〜C1 の語、熟語・フレーズは句動詞と慣用句を、このアプリのために書き下ろした一覧です。
          外部の既存問題集に基づくものではありません。英単語を入力すると、その間だけ読み上げが繰り返されます。
        </div>
      </div>`;

    this.bindSound(root);
  },

  begin(root, filterKeys, limit) {
    const cards = this.pick(filterKeys, limit);
    deckState = { cards, i: 0, flipped: false, hinted: false, done: 0, ok: 0, started: todayStr() };
    if (!cards.length) {
      this.renderHome(root);
      toast("この条件のカードは残っていません");
      return;
    }
    // Drop ?start from the URL once the batch is running, otherwise a reload
    // (or a stray refresh) silently starts the same batch again.
    if (location.hash.includes("start=")) {
      history.replaceState(null, "", "#/cards");
    }
    this.renderCard(root);
    ViewCleanup.add(() => {
      speech.stop();
      speech.loopStop();
      clearTimeout(this.idleTimer);
    });
    this.bindKeys();
  },

  /* Keyboard lives on document: the card is focused on render, but a click on
     the page background moves focus out of #view, and a root-scoped listener
     would then miss Space / 1 / 2. */
  bindKeys() {
    const onKey = (e) => {
      const d = deckState;
      if (!d || d.i >= d.cards.length) return;
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!d.flipped) this.flip(document.getElementById("view"));
        return;
      }
      if (d.flipped && (e.key === "1" || e.key === "2")) {
        e.preventDefault();
        this.rate(document.getElementById("view"), e.key === "2");
      }
    };
    document.addEventListener("keydown", onKey);
    ViewCleanup.add(() => document.removeEventListener("keydown", onKey));
  },

  renderCard(root) {
    const d = deckState;
    if (!d) return this.renderHome(root);
    if (d.i >= d.cards.length) return this.renderDone(root);
    const c = d.cards[d.i];
    const v = Store.vocabCard(c);
    const total = d.cards.length;
    const pct = Math.round((d.i / total) * 100);

    const srcLine = (c.src || [])
      .map((s) => `${s.label} Q${s.q}`)
      .join(" / ");
    const verdictText = d.typed ? this.verdictLabel(d.verdict) : "";
    const tl = this.letters(c.w);
    const segs = [...String(c.w)].map((ch) =>
      this.isSpace(ch) ? '<i class="fc-seg sp"></i>' : '<i class="fc-seg"><b>_</b></i>'
    ).join("");

    root.innerHTML = `
      <div class="session-bar">
        <div>
          <div class="s-title">単語カード</div>
          <div class="s-sub">${d.i + 1} / ${total} 枚目 — あと ${total - d.i - 1} 枚</div>
        </div>
        <div class="spacer"></div>
        <a class="btn ghost sm" href="#/cards">中断する</a>
      </div>

      ${this.soundBar()}

      <div class="deck-progress"><i style="width:${pct}%"></i></div>

      <div class="flashcard ${d.flipped ? "flipped" : ""}" id="flashcard" tabindex="0">
        <div class="fc-face fc-front">
          <div class="fc-kind">${c.kind === "word" ? "単語" : h(c.pos || "熟語・フレーズ")}</div>
          <div class="fc-prompt">${h(c.ja)}</div>
          <div class="fc-mask ${d.hinted ? "shown" : ""}" id="fc-mask" data-word="${h(c.w)}">${this.maskHTML(c.w, d.hinted)}</div>
          ${d.flipped ? "" : `
            <div class="fc-type">
              <input id="fc-input" type="text" inputmode="text" autocomplete="off"
                autocapitalize="off" spellcheck="false" aria-label="英単語を入力"
                placeholder="" value="${h(d.typed || "")}">
              <div class="fc-track" id="fc-track" data-mode="en" aria-hidden="true">${segs}</div>
              <div class="fc-meta">
                <span class="fc-count" id="fc-count">${tl.length}<b>文字</b></span>
                <span class="fc-verdict ${d.verdict ? "v-" + d.verdict : ""}" id="fc-verdict">${verdictText}</span>
              </div>
            </div>
            <button class="btn soft hint-btn" data-hint ${d.hinted ? "disabled" : ""}>
              ${d.hinted ? "答えは薄く表示中" : "ヒント（答えを薄く表示）"}
            </button>
            <div class="fc-hint">
              入力している間だけ英単語が繰り返されます（<b>${h(this.loopIdle / 1000)}秒</b>打鍵をやめると止まります）
            </div>`}
        </div>
        <div class="fc-face fc-back">
          <div class="fc-kind">答え</div>
          <div class="fc-word" data-word="${h(c.w)}">${h(c.w)}</div>
          <div class="fc-ja-sub">${h(c.ja)}</div>
          <div class="btn-row">
            ${c.ex ? `<button class="btn sm soft" data-say="ex">🔊 例文を聞く</button>` : ""}
          </div>
          ${d.typed ? `
            <div class="fc-mine">
              あなたの入力: <b>${h(d.typed)}</b>
              <span class="fc-verdict v-${d.verdict || "none"}">${verdictText}</span>
            </div>` : ""}
          ${c.note ? `<div class="fc-note">${h(c.note)}</div>` : ""}
          ${c.ex ? `<div class="fc-ex"><div class="fc-ex-en">${h(c.ex)}</div>${c.exJa ? `<div class="fc-ex-ja">${h(c.exJa)}</div>` : ""}</div>` : ""}
          ${srcLine ? `<div class="fc-src">出典: ${h(srcLine)}</div>` : ""}
          ${v ? `<div class="fc-stage">前回の到達: ${h(SRS_LABELS[v.stage] || "再学習")} / 学習${v.seen}回</div>` : ""}
        </div>
      </div>

      <div class="deck-actions">
        ${d.flipped
          ? `<button class="btn big again" data-rate="0">もう一度<span class="k">1</span></button>
             <button class="btn big got" data-rate="1">覚えた<span class="k">2</span></button>`
          : `<button class="btn big primary" data-flip>答えを見る<span class="k">Space</span></button>`}
      </div>
      <div class="hint mt-s">
        入力して <strong>Enter</strong> → 次の単語（入力内容で自動採点。空欄なら採点なし）／
        入力欄の外で <b>Space</b> 答えを見る・<b>1</b> もう一度・<b>2</b> 覚えた
        ${!speech.ok ? " / この環境は読み上げに未対応" : ""}
      </div>`;

    this.bind(root);
    this.bindSound(root);
    if (!d.flipped) {
      const input = $("#fc-input", root);
      if (input) {
        input.focus({ preventScroll: true });
        input.setSelectionRange(input.value.length, input.value.length);
      }
      this.paintTrack(root, c, d.typed || "");
      // every card speaks on arrival, idioms included: they are English too
      this.say(c.w, "en-US", this.clipKey(c));
    } else {
      const fc = $("#flashcard", root);
      if (fc) fc.focus({ preventScroll: true });
    }
  },

  bind(root) {
    const d = deckState;
    if (!d) return;
    const c = d.cards[d.i];

    onRoot(root, "input", (e) => {
      if (e.target.id === "fc-input") this.onTyped(root, e.target.value);
    });
    onRoot(root, "keydown", (e) => {
      if (e.target.id !== "fc-input") return;
      if (e.key === "Enter") {
        e.preventDefault();
        this.advance(root);
      }
    });
    onRoot(root, "focusout", (e) => {
      // leaving the field silences the loop, but keep the text for the reveal
      if (e.target.id === "fc-input" && !e.relatedTarget) {
        clearTimeout(this.idleTimer);
        speech.loopStop();
      }
    });
    // mousedown on the hint is swallowed so the field keeps focus and the caret
    onRoot(root, "mousedown", (e) => {
      if (e.target.closest("[data-hint]")) e.preventDefault();
    });
    onRoot(root, "click", (e) => {
      const sayBtn = e.target.closest("[data-say]");
      if (sayBtn) {
        const what = sayBtn.dataset.say;
        if (what === "word") this.say(c.w, "en-US", this.clipKey(c));
        else if (what === "ex") this.say(c.ex, "en-US", this.clipKey(c, "ex"));
        return;
      }
      const hintBtn = e.target.closest("[data-hint]");
      if (hintBtn) return this.hint(root);
      // clicking the card body reveals, but not a click on the letter line:
      // that click belongs to the invisible field sitting on top of it
      if (e.target.closest("#fc-input") || e.target.closest("#fc-track") ||
          e.target.closest("[data-say]")) {
        const input = $("#fc-input", root);
        if (input && e.target.closest("#fc-track")) input.focus({ preventScroll: true });
        return;
      }
      const rate = e.target.closest("[data-rate]");
      if (rate) return this.rate(root, rate.dataset.rate === "1");
      if (e.target.closest("[data-flip]")) return this.flip(root);
      if (e.target.closest("#flashcard")) return this.flip(root);
    });
  },

  /* Enter moves on instead of revealing: the verdict is already shown live while
     typing, so the answer does not need a second tap. A wrong guess still gets
     told the right answer, otherwise the information would be lost. */
  advance(root) {
    const d = deckState;
    if (!d) return;
    const c = d.cards[d.i];
    const typed = (d.typed || "").trim();
    if (typed) {
      // an answer read off the hint is not recall: it comes back today
      const ok = this.passes(d.verdict) && !d.hinted;
      Store.vocabRate(c, ok);
      d.done++;
      if (ok) d.ok++;
      if (ok && d.verdict === "close") toast(`ほぼ一致として正解: 正しいつづりは ${c.w}`);
      else if (!ok && this.passes(d.verdict)) toast(`ヒントあり: ${c.w} は今日もう一度出ます`);
      else if (!ok) toast(`正解: ${c.w} = ${c.ja}`);
    }
    clearTimeout(this.idleTimer);
    speech.loopStop();
    d.flipped = false;
    d.hinted = false;
    d.i++;
    d.typed = "";
    d.verdict = null;
    this.renderCard(root);
  },

  flip(root) {
    const d = deckState;
    if (!d || d.flipped) return;
    clearTimeout(this.idleTimer);
    speech.loopStop();
    d.flipped = true;
    const c = deckState.cards[deckState.i];
    this.renderCard(root);
    this.say(c.w, "en-US", this.clipKey(c));
  },

  rate(root, ok) {
    const d = deckState;
    if (!d || !d.flipped) return;
    clearTimeout(this.idleTimer);
    speech.loopStop();
    const c = d.cards[d.i];
    Store.vocabRate(c, ok);
    d.done++;
    if (ok) d.ok++;
    d.flipped = false;
    d.hinted = false;
    d.i++;
    d.typed = "";
    d.verdict = null;
    this.renderCard(root);
  },

  renderDone(root) {
    const d = deckState;
    const s = Store.vocabStats();
    const got = d.ok;
    const again = d.done - d.ok;
    const lastV = Store.vocabCard(d.cards[d.cards.length - 1]) || {};
    const stageName = SRS_LABELS[lastV.stage || 0];
    const nextIn = lastV.due ? diffDays(todayStr(), lastV.due) : 0;
    const nextText = nextIn <= 0 ? "今日のうちにもう一度出ます。" : `${nextIn}日後にまた出ます。`;

    // Every card was skipped with an empty Enter: nothing was graded, so do
    // not congratulate ("覚えた") for work that did not happen.
    if (d.done === 0) {
      root.innerHTML = `
        <div class="page-head">
          <div>
            <h1>採点なしで終わりました</h1>
            <div class="sub">入力せずに進んだカードは記録されません。答えを入力して Enter、または「答えを見る」から自己採点してください。</div>
          </div>
          <div class="btn-row">
            <a class="btn primary" href="#/cards?start=1">もう1枚だけ</a>
            <a class="btn" href="#/cards">単語カードトップ</a>
          </div>
        </div>`;
      return;
    }

    // A one-card batch should not end on a stats wall — offer the next card
    // first and keep the numbers small.
    if (d.done <= 1) {
      root.innerHTML = `
        <div class="page-head">
          <div>
            <h1>1枚おわり</h1>
            <div class="sub">${again === 0 ? `覚えました。このカードは${nextText}` : "もう一度今日のうちに出ます。"}</div>
          </div>
          <div class="btn-row">
            <a class="btn primary" href="#/cards?start=1">もう1枚だけ</a>
            <a class="btn" href="#/cards">単語カードトップ</a>
            <a class="btn soft" href="#/">ホームへ</a>
          </div>
        </div>
        <div class="grid grid-side">
          <div class="card">
            <div class="result-hero">
              <div class="label">この1枚</div>
              <div class="score">${again === 0 ? "覚えた" : "もう一度"}</div>
              <div class="verdict">次は <b>${h(stageName)}</b> の段階です。復習は4回続けて覚えるほど間隔が空きます。</div>
            </div>
          </div>
          <div class="card">
            <div class="list-line"><span class="ll-main">習得したカード</span><b>${s.mastered} / ${s.total} 枚</b></div>
            <div class="list-line"><span class="ll-main">平均正答率</span><b>${s.rate == null ? "—" : s.rate + "%"}</b></div>
            <div class="hint mt-s"> 右上の「単語カードトップ」から枚数を選べます。</div>
            ${practiceNoteHTML()}
          </div>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>おつかれさまでした</h1>
          <div class="sub">${d.done}枚 回しました。</div>
        </div>
        <div class="btn-row">
          <a class="btn primary" href="#/cards?start=5">もう5枚</a>
          <a class="btn" href="#/cards">単語カードトップへ</a>
          <a class="btn soft" href="#/">ホームへ戻る</a>
        </div>
      </div>

      <div class="grid grid-side">
        <div class="card">
          <div class="result-hero">
            <div class="label">この回</div>
            <div class="score">${got}<small> / ${d.done}</small></div>
            <div class="verdict">${again === 0
              ? "全問OK。覚えたカードはいずれも復習の段階を1つ進みました。"
              : `覚えた ${got} 枚 / もう一度 ${again} 枚（もう一度は今日中にまた出ます）`}</div>
          </div>
        </div>
        <div class="card">
          <div class="list-line"><span class="ll-main">習得したカード</span><b>${s.mastered} 枚</b></div>
          <div class="list-line"><span class="ll-main">全体</span><b>${s.total} 枚</b></div>
          <div class="list-line"><span class="ll-main">平均正答率</span><b>${s.rate == null ? "—" : s.rate + "%"}</b></div>
          <div class="hint mt-s">「習得」は4回連続で覚えたカードのことです。「もう一度」のカードは今日中にまた出ます。</div>
          ${practiceNoteHTML()}
        </div>
      </div>`;
  },
};

/* tiny non-blocking notice (no alert(), which stalls the loop) */
let toastTimer = null;
function toast(msg) {
  let el = $("#toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
