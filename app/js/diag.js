/* ============================================================
   Prepvela — diag.js
   A diagnostics log of script errors, kept on this device only.

   index.html loads this file first, and that is the whole reason it exists.
   The app sends nothing anywhere, so there is no remote error reporting to
   turn on. What there is instead is a record that stays in local storage, and
   that the learner can read, export and clear. Nothing hidden is added; the
   record is instead kept narrow, so that what is kept can be said plainly:

     - one localStorage key (prepvela.diag.v1), separate from prepvela.v1, so a
       backup export never carries this log
     - at most 20 entries; the oldest is dropped first
     - one entry holds a time, the message cut to 200 characters, the file
       name, the line number and the build stamp. Nothing else.
     - no stack text, no typed input, no answers, no notes
     - every read and write is inside try/catch, so a full storage or a browser
       that refuses localStorage costs this file nothing
     - it opens no connection of any kind: the whole module is this object, and
       the page policy in index.html (connect-src 'none') refuses one besides

   設定 → エラー記録 offers the three actions over it: 表示 / 書き出し / 消去.
   ============================================================ */
"use strict";

/* ============================================================
   Diag — the log, as one module, and the only thing this file puts on the
   page. 設定 and tools/smoke_test.js both read its caps from here, so the
   number of entries that is kept is written down once.

   The interface a caller has to learn is four methods and three constants:

     Diag.read()    -> array; an empty array rather than a throw, ever
     Diag.record(kind, message, file, line)
     Diag.count()   -> integer
     Diag.clear()
     Diag.KEY       -> the one localStorage key this module owns
     Diag.MAX       -> how many entries are kept
     Diag.MAX_MSG   -> the ceiling on one message

   Nothing here reaches the network, and nothing here throws into the page.
   ============================================================ */
const Diag = {
  /* The one key this module owns. It is not Store.KEY, which is what keeps the
     log out of every learning-data backup. */
  KEY: "prepvela.diag.v1",
  /* How many entries are kept; the oldest is dropped first. */
  MAX: 20,
  /* The ceiling on one message, so a long exception string cannot fill the
     storage on its own. */
  MAX_MSG: 200,
  /* The build stamp, read off the same meta element js/store.js reads into
     BUILD_STAMP. This file runs before store.js, so the constant does not
     exist yet; the meta tag is in index.html, which has been parsed. */
  build() {
    try {
      const el = document.getElementById("build-stamp");
      const stamp = el && (el.getAttribute("content") || "").trim();
      return stamp || "ソースから直接読み込み";
    } catch (e) {
      return "不明";
    }
  },

  /* One entry, and the six fields it is allowed to have. The message is
     flattened to one line and cut; the filename keeps its last segment only,
     so a path cannot carry anything a message did not already carry.

     Both separators are cut, not just "/": a file:// document in a browser on
     Windows hands the error event a full C:\Users\<name>\... path, and a user
     name is the one thing a filename field must not be able to carry into a
     log the learner is invited to read out loud. */
  entry(kind, message, file, line) {
    return {
      at: new Date().toISOString(),
      kind: kind === "unhandledrejection" ? "unhandledrejection" : "error",
      msg: String(message == null ? "" : message)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, this.MAX_MSG),
      file: String(file == null ? "" : file).replace(/^.*[\\/]/, ""),
      line: Number(line) || 0,
      build: this.build(),
    };
  },

  /* The stored entries. A value this module cannot read is treated as an empty
     log rather than as a failure: a diagnostics log that raises errors while
     reporting one is worse than no log. */
  read() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (!raw) return [];
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list.filter((e) => e && typeof e === "object") : [];
    } catch (e) {
      return [];
    }
  },

  /* Add one entry, dropping the oldest past the cap. */
  record(kind, message, file, line) {
    try {
      const list = this.read();
      list.push(this.entry(kind, message, file, line));
      while (list.length > this.MAX) list.shift();
      localStorage.setItem(this.KEY, JSON.stringify(list));
    } catch (e) {
      /* Quota, or storage refused. The page going on matters more than the log. */
    }
  },

  count() {
    return this.read().length;
  },

  clear() {
    try {
      localStorage.removeItem(this.KEY);
    } catch (e) {
      /* Nothing to do, and nothing to report: this is the log. */
    }
  },
};

/* ============================================================
   Two listeners, on window: `error` and `unhandledrejection`. Neither uses
   capture, because a captured error event also sees resources that failed to
   load, and an image that did not load is not a script error.

   Both bodies are wrapped anyway. Diag.record does not throw, so the wrapper
   is not there for it: it is there so that no future edit to this file can
   turn a logged error into a second, unlogged one.
   ============================================================ */
window.addEventListener("error", (e) => {
  try {
    // An element that failed to load reports on the same event with itself as
    // the target. That is not a script error, so it is not logged as one.
    if (e && e.target && e.target !== window) return;
    Diag.record("error", e && e.message, e && e.filename, e && e.lineno);
  } catch (err) {
    /* Deliberately empty: the page continues. */
  }
});

window.addEventListener("unhandledrejection", (e) => {
  try {
    const reason = e && e.reason;
    const message =
      reason && reason.message ? reason.message :
      typeof reason === "string" ? reason :
      "Promise が棄却されました（理由不明）";
    Diag.record("unhandledrejection", message, "", 0);
  } catch (err) {
    /* Deliberately empty: the page continues. */
  }
});