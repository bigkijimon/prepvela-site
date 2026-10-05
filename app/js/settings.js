/* ============================================================
   Prepvela — settings.js
   目標日 / データの書き出し・書き戻し / エラー記録 / このアプリについて
   ============================================================ */
"use strict";

/* One timestamp out of a stored entry, in the form a learner reads. Kept out of
   Diag on purpose: what is stored is machine-readable, what is shown is not,
   and the log has no opinion about dates. */
const diagTime = (iso) => {
  const d = new Date(iso);
  if (!iso || isNaN(d.getTime())) return "—";
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`;
};

/* The diagnostics log, as one small module behind the section below. Its whole
   interface is four methods on Diag (js/diag.js); everything a learner sees is
   here, so the log's storage shape and this screen's wording cannot drift into
   two versions of the same thing. */
const DiagPanel = {
  id: "diag",

  /* The counter the section leads with, and the only number on it. */
  countText() {
    return `${Diag.count()}件（最大${Diag.MAX}件）`;
  },

  /* Newest first: the entry that matters is the one that just happened. The
     role is on the list because css/styles.css takes its bullets away, and in
     Safari a list without markers is no longer announced as a list at all — so
     a learner reading the log with VoiceOver would hear loose sentences where
     the screen shows numbered errors. */
  listHTML() {
    const list = Diag.read().slice().reverse();
    if (!list.length) {
      return `<div class="empty">
        <div class="e-big">記録はありません</div>
        <p>スクリプトのエラーが起きると、ここに時刻とファイル名と行番号が残ります。</p>
      </div>`;
    }
    return `<ol class="diag-list" role="list">${list.map((e) => `
      <li>
        <div class="d-when"><span class="d-time mono">${h(diagTime(e.at))}</span>
          <span class="d-kind">${e.kind === "unhandledrejection" ? "非同期の失敗" : "スクリプトエラー"}</span></div>
        <div class="d-msg">${h(e.msg || "(メッセージなし)")}</div>
        <div class="d-where mono">${h(e.file || "(ファイル名なし)")}${e.line ? `:${e.line}` : ""}
          ／ ビルド ${h(e.build || "—")}</div>
      </li>`).join("")}</ol>`;
  },

  mount(root) {
    const counter = $(`#${this.id}-count`, root);
    const panel = $(`#${this.id}-panel`, root);
    const show = $(`#${this.id}-show`, root);

    const refresh = () => {
      counter.textContent = this.countText();
      panel.innerHTML = this.listHTML();
    };
    const open = (on) => {
      panel.hidden = !on;
      show.setAttribute("aria-expanded", String(on));
      show.textContent = on ? "記録を隠す" : "記録を表示";
    };

    show.addEventListener("click", () => {
      const next = show.getAttribute("aria-expanded") !== "true";
      if (next) refresh();
      open(next);
    });

    $(`#${this.id}-export`, root).addEventListener("click", () => {
      if (!Diag.count()) {
        alert("記録はありません。書き出すものがないです。");
        return;
      }
      const list = Diag.read();
      downloadJSON(`prepvela-diag-${todayStr()}.json`, JSON.stringify({
        app: APP.name,
        version: APP.version,
        note: "このファイルはPrepvelaがこの端末の中でだけ作った記録です。どこにも送信されていません。",
        entries: list.slice().reverse(),
      }, null, 2));
    });

    $(`#${this.id}-clear`, root).addEventListener("click", () => {
      const n = Diag.count();
      // Said, not returned from: the button beside it answers an empty log the
      // same way, and a control that does nothing at all is the one failure a
      // learner cannot tell apart from a broken app.
      if (!n) {
        alert("記録はありません。消去するものもありません。");
        return;
      }
      if (!confirm(`エラー記録 ${n} 件を消去しますか？この操作は元に戻せません。`)) return;
      Diag.clear();
      refresh();
      open(false);
      alert("エラー記録を消去しました。");
    });

    refresh();
  },
};

