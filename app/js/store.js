/* Which copy is this? The .app bundles its own copy of the site, so a stale
   bundle otherwise looks exactly like a broken build. The shell writes
   BUILD.txt next to index.html; a browser run reports the live source. */
const BUILD_STAMP = (() => {
  const el = document.getElementById("build-stamp");
  return (el && (el.getAttribute("content") || "").trim()) || "ソースから直接読み込み";
})();

/* ============================================================
   Prepvela — store.js
   State, persistence (localStorage), SRS, shared helpers.
   ============================================================ */
"use strict";

/* ------------------------------------------------ utils */
const h = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const todayStr = (d = new Date()) => {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
};
const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return todayStr(d);
};
const diffDays = (a, b) =>
  Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);

const fmtClock = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
const fmtDateJP = (str) => {
  const d = new Date(str + "T00:00:00");
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
};
const countWords = (text) => (text.match(/[A-Za-z0-9'’\-]+/g) || []).length;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ------------------------------------------------ download
   One way for the app to hand the learner a file, because a second spelling of
   it is a second chance to revoke an object URL too late or not at all. The
   blob is created here, the click is dispatched here, and the URL is released
   once the browser has taken the bytes. Nothing is uploaded: the destination
   is the save dialog the learner answers, and this function never learns what
   they answered. */
function downloadJSON(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

/* ------------------------------------------------ app identity
   One place, so the app name and the version shown in Settings can never
   drift from the ones the shell reports. */
const APP = { name: "Prepvela", version: "1.0" };

/* ============================================================
   Practice Score / Readiness — the only numbers this app reports.

   Practice Score is percent correct on 0–100 with one decimal.
   Readiness is one of low / building / ready, cut at the two
   thresholds below. Both are this app's own practice metrics: they do
   not convert to any external scale, and every screen that shows a
   score also shows PRACTICE_SCORE.NOTE through practiceNoteHTML().
   ============================================================ */
const PRACTICE_SCORE = {
  NAME: "Practice Score",
  READY: 80,
  BUILDING: 60,
  BANDS: { low: "低い", building: "伸びている", ready: "十分" },
  NOTE: "スコアは本アプリ独自の練習用の目安です。実際の試験結果を予測・保証するものではありません。",
};

/* percent correct, one decimal; null when there is nothing to grade */
const practiceScore = (correct, total) =>
  total > 0 ? Math.round(((Number(correct) || 0) / total) * 1000) / 10 : null;

/* "low" | "building" | "ready", from the two thresholds above */
const readiness = (score) =>
  score == null ? null
    : score >= PRACTICE_SCORE.READY ? "ready"
    : score >= PRACTICE_SCORE.BUILDING ? "building"
    : "low";

const readinessLabel = (score) => {
  const band = readiness(score);
  return band ? PRACTICE_SCORE.BANDS[band] : "—";
};

/* one decimal, or an em dash when nothing has been graded yet */
const fmtPractice = (score) => (score == null ? "—" : score.toFixed(1));

/* the note every score screen carries, rendered from the one constant */
const practiceNoteHTML = () => `<div class="score-note">${h(PRACTICE_SCORE.NOTE)}</div>`;

/* content data (bundled as data/bank.js -> window.PREP_BANK).
   The contract is documented at the top of that file. Only `sets`,
   `explains`, `speaking`, `vocab` and `audio` are read here. */
const DATA = window.PREP_BANK || { sets: [], speaking: null, vocab: null, explains: null, audio: null };
const SETS = Array.isArray(DATA.sets) ? DATA.sets : [];
const getSet = (id) => SETS.find((s) => s.id === id);

/* Counts that the screens put in their own copy must come from the data, so a
   partial or empty bank can never claim questions it does not have. */
const partItems = (parts) => (parts || []).flatMap((p) => p.items || []);
const readingParts = (set, partNos) =>
  (set && set.reading ? set.reading : []).filter((p) => partNos.includes(p.part));
const listeningParts = (set, partNo) =>
  (set && set.listening ? set.listening : []).filter((p) => partNo == null || p.part === partNo);

/* The bundled answer keys are 1-based (1..4), exactly as written in the set's
   own answer list. Option arrays are 0-based. Use this everywhere a stored
   answer is compared against an options index. */
const ansIdx = (item) => (item && item.answer != null ? item.answer - 1 : -1);

/* ------------------------------------------------ flashcard deck
   Words come from the bundled bank (the words a set's own questions use, plus
   an authored phrase list). Same SRS ladder as the review notebook. */
const VOCAB = DATA.vocab || { words: [], idioms: [], counts: {} };
const allCards = () => [...(VOCAB.words || []), ...(VOCAB.idioms || [])];
const cardId = (c) => `${c.kind}:${String(c.w).toLowerCase()}`;

/* Japanese explanations, keyed by set id -> section -> question number.
   See PREP_BANK.explains in data/bank.js. */
const EXPLAINS = DATA.explains || {};
const explainFor = (setId, section, item) => {
  if (!setId || !item) return null;
  const byNo = (EXPLAINS[setId] || {})[section];
  return (byNo && byNo[String(item.no)]) || null;
};

/* Render one explanation entry. Shared by the mock result screen and the
   review notebook so both show the same wording. */
const explainHTML = (ex, answerIdx) => {
  if (!ex || !ex.why) return "";
  const words = Array.isArray(ex.words) ? ex.words : [];
  return `
    <div class="explain">
      <div class="ex-head">解説</div>
      <p class="ex-why">${h(ex.why)}</p>
      ${words.length ? `
        <div class="ex-head sub">選択肢の意味</div>
        <ul class="ex-words">
          ${words.map((w, i) => `
            <li class="${i === answerIdx ? "is-answer" : ""}">
              <span class="o-no">${i + 1}</span>
              <span class="ex-w">${h(w.w)}</span>
              <span class="ex-ja">${h(w.ja)}${w.note ? `<span class="ex-note">${h(w.note)}</span>` : ""}</span>
            </li>`).join("")}
        </ul>` : ""}
    </div>`;
};

/* ------------------------------------------------ SRS for wrong answers
   stages: 0 再学習 / 1 復習1日後 / 2 復習3日後 / 3 復習7日後 / 4 習得
*/
const SRS_INTERVALS = [0, 1, 3, 7, 14]; // days until next review after a success at that stage
const SRS_LABELS = ["再学習", "1日後", "3日後", "7日後", "習得"];
const isDue = (card) => !card.due || card.due <= todayStr();

/* ------------------------------------------------ speech
   Preferred path: pre-rendered clips from tools/gen_audio.py, made with the
   macOS voices that actually sound human here (Samantha / Otoya Enhanced).
   Chrome's own voice list cannot be trusted: it can come back with every
   `lang` and `name` null, which makes voice selection a coin flip.

   Fallback path: Web Speech, with novelty voices (Bells, Boing, Wobble,
   Zarvox …) ranked last so the default is never a cartoon.
*/
const AUDIO = DATA.audio || { vocab: {}, voices: {} };

/* rank: premium > enhanced > a known-natural name > anything else */
const VOICE_RANK = [
  /\bpremium\b/i, 3,
  /\benhanced\b/i, 3,
  /^(samantha|ava|allison|alex|daniel|karen|moira|tessa|susan|serena|zoe|nicky|nathan|oliver|jamie|stephanie|joelle|linda|heather|amelie|thomas|arthur|flora|grandpa|grandma|reed|shelley|o-ren|otoya|kyoko|haruka|o-ken|nanami|samantha)\b/i, 2,
  /novelty|compact|eloquence|whisper|bells|boing|bubbles|cellos|organ|trinoids|wobble|superstar|zarvox|jester|junior|kathy|bad news|good news|pipe|deranged/i, -1,
];

const speech = {
  ok: typeof window !== "undefined" && "speechSynthesis" in window,
  voices: [],
  el: null, // shared <audio> for the pre-rendered clips
  rendered: 0,

  refresh() {
    if (!this.ok) return;
    this.voices = (window.speechSynthesis.getVoices() || []).filter((v) => v && (v.lang || v.name));
    this.rendered = Object.keys(AUDIO.vocab || {}).length;
  },

  score(v) {
    const n = `${v.name || ""} ${v.voiceURI || ""}`;
    for (let i = 0; i < VOICE_RANK.length; i += 2) {
      if (VOICE_RANK[i].test(n)) return VOICE_RANK[i + 1];
    }
    return 0;
  },

  pick(lang) {
    if (!this.voices.length) this.refresh();
    const pre = lang.slice(0, 2).toLowerCase();
    const want = lang.toLowerCase();
    const match = (v) => {
      const l = (v.lang || "").toLowerCase();
      if (l) return l === want || l.startsWith(pre);
      return new RegExp(`\\(${pre}\\b|\\(${want}\\)`, "i").test(v.name || "");
    };
    const cands = this.voices.filter(match);
    if (!cands.length) return null;
    cands.sort((a, b) => this.score(b) - this.score(a));
    return cands[0];
  },

  clipPath(key) {
    const e = (AUDIO.vocab || {})[key];
    return e && e.file ? e.file : null;
  },

  /* ---- looping ------------------------------------------------
     Used while the learner types a guess: the English keeps repeating until
     they stop typing. The clips are a single short word (~0.5s), so the gap
     is what makes each repetition separable — it is deliberately wide and
     user-adjustable (see CardsView.GAPS). */
  loopGap: 1200, // ms of silence between repeats
  loopToken: 0,
  loopTimer: null,
  loopArmed: false,
  onPlay: null,

  setGap(ms) {
    this.loopGap = Math.max(200, Math.min(4000, Number(ms) || 1200));
    try {
      const s = Store.state && Store.state.settings;
      if (s) { s.loopGapMs = this.loopGap; Store.save(); }
    } catch (e) { /* store not ready yet */ }
  },

  /* How long the current clip lasts, in ms. Before the metadata arrives
     `duration` is NaN, so fall back to a value long enough for the longest word
     in the deck (~1.2s) — a short fallback would cut a long word off before it
     finished, which is exactly the "the audio stopped" report. */
  clipMs(key) {
    const cached = key && this._durs ? this._durs[key] : 0;
    if (cached) return Math.round(cached * 1000);
    const d = this.el && this.el.duration;
    return Math.round((isFinite(d) && d > 0 ? d : 1.2) * 1000);
  },

  /* Called on every keystroke. Must NOT restart the clip: the first keypress
     begins the repetition, later ones only keep it alive. If the card's opening
     playback is still running, wait out its remainder instead of rewinding it. */
  armLoop(text, lang, clipKey) {
    if (this.loopArmed) return true;
    const hasFile = clipKey && this.clipPath(clipKey);
    if (hasFile && this.el && !this.el.paused && this.el.currentTime > 0) {
      const token = ++this.loopToken;
      this.loopArmed = true;
      const remaining = Math.max(0, this.clipMs(clipKey) - this.el.currentTime * 1000);
      this.loopTimer = setTimeout(() => {
        if (token === this.loopToken) this.loopStart(text, lang, clipKey);
      }, remaining + this.loopGap);
      return true;
    }
    return this.loopStart(text, lang, clipKey);
  },

  /* Timer-driven, not onend-driven. Relying on the media element's `onended`
     stalled intermittently (the element was re-pointed at the same src while a
     repeat was pending, and the event never arrived), which is exactly the
     "no sound" report. A self-rescheduling timer cannot stall. */
  loopStart(text, lang, clipKey) {
    this.loopStop();
    const token = ++this.loopToken;
    const hasFile = clipKey && this.clipPath(clipKey);

    if (!hasFile && !this.ok) return false;
    this.loopArmed = true;

    if (hasFile) {
      const tick = () => {
        if (token !== this.loopToken) return;
        this.loopTimer = setTimeout(() => {
          if (token !== this.loopToken) return;
          this.say(text, lang, clipKey);
          tick();
        }, this.clipMs(clipKey) + this.loopGap);
      };
      this.say(text, lang, clipKey);
      tick();
    } else {
      // speechSynthesis has no per-utterance end hook, so poll until idle.
      // Every wait is parked in loopTimer, so loopStop cancels the poll as well
      // and isLooping stays true for the whole fallback phase instead of only
      // between repeats.
      const tick = () => {
        if (token !== this.loopToken) return;
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          this.loopTimer = setTimeout(tick, 120);
        } else {
          this.loopTimer = setTimeout(() => {
            if (token !== this.loopToken) return;
            this.say(text, lang);
            tick();
          }, this.loopGap);
        }
      };
      this.say(text, lang);
      this.loopTimer = setTimeout(tick, 120);
    }
    return true;
  },

  loopStop() {
    this.loopToken++;
    this.loopArmed = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    if (this.el) this.el.onended = null;
    this.stop();
  },

  get isLooping() {
    // loopArmed is the single fact "a loop is running": it is set the moment
    // armLoop accepts and cleared by loopStop. loopTimer and the media element
    // are kept as belt and braces for a clip that outlived the flag.
    return this.loopArmed || !!this.loopTimer || !!(this.el && !this.el.paused);
  },

  /* ---- unlock / mute ------------------------------------------
     Chrome refuses programmatic playback until the page has seen a gesture,
     and a reload wipes that activation. The first card after Cmd+R therefore
     plays nothing — silently, because play() rejections were swallowed.
     Now: remember the request, surface it, and replay on the next gesture. */
  blocked: false,
  muted: false,
  pending: null,
  unlockArmed: false,
  onBlockChange: null,

  setBlocked(v) {
    if (this.blocked === v) return;
    this.blocked = v;
    if (this.onBlockChange) this.onBlockChange(v);
  },

  /* user-controlled mute, remembered across reloads */
  setMuted(v) {
    this.muted = !!v;
    if (this.muted) this.loopStop();
    else this.stop();
    try {
      const s = Store.state && Store.state.settings;
      if (s) { s.soundOff = this.muted; Store.save(); }
    } catch (e) { /* store not ready yet */ }
    if (this.onMuteChange) this.onMuteChange(this.muted);
  },

  /* one-shot listener: the first real interaction retries what was refused */
  armUnlock() {
    if (this.unlockArmed) return;
    this.unlockArmed = true;
    const handler = () => {
      document.removeEventListener("pointerdown", handler, true);
      document.removeEventListener("keydown", handler, true);
      document.removeEventListener("touchstart", handler, true);
      const p = this.pending;
      this.pending = null;
      this.setBlocked(false);
      if (p) this.say(p.text, p.lang, p.key);
    };
    ["pointerdown", "keydown", "touchstart"].forEach((ev) =>
      document.addEventListener(ev, handler, true)
    );
  },

  /* Play a pre-rendered clip. Returns true when a file was used. */
  playFile(key, text, lang) {
    const path = this.clipPath(key);
    if (!path) return false;
    if (!this.el) {
      this.el = new Audio();
      this.el.preload = "auto";
      // a single word lasts ~0.5s, which is easy to miss; flash the UI so the
      // learner can see that sound is happening even if they do not hear it
      this._durs = this._durs || {};
      this.el.onloadedmetadata = () => {
        const d = this.el.duration;
        if (isFinite(d) && d > 0) this._durs[this.el.dataset.clipKey] = d;
      };
      this.el.onplay = () => this.onPlay && this.onPlay(true);
      this.el.onpause = () => this.onPlay && this.onPlay(false);
      this.el.onended = () => this.onPlay && this.onPlay(false);
    }
    this.stop();
    this.el.dataset.clipKey = key;
    this.el.src = path;
    this.el.currentTime = 0;
    const p = this.el.play();
    if (p && p.catch) {
      p.catch((err) => {
        const name = err && err.name;
        if (name === "NotAllowedError" || name === "AbortError") {
          this.pending = { text, lang, key };
          this.armUnlock();
          this.setBlocked(true);
        } else {
          this.speak(text, lang); // decode/network failure -> synthesiser
        }
      });
    }
    return true;
  },

  /* returns false only when the platform can speak nothing at all */
  say(text, lang, clipKey) {
    if (this.muted) return false;
    if (clipKey && this.playFile(clipKey, text, lang)) return true;
    return this.speak(text, lang);
  },

  speak(text, lang) {
    if (!this.ok || !text) return false;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = lang;
      const v = this.pick(lang);
      if (v) u.voice = v;
      u.rate = lang.slice(0, 2) === "en" ? 0.92 : 1.0;
      u.pitch = 1.0;
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) {
      console.warn("speech failed", e);
      return false;
    }
  },

  stop() {
    if (this.ok) window.speechSynthesis.cancel();
    if (this.el) { this.el.pause(); }
  },
};
if (speech.ok && "onvoiceschanged" in window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => speech.refresh();
}

/* ------------------------------------------------ listening audio
   One listening item = one clip. `item.audio` is a path relative to the app
   root (assets/audio/listening/<set>-<part>-<no>.m4a); nothing is ever
   requested from the network. A clip that is not bundled, or cannot be
   decoded, falls back to reading the item's script with the browser's
   speechSynthesis, and the screen shows a short "not bundled" note so the
   learner knows why the voice is different.

   The probe is the media element itself (no fetch, no HEAD): a local file
   either reaches canplay or raises error. Both verdicts are cached per path,
   so a re-render or a second tap does not re-probe. */
const listening = {
  el: null,
  probe: new Map(),

  path(item) {
    const p = item && item.audio ? String(item.audio).trim() : "";
    return p || null;
  },

  /* one utterance per line, so the speaker changes are audible */
  lines(item) {
    return ((item && item.script) || [])
      .map((l) => String((l && l.text) || "").trim())
      .filter(Boolean);
  },

  media() {
    if (!this.el) this.el = new Audio();
    this.el.preload = "auto";
    return this.el;
  },

  canPlay(path) {
    if (!path) return Promise.resolve(false);
    if (this.probe.has(path)) return Promise.resolve(this.probe.get(path));
    return new Promise((resolve) => {
      const el = this.media();
      let settled = false;
      const finish = (v) => {
        if (settled) return;
        settled = true;
        el.removeEventListener("canplay", yes);
        el.removeEventListener("error", no);
        clearTimeout(timer);
        this.probe.set(path, v);
        resolve(v);
      };
      const yes = () => finish(true);
      const no = () => finish(false);
      el.addEventListener("canplay", yes);
      el.addEventListener("error", no);
      // an unreadable file can also fail silently, so never wait forever
      const timer = setTimeout(() => finish(false), 1500);
      el.src = path;
      el.load();
    });
  },

  /* Read the script aloud. Returns false when the platform cannot speak at
     all, so the caller can say so instead of pretending to play. */
  readScript(item) {
    const lines = this.lines(item);
    if (!lines.length) return false;
    return lines.reduce((ok, l) => speech.speak(l, "en-US") || ok, false);
  },

  /* Play one item. `onState(state, detail)` reports what happened so the view
     can label the button and place the note next to it:
       "playing" | "reading" | "unavailable" | "blocked" */
  async play(item, onState) {
    const report = (state, detail) => { try { onState && onState(state, detail); } catch (e) { /* view gone */ } };
    const path = this.path(item);

    if (!path) {
      const said = this.readScript(item);
      report(said ? "reading" : "unavailable");
      return false;
    }
    if (!(await this.canPlay(path))) {
      const said = this.readScript(item);
      report(said ? "reading" : "unavailable");
      return false;
    }
    const el = this.media();
    speech.stop();
    el.src = path;
    el.currentTime = 0;
    const p = el.play();
    if (p && p.catch) {
      p.catch((err) => {
        // Chrome refuses programmatic playback until the page has seen a
        // gesture: keep the item pending and retry on the next interaction.
        const name = err && err.name;
        if (name === "NotAllowedError" || name === "AbortError") {
          speech.pending = null;
          speech.armUnlock();
          speech.setBlocked(true);
          report("blocked");
        } else {
          const said = this.readScript(item);
          report(said ? "reading" : "unavailable");
        }
      });
    }
    report("playing");
    return true;
  },

  stop() {
    if (this.el) {
      this.el.pause();
      try { this.el.currentTime = 0; } catch (e) { /* not loaded yet */ }
    }
    speech.stop();
  },
};

/* ------------------------------------------------ store */
const Store = {
  KEY: "prepvela.v1",

  defaults() {
    return {
      settings: {
        /* A date the learner sets, not a session date. Any value works. */
        targetDate: "2027-03-31",
        targetLabel: "目標日",
      },
      attempts: [],     // {id,type,examId,date,correct,total,meta}
      notebook: {},     // key -> card
      plan: {},         // "YYYY-MM-DD" -> {checks:[bool×5], minutes:n}
      writingDrafts: [],// {id,examId,date,summaryText,essayText,rubric,...}
      speakingLog: [],  // {id,cardId,date,checks:[],note}
      vocab: {},        // cardId -> {stage, due, seen, ok, last}
      planTasks: [
        "リスニング 15分（音声）",
        "長文読解 1題（模擬テスト）",
        "ライティング 1題",
        "スピーキング 1カード",
        "復習ノートの誤答を確認",
      ],
      // Where each plan task sends you. Aligned with planTasks by index;
      // a short/absent entry simply renders the task without a link.
      planLinks: [
        { route: "#/mock", act: "listening", scope: "all", cta: "リスニング練習" },
        { route: "#/mock", act: "reading", scope: "long", cta: "長文読解練習" },
        { route: "#/writing", cta: "ライティング練習" },
        { route: "#/speaking", cta: "スピーキング練習" },
        { route: "#/notebook", cta: "復習ノート" },
      ],
    };
  },

  state: null,

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      this.state = raw ? this.merge(JSON.parse(raw)) : this.defaults();
    } catch (e) {
      console.warn("load failed, using defaults", e);
      this.state = this.defaults();
    }
    return this.state;
  },

  /* Saved state over defaults. `settings` is merged one level deeper, so a
     default added in a later version (a new setting key) is not wiped out by
     an older save that simply lacks it. */
  merge(obj) {
    const d = this.defaults();
    const out = Object.assign(d, obj);
    out.settings = Object.assign(this.defaults().settings, obj.settings || {});
    return out;
  },

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(this.state));
    } catch (e) {
      console.warn("save failed", e);
    }
  },

  reset() {
    this.state = this.defaults();
    this.save();
  },

  export() {
    return JSON.stringify(this.state, null, 2);
  },

  import(json) {
    const obj = JSON.parse(json); // throws on bad JSON
    if (!obj || typeof obj !== "object" || !obj.settings) {
      throw new Error("invalid backup format");
    }
    this.state = this.merge(obj);
    this.save();
  },

  /* ---------------- attempts */
  addAttempt(a) {
    this.state.attempts.push(Object.assign({ id: uid(), date: todayStr() }, a));
    this.save();
  },

  attemptsOf(type) {
    return this.state.attempts.filter((a) => a.type === type);
  },

  /* ---------------- notebook
     The key keeps its old `examId` segment name: it is persisted, so renaming
     it here would orphan every review card in an existing backup. */
  nbKey(section, examId, no) {
    return `${section}:${examId}:${no}`;
  },

  /* Explanation lookup: Store.explain("practice-1", "reading", item).
     Saved review cards keep the historical field name `examId`, so a backup
     written by an older build still resolves against the bank. */
  explain(setId, section, item) {
    return explainFor(setId, section, item);
  },

  addWrong(entry) {
    const key = this.nbKey(entry.section, entry.examId, entry.no);
    const card = this.state.notebook[key];
    if (card) {
      card.wrongCount = (card.wrongCount || 0) + 1;
      card.stage = 0;
      card.due = addDays(todayStr(), SRS_INTERVALS[0]);
      card.chosen = entry.chosen;
      card.seenAt = todayStr();
    } else {
      this.state.notebook[key] = Object.assign({}, entry, {
        stage: 0,
        due: addDays(todayStr(), SRS_INTERVALS[0]),
        wrongCount: 1,
        seenAt: todayStr(),
      });
    }
    this.save();
  },

  nbGrade(key, remembered) {
    const card = this.state.notebook[key];
    if (!card) return;
    // a miss drops one stage and comes back today ("今日中にもう一度"),
    // not after the drop-back stage's interval
    if (remembered) {
      card.stage = Math.min(4, (card.stage || 0) + 1);
      card.due = addDays(todayStr(), SRS_INTERVALS[card.stage]);
    } else {
      card.stage = Math.max(0, (card.stage || 0) - 1);
      card.due = todayStr();
    }
    card.reviews = (card.reviews || 0) + 1;
    this.save();
  },

  nbCards() {
    return Object.entries(this.state.notebook).map(([key, c]) => Object.assign({ key }, c));
  },

  nbDue() {
    return this.nbCards().filter((c) => c.stage < 4 && isDue(c));
  },

  nbLearned() {
    return this.nbCards().filter((c) => c.stage >= 4).length;
  },

  /* ---------------- plan */
  planDay(dateStr) {
    const t = this.state.planTasks;
    return this.state.plan[dateStr] || { checks: t.map(() => false), minutes: 0 };
  },

  setPlanCheck(dateStr, idx, val) {
    const day = JSON.parse(JSON.stringify(this.planDay(dateStr)));
    day.checks[idx] = val;
    this.state.plan[dateStr] = day;
    this.save();
  },

  /* ------------------------------------------------ flashcards */
  vocabCard(c) {
    const id = cardId(c);
    return (this.state.vocab || {})[id] || null;
  },

  /* Grade a card. `ok` moves it up the same ladder the review notebook uses;
     a miss sends it back to stage 0 and makes it due today, never further. */
  vocabRate(c, ok) {
    const id = cardId(c);
    const prev = (this.state.vocab || {})[id] || { stage: 0, seen: 0, ok: 0 };
    const stage = ok
      ? Math.min(SRS_INTERVALS.length - 1, (prev.stage || 0) + 1)
      : 0;
    const next = {
      stage,
      seen: (prev.seen || 0) + 1,
      ok: (prev.ok || 0) + (ok ? 1 : 0),
      due: addDays(todayStr(), SRS_INTERVALS[stage]),
      last: todayStr(),
    };
    this.state.vocab = this.state.vocab || {};
    this.state.vocab[id] = next;
    this.save();
    return next;
  },

  vocabMastered(c) {
    const v = this.vocabCard(c);
    return !!v && v.stage >= SRS_INTERVALS.length - 1;
  },

  /* cards the learner should see now: due ones first, then anything unseen */
  vocabPool(filter) {
    const all = allCards();
    const picked = all.filter(filter || (() => true));
    const due = [];
    const fresh = [];
    for (const c of picked) {
      const v = this.vocabCard(c);
      if (!v || v.seen === 0) fresh.push(c);
      else if (isDue(v)) due.push(c);
    }
    return { due, fresh, total: picked.length };
  },

  vocabStats() {
    const all = allCards();
    // seen = cards studied at least once; reviews/ok = every grading, so the
    // rate is correct gradings over all gradings (never above 100%)
    const s = { total: all.length, mastered: 0, due: 0, seen: 0, reviews: 0, ok: 0, rate: null };
    for (const c of all) {
      const v = this.vocabCard(c);
      if (!v || !v.seen) continue;
      s.seen++;
      s.reviews += v.seen || 0;
      s.ok += v.ok || 0;
      if (v.stage >= SRS_INTERVALS.length - 1) s.mastered++;
    }
    for (const c of all) {
      const v = this.vocabCard(c);
      if (v && v.seen > 0 && isDue(v)) s.due++;
    }
    if (s.reviews > 0) s.rate = Math.round((s.ok / s.reviews) * 100);
    return s;
  },

  /* ------------------------------------------------ plan task routing
     A plan task is a real link, so tapping it starts the activity. Tasks
     without a link (or with a planLinks array that no longer lines up) fall
     back to a plain checkbox.
  */
  taskLink(i) {
    const l = (this.state.planLinks || [])[i];
    if (!l || !l.route) return null;
    if (l.act === "reading" || l.act === "listening") {
      const scope = l.scope && l.scope !== "all" ? `&scope=${l.scope}` : "";
      return `${l.route}?act=${l.act}${scope}&exam=${this.nextSetId()}`;
    }
    if (l.route === "#/writing") return `${l.route}?exam=${this.nextSetId()}`;
    return l.route;
  },

