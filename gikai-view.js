// マチカルテ — 議会ビュー（L3 PoC）。docs/SPEC-L3-POC.md に従う。
// データは data.js(MACHIKARUTE_DATA) / gikai.js(MACHIKARUTE_GIKAI) / kokkai.js(MACHIKARUTE_KOKKAI)
// この画面は「収録した公式記録を、原典に戻れる形で読む」ことだけを担う。
// 自治体横断の件数・順位・濃淡、年次推移、テーマ別件数、AI生成の結論はここに出さない（SPEC §1.2 / §6.3）。
// どの層が欠損（空オブジェクト・空配列）でも例外を投げない実装にする。
(function () {
  "use strict";
  const DATA = window.MACHIKARUTE_DATA || [];
  const GIKAI = window.MACHIKARUTE_GIKAI || {};
  const KOKKAI = window.MACHIKARUTE_KOKKAI || {};

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // href に入れてよいURLだけを通す。esc() は属性を脱出させないが javascript: 等のスキームは防げないため、
  // http/https 以外（相対・不正・javascript:・data: など）は null を返し、呼び出し側でリンクにしない。
  function safeUrl(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    let u;
    try {
      u = new URL(s);
    } catch (e) {
      return null;
    }
    return u.protocol === "http:" || u.protocol === "https:" ? s : null;
  }

  const THEME_LABELS = {
    hoiku: "保育・園",
    gakko: "学校・放課後",
    respite: "レスパイト",
    saigai: "災害・停電",
    soudan: "相談・つなぐ人",
    ikou: "18歳の壁・移行",
  };

  // 画面1 問いカード（P0-IA.md §1画面1）。表示順もこの並びに従う
  const THEME_QUESTIONS = [
    { key: "hoiku", q: "保育園・幼稚園に行きたい" },
    { key: "gakko", q: "学校に看護師は来てくれる？" },
    { key: "saigai", q: "停電や災害が怖い" },
    { key: "respite", q: "預け先（レスパイト）が足りない" },
    { key: "ikou", q: "18歳からが不安" },
    { key: "soudan", q: "誰に相談すればいい？" },
  ];
  const THEME_QUESTION_MAP = {};
  for (const t of THEME_QUESTIONS) THEME_QUESTION_MAP[t.key] = t.q;

  // 「国の背景」の絞り込み用キーワード（scripts/build-layers.mjsのTHEME_RULESと同じ語彙。
  // milestoneにtheme_keysが無いためタイトル+概要に対して都度判定する）
  const THEME_MILESTONE_RULES = {
    hoiku: /保育|こども園|幼稚園|通園|入園|こども誰でも/,
    gakko: /学校|就学|通学|修学旅行|登下校|看護師配置|付き添い|付添|学童|放課後|スクール|教育/,
    respite: /レスパイト|短期入所|ショートステイ|一時預かり|預かり|留守番看護/,
    saigai: /災害|避難|非常用電源|停電|蓄電池|発電機|防災/,
    soudan: /コーディネーター|相談|支援センター|協議会|連携/,
    ikou: /18歳|移行|成人|卒業後|18の壁/,
  };

  // 用語チップ（I4・P0-EDITORIAL-GUIDELINES.md §5）。長い語から先にマッチさせる。
  // 適用先は収集主体の要旨（gist）と補助導線の説明のみ。引用（quote）は加工しない。
  const TERM_DICT = [
    ["医療的ケア児コーディネーター", "医療的ケア児の家族の相談相手になる専門職"],
    ["短期入所（ショートステイ）", "施設に数日泊まれる預かり制度"],
    ["障害福祉サービス", "障害のある人が使える国の制度の総称"],
    ["特別支援学校", "障害のある子のための学校"],
    ["個別避難計画", "災害のとき、その子をどう避難させるかの計画"],
    ["ショートステイ", "施設に数日泊まれる預かり制度"],
    ["日常生活用具", "吸引器など生活に必要な機器の購入を助成する制度"],
    ["陳情・請願", "住民が議会に「こうしてほしい」を正式に届ける仕組み"],
    ["レスパイト", "家族が休むための、一時的な預かり支援"],
    ["短期入所", "施設に数日泊まれる預かり制度"],
    ["一般質問", "議員が市や区に方針をたずねる質問"],
    ["定例会", "議会が年4回ひらく定期的な会議"],
    ["予算化", "お金の使い道として正式に決まること"],
    ["答弁", "質問に対する市・区（行政）の公式な回答"],
    ["会派", "考えの近い議員のグループ"],
    ["陳情", "住民が議会に「こうしてほしい」を正式に届ける仕組み"],
    ["請願", "住民が議会に「こうしてほしい」を正式に届ける仕組み"],
    ["通告", "議員が「この質問をします」と事前に届け出ること"],
  ].sort((a, b) => b[0].length - a[0].length);

  const GROUP_ORDER = ["23ku", "tama", "seirei"];

  function groupOf(m) {
    if (String(m.id).startsWith("tokyo-")) return String(m.name).endsWith("区") ? "23ku" : "tama";
    return "seirei";
  }

  // 街の母集合は「L1制度データ（DATA）」と「L3議会データ（GIKAI）」の和集合。
  // L3だけ収録した街（制度カルテに無い街）もこの画面から読めるようにする。
  // DATAに無いidは gikai.js の {id,name,pref} から最小の自治体オブジェクトを作る（itemsは持たない）。
  function municipalityList() {
    const byId = new Map(DATA.map((m) => [m.id, m]));
    for (const id of Object.keys(GIKAI)) {
      const g = GIKAI[id];
      if (!byId.has(id) && g && g.name) byId.set(id, { id, name: g.name, pref: g.pref || "" });
    }
    return Array.from(byId.values());
  }

  function sortedMunicipalities() {
    return municipalityList().sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(groupOf(a));
      const gb = GROUP_ORDER.indexOf(groupOf(b));
      if (ga !== gb) return ga - gb;
      return String(a.id).localeCompare(String(b.id), "ja");
    });
  }

  // ---- 用語チップ（I4）: escで安全化した文字列に対して辞書語を<span class="term-chip">で包む ----
  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  const TERM_RE = TERM_DICT.length ? new RegExp(TERM_DICT.map(([t]) => escapeRegExp(t)).join("|"), "g") : null;
  const TERM_NOTE = {};
  for (const [t, note] of TERM_DICT) TERM_NOTE[t] = note;
  let termChipSeq = 0;
  function chipify(raw) {
    const escaped = esc(raw);
    if (!TERM_RE || !escaped) return escaped;
    return escaped.replace(TERM_RE, (term) => {
      const note = TERM_NOTE[term];
      if (!note) return term;
      const popId = `term-chip-pop-${++termChipSeq}`;
      return `<span class="term-chip" tabindex="0" role="button" aria-expanded="false" aria-controls="${popId}" data-note="${esc(note)}">${term}<span class="term-chip__pop" id="${popId}" role="tooltip">${esc(note)}</span></span>`;
    });
  }

  // ---- 画面1: 街セレクト ----
  function populateSelect() {
    const sel = $("gikai-sel");
    if (!sel) return;
    sel.insertAdjacentHTML("beforeend", '<option value="">選んでください</option>');
    for (const m of sortedMunicipalities()) {
      sel.insertAdjacentHTML("beforeend", `<option value="${esc(m.id)}">${esc(m.pref)} ${esc(m.name)}</option>`);
    }
  }

  // ---- 3. 記録一覧（SPEC §5.1）----
  // 原典URLは折りたたみに入れず常時可視にする（SPEC §7 / §10-3）。
  // 引用は収集時に採録したもので、原典との逐語照合は未監査のため「原文引用」とは呼ばない。
  function recordHTML(t, collectedAt) {
    const src = safeUrl(t.source_url);
    return `<article class="record">
      <p class="record__head"><span class="record__date">${esc(t.date || "")}</span> ${esc(t.kaigi || "")}</p>
      <p class="record__gist">${chipify(t.gist || "")}</p>
      ${t.quote ? `<blockquote class="record__quote">${esc(t.quote)}</blockquote>` : ""}
      ${src ? `<p class="record__source"><a href="${esc(src)}" target="_blank" rel="noopener">原典を開く（会議録）</a></p>` : `<p class="record__source record__source--none">この記録の原典URLは収録できていません。</p>`}
      <p class="record__collected">収集日 ${esc(collectedAt || "不明")}</p>
    </article>`;
  }

  function recordsOf(m, themeKey) {
    const g = GIKAI[m.id];
    const topics = g && Array.isArray(g.topics) ? g.topics.slice() : [];
    const list = themeKey
      ? topics.filter((t) => Array.isArray(t.theme_keys) && t.theme_keys.includes(themeKey))
      : topics;
    list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return list;
  }

  function renderRecords(m, themeKey) {
    const wrap = $("record-list");
    const note = $("record-list-note");
    const g = GIKAI[m.id];
    // テーマ該当はキーワード照合による機械付与であることを明示する（SPEC §4.2）
    if (themeKey) {
      note.hidden = false;
      note.textContent = `「${THEME_QUESTION_MAP[themeKey] || ""}」に関係する語を含む記録を、機械的なキーワード照合で選んでいます。分類は網羅的でも厳密でもありません。`;
    } else {
      note.hidden = true;
      note.textContent = "";
    }
    if (!g) {
      wrap.innerHTML = `<p class="record-empty">この街の議会記録は、まだ収録していません。</p>`;
      return;
    }
    const list = recordsOf(m, themeKey);
    if (!list.length) {
      wrap.innerHTML = themeKey
        ? `<p class="record-empty">この問いに関する記録は、収録した範囲では見つかりませんでした。議論がなかったという意味ではありません。</p>`
        : `<p class="record-empty">収録した範囲では、記録が見つかりませんでした。議論がなかったという意味ではありません。</p>`;
      return;
    }
    wrap.innerHTML = list.map((t) => recordHTML(t, g.collected_at)).join("");
  }

  // ---- 4. 収録範囲カード（SPEC §5.2）----
  // 表示できる項目だけを出す。データに無い項目（検索した言葉・検索条件・対象会議・収集方法）は行ごと出さない。
  // 収録件数はこのカード内だけに置く（見出し・一覧・比較には置かない）。
  function renderShurokuCard(m) {
    const card = $("shuroku-card");
    const g = GIKAI[m.id];
    if (!g) {
      card.innerHTML = `<div class="shuroku-card__row"><dt>収録状況</dt><dd>この街の議会記録は、まだ収録していません。</dd></div>`;
      return;
    }
    const rows = [];
    const ks = safeUrl(g.kensaku_system);
    if (ks) {
      rows.push(`<div class="shuroku-card__row"><dt>検索システム</dt><dd><a href="${esc(ks)}" target="_blank" rel="noopener">${esc(ks)}</a></dd></div>`);
    } else if (g.kensaku_system) {
      // URLとして扱えない値はリンクにせず、そのまま名称として出す
      rows.push(`<div class="shuroku-card__row"><dt>検索システム</dt><dd>${esc(g.kensaku_system)}</dd></div>`);
    }
    if (g.search_terms) rows.push(`<div class="shuroku-card__row"><dt>検索した言葉</dt><dd>「${esc(g.search_terms)}」</dd></div>`);
    if (g.period) rows.push(`<div class="shuroku-card__row"><dt>対象期間</dt><dd>${esc(g.period)}</dd></div>`);
    if (g.target_meetings) rows.push(`<div class="shuroku-card__row"><dt>対象会議</dt><dd>${esc(g.target_meetings)}</dd></div>`);
    if (g.search_method) rows.push(`<div class="shuroku-card__row"><dt>収集方法</dt><dd>${esc(g.search_method)}</dd></div>`);
    if (g.collected_at) rows.push(`<div class="shuroku-card__row"><dt>収集日</dt><dd>${esc(g.collected_at)}</dd></div>`);
    const n = Array.isArray(g.topics) ? g.topics.length : 0;
    rows.push(`<div class="shuroku-card__row"><dt>収録した記録</dt><dd>${esc(String(n))}件</dd></div>`);
    card.innerHTML = rows.join("");
  }

  // ---- 6. 補助導線（並列。記録を読んだ後の出口） ----
  function renderExit(m, themeKey) {
    const items = m.items || {};
    const coordinator = items.coordinator;
    const soudanBody = $("exit-soudan-body");
    const label = THEME_LABELS[themeKey] || "";
    const askHTML = label
      ? `<p class="exit-card__ask">「${esc(label)}について、現在の運用を教えてください」</p>`
      : `<p class="exit-card__ask">「医療的ケアが必要な子どもの支援について、現在の運用を教えてください」</p>`;
    if (coordinator && coordinator.status !== "unconfirmed" && coordinator.details) {
      const d = coordinator.details;
      soudanBody.innerHTML = `
        <p class="exit-card__summary">${chipify(coordinator.summary || "")}</p>
        ${d.madoguchi ? `<p class="exit-card__detail">${chipify(d.madoguchi)}</p>` : ""}
        ${d.renraku ? `<p class="exit-card__detail">${chipify(d.renraku)}</p>` : ""}
        ${askHTML}`;
    } else if (!m.items) {
      // L1（制度カルテ）に未収録の街。制度カルテへ送ると該当が無く行き止まりになるため誘導しない
      soudanBody.innerHTML = `<p class="exit-card__summary">この街は制度カルテ（制度の収録）にはまだ入っていません。窓口は市の公式サイトでご確認ください。</p>${askHTML}`;
    } else {
      soudanBody.innerHTML = `<p class="exit-card__summary">この街の相談窓口情報は、まだ確認できていません。<a href="index.html">制度カルテ</a>でご確認ください。</p>${askHTML}`;
    }
    const shareResult = $("exit-share-result");
    shareResult.hidden = true;
    shareResult.textContent = "";
    // 別の街・問いへ切り替えたら、押下済みの見た目（is-answered）も文言と一緒に戻す
    $("exit-wait-body").textContent = "それも、ひとつの選び方です。";
    const waitBtn = $("exit-wait");
    if (waitBtn) waitBtn.classList.remove("is-answered");
  }

  // ---- 国の背景（kokkai milestones。件数・グラフは持たない）----
  function milestoneHTML(ms) {
    const src = safeUrl(ms.source_url);
    return `<div class="kokkai-milestone">
        <div class="kokkai-milestone__head">
          <span class="kokkai-milestone__date">${esc(ms.date || "")}</span>
          ${ms.kind ? `<span class="kokkai-milestone__kind">${esc(ms.kind)}</span>` : ""}
        </div>
        <p class="kokkai-milestone__title">${esc(ms.title || "")}</p>
        ${ms.gist ? `<p class="kokkai-milestone__gist">${chipify(ms.gist)}</p>` : ""}
        ${src ? `<p class="kokkai-milestone__source"><a href="${esc(src)}" target="_blank" rel="noopener">${esc(src)}</a></p>` : ""}
      </div>`;
  }

  function relevantMilestones(themeKey) {
    const all = Array.isArray(KOKKAI.milestones) ? KOKKAI.milestones.slice() : [];
    const re = THEME_MILESTONE_RULES[themeKey];
    const list = re ? all.filter((ms) => re.test(`${ms.title || ""}${ms.gist || ""}`)) : all;
    list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return list.slice(0, 3);
  }

  function renderKokkai(themeKey) {
    const section = $("theme-kokkai-section");
    const el = $("theme-kokkai-list");
    const list = relevantMilestones(themeKey);
    if (!list.length) {
      section.hidden = true;
      el.innerHTML = "";
      return;
    }
    list.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    el.innerHTML = list.map(milestoneHTML).join("");
    section.hidden = false;
  }

  // ---- 画面の切り替え ----
  function syncThemeCards(themeKey) {
    document.querySelectorAll(".theme-card").forEach((btn) => {
      const active = btn.dataset.theme === themeKey;
      btn.classList.toggle("is-selected", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function showCityNotFoundError() {
    const el = $("gikai-error");
    if (el) el.hidden = false;
  }
  function hideCityNotFoundError() {
    const el = $("gikai-error");
    if (el) el.hidden = true;
  }

  // 街（＋任意の問い）を選んで記録を表示する。存在しないIDはエラー案内、未知のテーマは「問い未選択」として扱う
  function selectView(id, themeKey, opts) {
    opts = opts || {};
    const m = municipalityList().find((d) => d.id === id);
    if (!m) {
      // 直前の街の記録が残ったままエラーだけ出る状態を作らない。
      // 表示（記録ビュー・街セレクト・テーマカード）と内部状態（selectedTheme）を同時に初期化してからエラーを出す
      const selEl = $("gikai-sel");
      if (selEl) selEl.value = "";
      $("record-view").hidden = true;
      selectedTheme = null;
      syncThemeCards(null);
      showCityNotFoundError();
      return false;
    }
    const theme = THEME_QUESTION_MAP[themeKey] ? themeKey : null;
    hideCityNotFoundError();
    const sel = $("gikai-sel");
    if (sel) sel.value = id;
    const q = theme ? THEME_QUESTION_MAP[theme] : "";
    $("record-title").textContent = theme ? `${q} — ${m.pref} ${m.name}の記録` : `${m.pref} ${m.name}の記録`;
    renderRecords(m, theme);
    renderShurokuCard(m);
    renderExit(m, theme);
    renderKokkai(theme);
    $("record-view").hidden = false;
    syncThemeCards(theme);
    selectedTheme = theme;
    if (opts.scroll) $("record-view").scrollIntoView({ behavior: "smooth", block: "start" });
    return true;
  }

  // 街未選択のトップ状態へ戻す（不正hashからのフォールバック用。例外は投げない）
  function resetToTopState() {
    const sel = $("gikai-sel");
    if (sel) sel.value = "";
    hideCityNotFoundError();
    $("record-view").hidden = true;
    selectedTheme = null;
    syncThemeCards(null);
  }

  function applyHash(opts) {
    let raw;
    try {
      raw = decodeURIComponent(String(location.hash || "").replace(/^#/, ""));
    } catch (e) {
      // 不正なhash（壊れた%エンコーディング等）。例外を投げず、トップ状態にフォールバックする
      resetToTopState();
      return;
    }
    if (!raw) {
      // hashを消した場合はトップ状態へ戻す
      resetToTopState();
      return;
    }
    const slash = raw.indexOf("/");
    if (slash === -1) {
      selectView(raw, null, opts || {});
      return;
    }
    selectView(raw.slice(0, slash), raw.slice(slash + 1), opts || {});
  }

  // ---- 画面1: 問いカード（選択は任意・単一選択） ----
  let selectedTheme = null;
  function bindThemeCards() {
    const cards = $("theme-cards");
    if (!cards) return;
    cards.addEventListener("click", (e) => {
      const btn = e.target.closest(".theme-card");
      if (!btn) return;
      const key = btn.dataset.theme;
      selectedTheme = selectedTheme === key ? null : key;
      syncThemeCards(selectedTheme);
    });
  }

  // ---- 補助導線: 共有 / 今は何もしない（データに依らず固定文言） ----
  function bindExitActions() {
    const shareBtn = $("exit-share");
    if (shareBtn) {
      shareBtn.addEventListener("click", () => {
        const url = location.href;
        const result = $("exit-share-result");
        const done = () => {
          result.hidden = false;
          result.textContent = "URLをコピーしました。家族・支援者に送ってください。";
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(done, () => {
            result.hidden = false;
            result.textContent = `コピーできませんでした。このURLを共有してください: ${url}`;
          });
        } else {
          result.hidden = false;
          result.textContent = `このURLを共有してください: ${url}`;
        }
      });
    }
    const waitBtn = $("exit-wait");
    if (waitBtn) {
      waitBtn.addEventListener("click", () => {
        $("exit-wait-body").textContent = "それも選択です。この街のカルテはいつでもここにあります";
        waitBtn.classList.add("is-answered");
      });
    }
  }

  // ---- 用語チップ: タップ/クリックで開閉（ホバーはCSSのみで対応） ----
  // クリック時はJSでビューポート内に収まるようposition:fixedで再配置する（375px幅で画面端のチップが
  // ポップの左右がはみ出て読めなくなるのを防ぐ。overflow-x:clipで横スクロール自体は既に発生しない）。
  function positionChipPopup(chip) {
    const pop = chip.querySelector(".term-chip__pop");
    if (!pop) return;
    const margin = 12;
    const chipRect = chip.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let left = chipRect.left + chipRect.width / 2 - popRect.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - popRect.width - margin));
    pop.style.position = "fixed";
    pop.style.left = `${left}px`;
    pop.style.top = `${chipRect.bottom + 6}px`;
    pop.style.transform = "none";
    pop.style.marginTop = "0";
  }
  function resetChipPopup(chip) {
    const pop = chip.querySelector(".term-chip__pop");
    if (!pop) return;
    pop.style.position = "";
    pop.style.left = "";
    pop.style.top = "";
    pop.style.transform = "";
    pop.style.marginTop = "";
  }
  function bindTermChips() {
    document.addEventListener("click", (e) => {
      const chip = e.target.closest(".term-chip");
      document.querySelectorAll(".term-chip.is-open").forEach((el) => {
        if (el !== chip) {
          el.classList.remove("is-open");
          el.setAttribute("aria-expanded", "false");
          resetChipPopup(el);
        }
      });
      if (!chip) return;
      const open = !chip.classList.contains("is-open");
      chip.classList.toggle("is-open", open);
      chip.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) positionChipPopup(chip);
      else resetChipPopup(chip);
    });
    document.addEventListener("keydown", (e) => {
      // Enter/Space はクリック相当（chip自体のclickハンドラに委譲し、開閉ロジックを一本化する）
      const chip = e.target && e.target.closest ? e.target.closest(".term-chip") : null;
      if (chip && (e.key === "Enter" || e.key === " " || e.key === "Spacebar")) {
        e.preventDefault();
        chip.click();
        return;
      }
      if (e.key !== "Escape") return;
      document.querySelectorAll(".term-chip.is-open").forEach((el) => {
        el.classList.remove("is-open");
        el.setAttribute("aria-expanded", "false");
        resetChipPopup(el);
      });
    });
  }

  // ---- init ----
  populateSelect();
  bindThemeCards();
  bindExitActions();
  bindTermChips();

  const picker = $("gikai-picker");
  if (picker) {
    picker.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = $("gikai-sel").value;
      if (!id) return;
      location.hash = selectedTheme ? `${id}/${selectedTheme}` : id;
      selectView(id, selectedTheme, { scroll: true });
    });
  }

  window.addEventListener("hashchange", () => applyHash({ scroll: true }));
  if (location.hash) applyHash({ scroll: false });
})();
