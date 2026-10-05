/* ============================================================
   Prepvela — main.js
   Hash router, nav highlighting, countdown badge, phone nav.
   ============================================================ */
"use strict";

/* The topbar's nav is a row of links while all seven fit beside the brand and
   the countdown, and a disclosure under one button below that width. Everything
   about the collapsed state lives here behind set(open): the router below never
   asks what shape the bar is in, and a window that crosses the width mid-session
   is answered by the same call the click handler makes. One listener per concern,
   so nothing to unwind: the router replaces #view on every route change, and the
   topbar outlives every one of them. */
const NavMenu = {
  button: null,
  nav: null,
  narrow: null,
  open: false,

  init() {
    this.button = document.getElementById("nav-toggle");
    this.nav = document.getElementById("main-nav");
    if (!this.button || !this.nav) return;
    // the same width css/styles.css collapses at, kept here rather than read
    // from a custom property because a media query cannot ask for one
    this.narrow = window.matchMedia("(max-width: 960px)");
    this.button.addEventListener("click", () => this.set(!this.open));
    document.addEventListener("keydown", (e) => {
      // Escape closes, and the keyboard goes back to the button that opened it
      if (e.key !== "Escape" || !this.open) return;
      e.preventDefault();
      this.set(false);
      this.button.focus();
    });
    document.addEventListener("click", (e) => {
      if (!this.open) return;
      if (e.target.closest("#main-nav") || this.button.contains(e.target)) return;
      this.set(false);
    });
    // The route changes under it, so the menu never stays open over the next
    // screen. In the collapsed layout a link inside it is about to become
    // display:none, and a keyboard user who activated one would otherwise land on
    // the document body on every hop: focus goes to the view that just arrived,
    // which is what #view's tabindex="-1" is there for. Only while the menu was
    // open — in the row layout the links stay on screen, so nothing is lost there
    // and the desktop keyboard order is left as it was. A mouse click never
    // focused the link, so this does nothing for one either way.
    window.addEventListener("hashchange", () => {
      if (this.open && this.nav.contains(document.activeElement)) {
        const view = document.getElementById("view");
        if (view) view.focus({ preventScroll: true });
      }
      this.set(false);
    });
    this.narrow.addEventListener("change", () => this.set(false));
    this.set(false);
  },

  /* In the row layout the button is display:none and aria-expanded would report
     a state nothing can change, so it is removed rather than left saying
     "false" about a nav that is on screen. The nav's own state is a class rather
     than [hidden]: above the breakpoint the same `.nav` rule lays it out either
     way, so a window that changes width between two clicks cannot end up with
     no navigation at all. */
  set(open) {
    const collapsed = this.narrow.matches;
    this.open = collapsed && !!open;
    this.nav.classList.toggle("open", this.open);
    if (collapsed) this.button.setAttribute("aria-expanded", String(this.open));
    else this.button.removeAttribute("aria-expanded");
  },
};

const Main = {
  routes: {
    dashboard: { view: DashboardView, title: "ホーム" },
    mock: { view: MockView, title: "模擬テスト・練習" },
    cards: { view: CardsView, title: "単語カード" },
    notebook: { view: NotebookView, title: "復習ノート" },
    writing: { view: WritingView, title: "ライティング" },
    speaking: { view: SpeakingView, title: "スピーキング" },
    settings: { view: SettingsView, title: "設定" },
  },

  go() {
    const hash = location.hash || "#/dashboard";
    const raw = hash.replace(/^#\/?/, "");
    const [pathPart, qs] = raw.split("?");
    const route = this.routes[pathPart] ? pathPart : "dashboard";
    const query = {};
    new URLSearchParams(qs || "").forEach((v, k) => (query[k] = v));

    ViewCleanup.run(); // stop timers/audio from the previous view

    // replace the view node so delegated listeners are dropped
    const old = document.getElementById("view");
    const fresh = old.cloneNode(false);
    old.replaceWith(fresh);

    $$("#main-nav a").forEach((a) =>
      a.classList.toggle("active", a.dataset.route === route)
    );
    // the nav is chrome that outlives the view, so it is never replaced with it
    document.title = `${this.routes[route].title} — ${APP.name}`;

    try {
      this.routes[route].view.render(fresh, query);
    } catch (err) {
      console.error(err);
      fresh.innerHTML = `
        <div class="card">
          <div class="empty">
            <div class="e-big">表示エラーが発生しました</div>
            ${h(err && err.message)}
            <div class="mt"><a class="btn soft" href="#/dashboard">ホームに戻る</a></div>
          </div>
        </div>`;
    }
    window.scrollTo({ top: 0 });
  },

  updateCountdown() {
    const el = document.getElementById("topbar-countdown");
    if (!el) return;
    const days = diffDays(todayStr(), Store.state.settings.targetDate);
    el.innerHTML = days >= 0
      ? `目標日まで <b>${days}</b> 日`
      : "目標日を過ぎました（設定で変更）";
    el.title = Store.state.settings.targetLabel;
  },

  boot() {
    Store.load();
    NavMenu.init();
    this.updateCountdown();
    window.addEventListener("hashchange", () => this.go());
    // Tapping a link whose href equals the current hash fires no hashchange, so
    // the view would not re-render. That happens after a flashcard batch strips
    // ?start= from the url: "単語カードトップ" then looks like a dead button.
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#/"]');
      if (!a) return;
      if (a.getAttribute("href") === (location.hash || "#/dashboard")) {
        e.preventDefault();
        this.go();
      }
    });
    this.go();
  },
};

document.addEventListener("DOMContentLoaded", () => Main.boot());