/* The set worth attempting next: fewest attempts so far. A set carries no date
     (the authored parts have none), so there is no "newer" to compare and the
     order in data/bank.js breaks the tie — attempt 練習セット 1, then 2, then 3,
     then back to 1. That rotation is the behaviour every caller already saw
     when the three sets shared one date, so it is kept rather than invented. */
  nextSetId() {
    const seen = {};
    for (const a of (this.state.attempts || [])) {
      if (a && a.examId) seen[a.examId] = (seen[a.examId] || 0) + 1;
    }
    // Array.prototype.sort is stable, so equal attempt counts keep bank order.
    const sorted = [...SETS].sort((a, b) => (seen[a.id] || 0) - (seen[b.id] || 0));
    return sorted.length ? sorted[0].id : "";
  },

  setPlanMinutes(dateStr, val) {
    const day = JSON.parse(JSON.stringify(this.planDay(dateStr)));
    day.minutes = Math.max(0, Number(val) || 0);
    this.state.plan[dateStr] = day;
    this.save();
  },

  streak() {
    let n = 0;
    let d = todayStr();
    // today counts only if anything done; otherwise start from yesterday
    const anyOn = (ds) => {
      const p = this.state.plan[ds];
      if (p && (p.minutes > 0 || p.checks.some(Boolean))) return true;
      return this.state.attempts.some((a) => a.date === ds);
    };
    if (!anyOn(d)) d = addDays(d, -1);
    while (anyOn(d) && n < 365) {
      n++;
      d = addDays(d, -1);
    }
    return n;
  },

  /* ---------------- aggregate stats */
  stats() {
    const st = this.state;
    const read = this.attemptsOf("reading");
    const listen = this.attemptsOf("listening");
    const sum = (arr, f) => arr.reduce((o, a) => ({ c: o.c + f(a).c, t: o.t + f(a).t }), { c: 0, t: 0 });
    const rTot = sum(read, (a) => ({ c: a.correct, t: a.total }));
    const lTot = sum(listen, (a) => ({ c: a.correct, t: a.total }));
    const due = this.nbDue().length;
    const weekMin = (() => {
      let m = 0;
      for (let i = 0; i < 7; i++) {
        const p = st.plan[addDays(todayStr(), -i)];
        if (p) m += p.minutes || 0;
      }
      return m;
    })();
    return {
      readScore: practiceScore(rTot.c, rTot.t),
      readCount: rTot.t,
      listScore: practiceScore(lTot.c, lTot.t),
      listCount: lTot.t,
      writingCount: st.writingDrafts.length,
      speakingCount: st.speakingLog.length,
      due, weekMin,
      streak: this.streak(),
      learned: this.nbLearned(),
      nbTotal: this.nbCards().length,
      best: st.attempts.filter((a) => a.type === "reading" || a.type === "listening"),
    };
  },
};

/* ------------------------------------------------ timer helper
   countdown(seconds) -> {stop()} ; onTick(secLeft), onEnd() */
function startCountdown(seconds, onTick, onEnd) {
  let left = seconds;
  let last = Date.now();
  const id = setInterval(() => {
    const now = Date.now();
    left -= (now - last) / 1000;
    last = now;
    if (left <= 0) {
      clearInterval(id);
      onTick && onTick(0);
      onEnd && onEnd();
    } else {
      onTick && onTick(left);
    }
  }, 250);
  onTick && onTick(left);
  return { stop: () => clearInterval(id), get left() { return left; } };
}

/* delegated listener on the view root: replaces any previous handler
   registered for the same event type (views re-render into the same node) */
function onRoot(root, type, fn) {
  root._rb = root._rb || {};
  if (root._rb[type]) root.removeEventListener(type, root._rb[type]);
  root._rb[type] = fn;
  root.addEventListener(type, fn);
}

/* view-scoped cleanup registry (cleared on every route change) */
const ViewCleanup = {
  fns: [],
  add(fn) { this.fns.push(fn); },
  run() {
    this.fns.forEach((f) => { try { f(); } catch (e) { /* noop */ } });
    this.fns = [];
  },
};