const SettingsView = {
  render(root) {
    const s = Store.state;
    const n = s.attempts.length, nb = Object.keys(s.notebook).length;

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>設定</h1>
          <div class="sub">目標日・学習データのバックアップ・エラー記録・このアプリについて</div>
        </div>
      </div>

      <div class="grid grid-2 mb">
        <div class="card">
          <h2>目標日</h2>
          <label class="hint" for="set-label">目標ラベル（ホームに表示）</label>
          <input id="set-label" value="${h(s.settings.targetLabel)}"
            style="width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:9px;font-size:14px;margin:4px 0 12px">
          <label class="hint" for="set-date">目標日（カウントダウンの基準）</label>
          <input id="set-date" type="date" value="${h(s.settings.targetDate)}"
            style="width:100%;padding:9px 12px;border:1px solid var(--line);border-radius:9px;font-size:14px;margin-top:4px">
          <div class="hint mt-s">ここに入れるのは、あなたが自分で決める目標日です。初めは 2027-03-31 で、あとからいつでも変更できます。</div>
          <button class="btn primary mt-s" id="set-save">保存</button>
        </div>

        <div class="card">
          <h2>学習データ</h2>
          <div class="list-line"><span class="ll-main">練習の記録</span><b>${n}件</b></div>
          <div class="list-line"><span class="ll-main">復習ノート</span><b>${nb}問</b></div>
          <div class="list-line"><span class="ll-main">ライティング解答</span><b>${s.writingDrafts.length}件</b></div>
          <div class="list-line"><span class="ll-main">スピーキング練習</span><b>${s.speakingLog.length}件</b></div>
          <div class="btn-row mt">
            <button class="btn soft" id="export">バックアップを書き出す（.json）</button>
            <label class="btn">バックアップを読み込む
              <input type="file" id="import" accept="application/json,.json" style="display:none">
            </label>
          </div>
          <div class="hr"></div>
          <button class="btn danger" id="reset">全データを初期化</button>
          <div class="hint mt-s">データはこのブラウザの localStorage にのみ保存されます。端末・ブラウザを変える前に書き出しを。</div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <h2>このアプリについて</h2>
          <div class="hint">
            <p><b>${h(APP.name)}</b> バージョン <b>${h(APP.version)}</b></p>
            <p>独立した英語学習アプリです。いかなる試験団体とも提携・承認関係はありません。</p>
            <p>学習データはこの端末の localStorage にのみ保存され、どこにも送信されません。
            サーバーにもアカウントにも繋がっていない、静かなアプリです。</p>
            <p>スクリプトのエラーの診断ログも同じ端末の localStorage だけに保存され、あなたが
            自分で書き出さない限りどこにも送られません。設定 → エラー記録 で確認・書き出し・
            消去できます。</p>
            <p><b>スコア表記:</b> <b>Practice Score</b> は正答率（0〜100、小数1桁）、
            <b>Readiness</b> はその値だけで決まる3段階（${h(PRACTICE_SCORE.BANDS.low)} ${PRACTICE_SCORE.BUILDING}未満 /
            ${h(PRACTICE_SCORE.BANDS.building)} ${PRACTICE_SCORE.BUILDING}以上${PRACTICE_SCORE.READY}未満 /
            ${h(PRACTICE_SCORE.BANDS.ready)} ${PRACTICE_SCORE.READY}以上）。</p>
            <p><b>クレジット:</b> 音声は Kokoro-82M（Apache License 2.0）でオフライン生成しています。
            全文の告知は同梱の <span class="kbd">NOTICES.md</span> にあります。</p>
            ${practiceNoteHTML()}
          </div>
        </div>

        <div class="card">
          <h2>単語カードの音声</h2>
          <div class="hint">
            <p>ブラウザの読み上げは声の選択が安定しない（Chromeでは言語も名前も空で返る場合がある）ため、
            事前にレンダリングした音声ファイルがあればそれを再生し、なければWeb Speechにフォールバックします。</p>
            <p>使用中の声: 英語 <b>${h((AUDIO.voices && AUDIO.voices.en) || "—")}</b>
            （${h((AUDIO.voices && AUDIO.voices.enEngine) || "—")}${AUDIO.voices && AUDIO.voices.enRate ? ` / 速度 ${h(AUDIO.voices.enRate)}` : ""}）、
            クリップ <b>${speech.rendered}件</b>
            ${AUDIO.voices && AUDIO.voices.sampleRate
              ? ` / ${AUDIO.voices.sampleRate}Hz・${Math.round((AUDIO.voices.bitrate || 64000) / 1000)}kbps`
              : ""}。</p>
            <p>音声ファイルがない環境ではWeb Speechに自動的にフォールバックします。</p>
          </div>
        </div>

        <div class="card span-2">
          <h2>エラー記録</h2>
          <div class="list-line">
            <span class="ll-main">スクリプトエラー（この端末の中だけ）</span>
            <b id="diag-count">${DiagPanel.countText()}</b>
          </div>
          <div class="btn-row mt">
            <button class="btn soft" id="diag-show" aria-expanded="false"
                    aria-controls="diag-panel">記録を表示</button>
            <button class="btn" id="diag-export">記録を書き出す（.json）</button>
            <button class="btn danger" id="diag-clear">記録を消去</button>
          </div>
          <div class="mt-s" id="diag-panel" role="region" aria-label="エラー記録の一覧" hidden></div>
          <div class="hint mt-s">
            <p>ファイルになるのは上の書き出しボタンを押したときだけです。保存先はあなたが選ぶところだけで、
            アプリはどこへ送ったかを記録しません。</p>
            <p>この記録は学習データのバックアップには含まれません。全データを初期化しても残る項目なので、
            消すには上の「記録を消去」を使ってください。</p>
          </div>
        </div>

        <div class="card span-2">
          <h2>ビルド情報</h2>
          <div class="hint">
            <p>ビルド: <b>${h(BUILD_STAMP)}</b> ／ 単語カード ${(VOCAB.words || []).length}語 + ${(VOCAB.idioms || []).length}熟語</p>
            <p>いま起動しているアプリのビルド番号です。表示が古いときは、起動しているコピーが
            新しいビルドに差し替わっていない可能性があります。</p>
          </div>
        </div>
      </div>`;

    $("#set-save", root).addEventListener("click", () => {
      s.settings.targetLabel = $("#set-label", root).value.trim() || s.settings.targetLabel;
      s.settings.targetDate = $("#set-date", root).value || s.settings.targetDate;
      Store.save();
      Main.updateCountdown();
      alert("保存しました。");
    });

    // Both exports go through the one downloadJSON helper in js/store.js. A second
    // spelling of "hand the learner a file" is a second chance to forget the
    // URL release, so there is only this one.
    $("#export", root).addEventListener("click", () => {
      downloadJSON(`prepvela-backup-${todayStr()}.json`, Store.export());
    });

    $("#import", root).addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          Store.import(reader.result);
          alert("読み込みました。");
          location.hash = "#/dashboard";
          location.reload();
        } catch (err) {
          alert("読み込みに失敗しました: " + err.message);
        }
      };
      reader.readAsText(file);
    });

    $("#reset", root).addEventListener("click", () => {
      if (!confirm("すべての学習データを消去しますか？この操作は元に戻せません。")) return;
      if (!confirm("本当に消去しますか？")) return;
      Store.reset();
      alert("初期化しました。");
      location.hash = "#/dashboard";
      location.reload();
    });

    // The count and the three buttons, wired to the one module that owns the
    // log. Nothing else in this file touches Diag.
    DiagPanel.mount(root);
  },
};
