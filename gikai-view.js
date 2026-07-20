// マチカルテ — 議会ビュー。データは data.js(MACHIKARUTE_DATA) / gikai.js(MACHIKARUTE_GIKAI, MACHIKARUTE_GIKAI_STATS)
// / shigen.js(MACHIKARUTE_SHIGEN) / kokkai.js(MACHIKARUTE_KOKKAI) / theme-map.js(MACHIKARUTE_THEME_MAP)
// / genzaichi.js(MACHIKARUTE_GENZAICHI)
// どの層が欠損（空オブジェクト・空配列）でも例外を投げない実装にする。
(function () {
  "use strict";
  const DATA = window.MACHIKARUTE_DATA || [];
  const GIKAI = window.MACHIKARUTE_GIKAI || {};
  const STATS = window.MACHIKARUTE_GIKAI_STATS || {};
  const KOKKAI = window.MACHIKARUTE_KOKKAI || {};
  const SHIGEN = window.MACHIKARUTE_SHIGEN || {};
  const THEME_MAP = window.MACHIKARUTE_THEME_MAP || {};
  const GENZAICHI = window.MACHIKARUTE_GENZAICHI || {};

  // 現在地サマリー（GUIDELINES v1.2裁定2）のstatus記号。テキスト表示・全status同一色（インク色）。
  // ×を赤にする等の色分けは評価表示になるため禁止（P0-IA §0-4）
  const GENZAICHI_MARKS = { aru: "○", ichibu: "△", kentou: "△", nai: "×", fumei: "？" };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const yen = (n) => Number(n).toLocaleString("ja-JP");

  const THEME_ORDER = ["hoiku", "gakko", "respite", "saigai", "soudan", "ikou"];
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

  // 画面2「国の背景」の絞り込み用キーワード（scripts/build-layers.mjsのTHEME_RULESと同じ語彙。milestoneにtheme_keysが無いためタイトル+概要に対して都度判定する）
  const THEME_MILESTONE_RULES = {
    hoiku: /保育|こども園|幼稚園|通園|入園|こども誰でも/,
    gakko: /学校|就学|通学|修学旅行|登下校|看護師配置|付き添い|付添|学童|放課後|スクール|教育/,
    respite: /レスパイト|短期入所|ショートステイ|一時預かり|預かり|留守番看護/,
    saigai: /災害|避難|非常用電源|停電|蓄電池|発電機|防災/,
    soudan: /コーディネーター|相談|支援センター|協議会|連携/,
    ikou: /18歳|移行|成人|卒業後|18の壁/,
  };

  // 画面2「いま使える制度」項目の見出し・金額の読み方（app.jsのITEMS定義と揃える）
  const L1_LABELS = {
    kyuin_ki: "吸引器・吸入器の給付",
    pulse_oximeter: "パルスオキシメーターの給付",
    hijo_dengen: "非常用電源・停電への備え",
    hoiku_ukeire: "保育園での医療的ケア受け入れ",
    coordinator: "相談窓口・コーディネーター",
  };
  const L1_DEFS = {
    kyuin_ki: { amountKey: "kijun_gaku", unit: "円（基準額）" },
    pulse_oximeter: { amountKey: "kijun_gaku", unit: "円（基準額）", maxVariant: true },
    hijo_dengen: { amountKey: "kijun_gaku", unit: "円（基準額）", maxVariant: true },
    hoiku_ukeire: {},
    coordinator: {},
  };
  const L2_LABELS = { jido_hattatsu: "児童発達支援", tanki_nyusho: "短期入所（レスパイト）" };
  const CONF_LABEL = { high: "確認済（公式明記）", medium: "公式・一部曖昧", low: "要確認" };

  // 用語チップ（I4・P0-EDITORIAL-GUIDELINES.md §5）。長い語から先にマッチさせる
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
  const GROUP_LABELS = { "23ku": "東京23区", tama: "多摩", seirei: "政令市" };

  function groupOf(m) {
    if (String(m.id).startsWith("tokyo-")) return String(m.name).endsWith("区") ? "23ku" : "tama";
    return "seirei";
  }

  function sortedMunicipalities() {
    return DATA.slice().sort((a, b) => {
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

  // ---- L1（いま使える制度）の金額の読み方。app.jsのamountOf()と同じロジック ----
  function amountOf(item, def) {
    if (!def || !def.amountKey || !item || !item.details) return null;
    if (def.maxVariant) {
      const nums = [];
      for (const [k, v] of Object.entries(item.details)) {
        if (!k.startsWith("kijun_gaku")) continue;
        if (typeof v === "number") nums.push(v);
        else if (v && typeof v === "object") for (const x of Object.values(v)) { if (typeof x === "number") nums.push(x); }
      }
      return nums.length ? Math.max(...nums) : null;
    }
    const v = item.details[def.amountKey];
    return typeof v === "number" ? v : null;
  }

  // ---- 2.1 hero: 街セレクト ----
  function populateSelect() {
    const sel = $("gikai-sel");
    if (!sel) return;
    sel.insertAdjacentHTML("beforeend", '<option value="">選んでください</option>');
    for (const m of sortedMunicipalities()) {
      sel.insertAdjacentHTML("beforeend", `<option value="${esc(m.id)}">${esc(m.pref)} ${esc(m.name)}</option>`);
    }
  }

  // ---- 2.2 アンサーカード ----
  function renderAnswer(m) {
    const g = GIKAI[m.id];
    const stats = STATS[m.id];
    const numberEl = $("answer-number");
    const methodEl = $("answer-method");
    const shurokuEl = $("answer-shuroku");
    const themesEl = $("answer-themes");
    const latestEl = $("answer-latest");
    const soukatsuEl = $("answer-soukatsu");

    $("answer-city").textContent = `${m.pref} ${m.name}`;

    const unconfirmedMsg = "会議録からは確認できませんでした（議論されていないという意味ではありません。検索手段の限界の可能性があります）";
    const hitsTotal = stats && typeof stats.hits_total === "number" ? stats.hits_total : null;

    if (!g || g.status === "unconfirmed") {
      if (hitsTotal !== null) {
        // 言及数は機械計数で確認できている街：数字は見せ、収録が未整備なことを添える
        numberEl.className = "answer-card__number";
        numberEl.innerHTML = `議会会議録に『医療的ケア児』の言及<span class="answer-card__num">${esc(hitsTotal.toLocaleString("ja-JP"))}</span>件`;
        methodEl.hidden = false;
        shurokuEl.hidden = false;
        shurokuEl.textContent = "詳細の収録は準備中（検索システムの制約）";
      } else {
        numberEl.className = "answer-card__number answer-card__number--unconfirmed";
        numberEl.textContent = unconfirmedMsg;
        methodEl.hidden = true;
        shurokuEl.hidden = true;
      }
      themesEl.hidden = true;
      latestEl.hidden = true;
      soukatsuEl.textContent = (g && g.soukatsu) || "この街の議会での議論は、まだ収集できていません。";
      return;
    }

    const topics = Array.isArray(g.topics) ? g.topics.slice() : [];
    const count = stats ? stats.topic_count : topics.length;

    numberEl.className = "answer-card__number";
    if (hitsTotal !== null) {
      // 二段表示：大数字＝機械計数の言及総数／下段＝収録した注目質疑の本数
      numberEl.innerHTML = `議会会議録に『医療的ケア児』の言及<span class="answer-card__num">${esc(hitsTotal.toLocaleString("ja-JP"))}</span>件`;
      methodEl.hidden = false;
      shurokuEl.hidden = false;
      shurokuEl.innerHTML = `うち注目の質疑<span class="answer-card__shuroku-num">${esc(String(count))}</span>本を収録（直近約3年・原文引用つき）`;
    } else {
      numberEl.innerHTML = `この約3年で<span class="answer-card__num">${esc(String(count))}</span>本の質疑`;
      methodEl.hidden = true;
      shurokuEl.hidden = true;
    }

    const counts = (stats && stats.theme_counts) || {};
    const themeLine = THEME_ORDER.filter((k) => (counts[k] || 0) > 0)
      .map((k) => `${THEME_LABELS[k]} ${counts[k]}`)
      .join(" ・ ");
    if (themeLine) {
      themesEl.hidden = false;
      themesEl.textContent = themeLine;
    } else {
      themesEl.hidden = true;
    }

    topics.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const latest = topics[0];
    if (latest) {
      latestEl.hidden = false;
      const gist = latest.gist || "";
      const snippet = gist.length > 60 ? gist.slice(0, 60) + "…" : gist;
      latestEl.innerHTML = `最新の議論 — <span class="answer-card__date">${esc(latest.date || "")}</span>　${esc(snippet)}`;
    } else {
      latestEl.hidden = true;
    }

    soukatsuEl.textContent = g.soukatsu || "";
  }

  // ---- 2.3 街の議論（全topics） ----
  function topicDetailHTML(t, collectedAt) {
    const themeKeys = Array.isArray(t.theme_keys) ? t.theme_keys : [];
    const tag = themeKeys.length
      ? `<span class="gikai-topic__tag">${themeKeys.map((k) => esc(THEME_LABELS[k] || k)).join(" ・ ")}</span>`
      : "";
    return `<details class="src">
      <summary>${esc(t.date || "")} ${esc(t.kaigi || "")}${tag}</summary>
      <div class="src__body">
        <p class="kcell__summary">${esc(t.gist || "")}</p>
        ${t.quote ? `<blockquote class="src__quote">${esc(t.quote)}</blockquote>` : ""}
        <p class="src__meta">${t.source_url ? `<a href="${esc(t.source_url)}" target="_blank" rel="noopener">${esc(t.source_url)}</a><br>` : ""}取得日 ${esc(collectedAt || "")}</p>
      </div>
    </details>`;
  }

  function renderTopicsSection(m) {
    const section = $("gikai-topics-section");
    const list = $("gikai-topics-list");
    const g = GIKAI[m.id];
    const topics = g && Array.isArray(g.topics) ? g.topics.slice() : [];
    if (!topics.length) {
      section.hidden = true;
      list.innerHTML = "";
      return;
    }
    topics.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    list.innerHTML = topics.map((t) => topicDetailHTML(t, g.collected_at)).join("");
    section.hidden = false;
  }

  // ---- 画面1↔画面2の切り替え。「問いを選ばず街だけ選んだ場合=現行のアンサーカード」を維持するため、
  // 画面2に入るときだけ既存セクション（アンサーカード・全topics・国全体・マトリクス）を隠す ----
  let kokkaiSectionHasData = false; // 初期renderKokkaiSection()の結果を覚えておき、画面2から戻るとき復元する
  function setGeneralSectionsHidden(hidden) {
    const kokkaiSection = $("kokkai-section");
    const matrixSection = $("matrix-section");
    if (kokkaiSection) kokkaiSection.hidden = hidden ? true : !kokkaiSectionHasData;
    if (matrixSection) matrixSection.hidden = hidden;
  }

  function syncThemeCards(themeKey) {
    document.querySelectorAll(".theme-card").forEach((btn) => {
      const active = btn.dataset.theme === themeKey;
      btn.classList.toggle("is-selected", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  // ---- 存在しない自治体ID / テーマのエラーUI（C. URL設計・エラー時UI） ----
  function showCityNotFoundError() {
    const el = $("gikai-error");
    if (!el) return;
    el.hidden = false;
  }
  function hideCityNotFoundError() {
    const el = $("gikai-error");
    if (!el) return;
    el.hidden = true;
  }

  // ---- 街の選択 ＆ 共有可能URL ----
  function selectCity(id, opts) {
    opts = opts || {};
    const m = DATA.find((d) => d.id === id);
    if (!m) {
      showCityNotFoundError();
      return false;
    }
    hideCityNotFoundError();
    const sel = $("gikai-sel");
    if (sel) sel.value = id;
    renderAnswer(m);
    renderTopicsSection(m);
    $("theme-view").hidden = true;
    $("answer-wrap").hidden = false;
    setGeneralSectionsHidden(false);
    syncThemeCards(null);
    if (opts.scroll) {
      $("answer-wrap").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return true;
  }

  // ---- 画面2: この街の現在地（問い×街）----
  function l1CellHTML(key, item, collectedAt) {
    const label = L1_LABELS[key] || key;
    const def = L1_DEFS[key] || {};
    if (!item || item.status === "unconfirmed") {
      return `<div class="theme-item" data-l1-key="${esc(key)}">
        <h4 class="theme-item__title">${esc(label)}</h4>
        <p class="kcell__summary kcell--unconfirmed">未確認 — 公式ページで確認できませんでした。制度がないという意味ではありません。窓口でご確認ください。</p>
      </div>`;
    }
    const amount = amountOf(item, def);
    const genbutsu = item.details && item.details.genbutsu === true;
    const amountHTML =
      amount !== null
        ? `<p class="kcell__amount">${yen(amount)}<span class="proof__unit"> ${esc(def.unit || "")}</span></p>`
        : genbutsu
        ? `<p class="kcell__amount">現物給付<span class="proof__unit">（無償配付）</span></p>`
        : "";
    const src = item.source || {};
    return `<div class="theme-item" data-l1-key="${esc(key)}">
      <h4 class="theme-item__title">${esc(label)}</h4>
      ${amountHTML}
      <p class="kcell__summary">${chipify(item.summary)}</p>
      <p class="conf" data-level="${esc(item.confidence)}">たしかさ: ${esc(CONF_LABEL[item.confidence] || item.confidence)}</p>
      ${src.url ? `<details class="src"><summary>出典を読む</summary>
        <div class="src__body">
          <blockquote class="src__quote">${chipify(src.quote || "")}</blockquote>
          <p class="src__meta"><a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.page_title || src.url)}</a><br>取得日 ${esc(collectedAt || "")}</p>
        </div></details>` : ""}
    </div>`;
  }

  function renderThemeL1(m, themeKey) {
    const wrap = $("theme-l1");
    const map = THEME_MAP[themeKey] || {};
    const l1Keys = Array.isArray(map.l1) ? map.l1 : [];
    if (!l1Keys.length) {
      wrap.innerHTML = `<p class="kcell__summary">この項目の制度データはまだ収録していません。<a href="index.html">制度カルテ</a>で近い項目を確認できます。</p>`;
      return;
    }
    const items = m.items || {};
    wrap.innerHTML = l1Keys.map((key) => l1CellHTML(key, items[key], m.collected_at)).join("");
  }

  function renderThemeL2(m, themeKey) {
    const section = $("theme-l2-section");
    const wrap = $("theme-l2");
    const map = THEME_MAP[themeKey] || {};
    const l2Keys = Array.isArray(map.l2) ? map.l2 : [];
    if (!l2Keys.length) {
      section.hidden = true;
      wrap.innerHTML = "";
      return;
    }
    section.hidden = false;
    const s = SHIGEN[m.id];
    if (!s) {
      wrap.innerHTML = `<p class="kcell__summary">未集計</p>`;
      return;
    }
    const counts = s.counts || {};
    const itemsHTML = l2Keys
      .map((key) => {
        const label = L2_LABELS[key] || key;
        const n = counts[key];
        const valueHTML =
          n === null || n === undefined
            ? `<span class="kcell__summary">未集計</span>`
            : `<span class="kcell__amount">${yen(n)}<span class="proof__unit"> ヶ所</span></span>`;
        return `<li class="shigen__item"><span class="shigen__label">${esc(label)}</span>${valueHTML}</li>`;
      })
      .join("");
    const src = (s.sources && s.sources[0]) || {};
    const sourceHTML = src.name ? `<p class="src__meta">${esc(src.name)}${s.data_date ? `（${esc(s.data_date)}）` : ""}</p>` : "";
    wrap.innerHTML = `<ul class="shigen__list">${itemsHTML}</ul><p class="origin origin--jissoku">実測データ</p>${sourceHTML}`;
  }

  function themeTopicHTML(t, collectedAt) {
    const hasLayer = !!(t.yasashii || t.kimatta_mikettei || t.seikatsu_eikyo);
    // 確認案内の定型行はGUIDELINES v1.2裁定1のUI固定文言（生成テキストには含めない）。3層ブロックの直下に常設
    return `<article class="theme-topic" data-topic-key="${esc(`${t.date || ""}|${t.kaigi || ""}`)}">
      <p class="theme-topic__head"><span class="theme-topic__date">${esc(t.date || "")}</span> ${esc(t.kaigi || "")}</p>
      <p class="kcell__summary">${chipify(t.gist || "")}</p>
      ${t.quote ? `<blockquote class="src__quote">${chipify(t.quote)}</blockquote>` : ""}
      <p class="src__meta">${t.source_url ? `<a href="${esc(t.source_url)}" target="_blank" rel="noopener">${esc(t.source_url)}</a><br>` : ""}取得日 ${esc(collectedAt || "")}</p>
      ${hasLayer ? `<div class="layer3">
        <p class="layer3__badge">AIによる要約</p>
        ${t.yasashii ? `<p class="layer3__row"><span class="layer3__label">やさしい説明</span>${chipify(t.yasashii)}</p>` : ""}
        ${t.kimatta_mikettei ? `<p class="layer3__row"><span class="layer3__label">決まったこと・決まっていないこと</span>${chipify(t.kimatta_mikettei)}</p>` : ""}
        ${t.seikatsu_eikyo ? `<p class="layer3__row"><span class="layer3__label">生活への影響</span>${chipify(t.seikatsu_eikyo)}</p>` : ""}
        <p class="layer3__note">要約に違和感があれば、必ず原文をご確認ください。</p>
      </div>
      <p class="layer3__kakunin">必要なら、相談窓口で現在の運用を確認してください。</p>` : ""}
    </article>`;
  }

  function renderThemeL3(m, themeKey) {
    const wrap = $("theme-l3");
    const g = GIKAI[m.id];
    const topics = g && Array.isArray(g.topics) ? g.topics.filter((t) => Array.isArray(t.theme_keys) && t.theme_keys.includes(themeKey)) : [];
    if (!topics.length) {
      wrap.innerHTML = `<p class="kcell__summary">この街の議会では、まだこのテーマの質疑を確認できていません（議論されていないという意味ではありません）。</p>`;
      return;
    }
    topics.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    wrap.innerHTML = topics.map((t) => themeTopicHTML(t, g.collected_at)).join("");
  }

  function renderThemeChart(m) {
    const section = $("theme-chart-section");
    const stats = STATS[m.id];
    const hitsByYear = stats && stats.hits_by_year;
    if (!hitsByYear) {
      section.hidden = true;
      $("theme-year-chart").innerHTML = "";
      return;
    }
    section.hidden = false;
    const entries = Object.entries(hitsByYear).filter(([, v]) => typeof v === "number");
    renderYearChart(
      $("theme-year-chart"),
      hitsByYear,
      `${m.pref} ${m.name}での「医療的ケア児」言及数の推移（${entries.map(([y, v]) => `${y}年 ${v}件`).join("、")}）`
    );
  }

  function relevantMilestones(themeKey) {
    const re = THEME_MILESTONE_RULES[themeKey];
    if (!re) return [];
    const list = (Array.isArray(KOKKAI.milestones) ? KOKKAI.milestones : []).filter((ms) => re.test(`${ms.title || ""}${ms.gist || ""}`));
    list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    return list.slice(0, 3);
  }

  function renderThemeKokkai(themeKey) {
    const section = $("theme-kokkai-section");
    const list = relevantMilestones(themeKey);
    if (!list.length) {
      section.hidden = true;
      $("theme-kokkai-list").innerHTML = "";
      return;
    }
    section.hidden = false;
    renderMilestoneList($("theme-kokkai-list"), list);
  }

  function renderThemeExit(m, themeKey) {
    const items = m.items || {};
    const coordinator = items.coordinator;
    const soudanBody = $("exit-soudan-body");
    const label = THEME_LABELS[themeKey] || "";
    const askHTML = `<p class="exit-card__ask">「${esc(label)}について、現在の運用を教えてください」</p>`;
    if (coordinator && coordinator.status !== "unconfirmed" && coordinator.details) {
      const d = coordinator.details;
      soudanBody.innerHTML = `
        <p class="kcell__summary">${chipify(coordinator.summary || "")}</p>
        ${d.madoguchi ? `<p class="exit-card__detail">${chipify(d.madoguchi)}</p>` : ""}
        ${d.renraku ? `<p class="exit-card__detail">${chipify(d.renraku)}</p>` : ""}
        ${askHTML}`;
    } else {
      soudanBody.innerHTML = `<p class="kcell__summary">この街の相談窓口情報は、まだ確認できていません。<a href="index.html">制度カルテ</a>でご確認ください。</p>${askHTML}`;
    }
    const shareResult = $("exit-share-result");
    shareResult.hidden = true;
    shareResult.textContent = "";
    $("exit-wait-body").textContent = "それも、ひとつの選び方です。";
  }

  // ---- 0. 現在地サマリー（答えファースト・GUIDELINES v1.2裁定2） ----
  // source_ref → スクロール先: l1:<itemKey>=制度セクション（該当項目があればそこへ）／
  // l3:<date>|<kaigi>=議会セクション（該当topicがあればそこへ）／l2:=受け皿セクション。
  // 参照先が描画されていなければセクション先頭へフォールバック（例外は投げない）
  function genzaichiScrollTarget(sourceRef) {
    const ref = String(sourceRef || "");
    if (ref.startsWith("l1:")) {
      const key = ref.slice(3);
      return document.querySelector(`#theme-l1-section [data-l1-key="${CSS.escape(key)}"]`) || $("theme-l1-section");
    }
    if (ref.startsWith("l3:")) {
      const key = ref.slice(3);
      return document.querySelector(`#theme-l3-section [data-topic-key="${CSS.escape(key)}"]`) || $("theme-l3-section");
    }
    if (ref.startsWith("l2:")) return $("theme-l2-section");
    return null;
  }

  function renderGenzaichi(m, themeKey) {
    const card = $("genzaichi-card");
    const themes = GENZAICHI[m.id];
    const v = themes && themes[themeKey];
    const kotae = v && v.kotae;
    if (!kotae || !kotae.text) {
      card.hidden = true;
      $("genzaichi-kotae").innerHTML = "";
      $("genzaichi-wakatta").innerHTML = "";
      $("genzaichi-wakatta-wrap").hidden = true;
      return;
    }
    const mark = GENZAICHI_MARKS[kotae.status] || "？";
    $("genzaichi-kotae").innerHTML = `<span class="genzaichi-card__mark" aria-hidden="true">${esc(mark)}</span>${chipify(kotae.text)}`;
    const wakatta = Array.isArray(v.wakatta) ? v.wakatta.filter((w) => w && w.text) : [];
    if (wakatta.length) {
      $("genzaichi-wakatta").innerHTML = wakatta
        .map((w) => {
          const ref = String(w.source_ref || "");
          return ref
            ? `<li class="genzaichi-card__item"><button type="button" class="genzaichi-card__link" data-source-ref="${esc(ref)}">${chipify(w.text)}</button></li>`
            : `<li class="genzaichi-card__item">${chipify(w.text)}</li>`;
        })
        .join("");
      $("genzaichi-wakatta-wrap").hidden = false;
    } else {
      $("genzaichi-wakatta").innerHTML = "";
      $("genzaichi-wakatta-wrap").hidden = true;
    }
    card.hidden = false;
  }

  function renderThemeView(m, themeKey) {
    const q = THEME_QUESTION_MAP[themeKey] || "";
    $("theme-title").textContent = `${q} — ${m.pref} ${m.name}の現在地`;
    // 詳細セクションを先に描画してからサマリーを描く（スクロール先の実在確認は押下時に行うが、順序も揃えておく）
    renderThemeL1(m, themeKey);
    renderThemeL2(m, themeKey);
    renderThemeL3(m, themeKey);
    renderThemeChart(m);
    renderThemeKokkai(themeKey);
    renderThemeExit(m, themeKey);
    renderGenzaichi(m, themeKey);
  }

  function selectThemeCity(id, themeKey, opts) {
    opts = opts || {};
    const m = DATA.find((d) => d.id === id);
    if (!m) {
      showCityNotFoundError();
      return false;
    }
    if (!THEME_QUESTION_MAP[themeKey]) return selectCity(id, opts);
    hideCityNotFoundError();
    const sel = $("gikai-sel");
    if (sel) sel.value = id;
    renderThemeView(m, themeKey);
    $("answer-wrap").hidden = true;
    $("gikai-topics-section").hidden = true;
    $("theme-view").hidden = false;
    setGeneralSectionsHidden(true);
    syncThemeCards(themeKey);
    if (opts.scroll) {
      $("theme-view").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return true;
  }

  // 問い未選択・街未選択のトップ状態へ戻す（不正hashからのフォールバック用。例外は投げない）
  function resetToTopState() {
    const sel = $("gikai-sel");
    if (sel) sel.value = "";
    hideCityNotFoundError();
    $("theme-view").hidden = true;
    $("answer-wrap").hidden = true;
    $("gikai-topics-section").hidden = true;
    setGeneralSectionsHidden(false);
    syncThemeCards(null);
  }

  function applyHash(opts) {
    let raw;
    try {
      raw = decodeURIComponent(String(location.hash || "").replace(/^#/, ""));
    } catch (e) {
      // 不正なhash（壊れた%エンコーディング等）。例外を投げず、問い未選択のトップ状態にフォールバックする
      resetToTopState();
      return;
    }
    if (!raw) return;
    const slash = raw.indexOf("/");
    if (slash === -1) {
      selectCity(raw, opts || {});
      return;
    }
    const id = raw.slice(0, slash);
    const themeKey = raw.slice(slash + 1);
    if (THEME_QUESTION_MAP[themeKey]) {
      selectThemeCity(id, themeKey, opts || {});
    } else {
      selectCity(id, opts || {});
    }
  }

  // ---- 2.4 国の動き（KOKKAIがある場合のみ）---- milestoneHTML/年次バーは画面2（テーマ絞り込み）とも共有する
  function milestoneHTML(ms) {
    return `<div class="kokkai-milestone">
        <div class="kokkai-milestone__head">
          <span class="kokkai-milestone__date">${esc(ms.date || "")}</span>
          ${ms.kind ? `<span class="kokkai-milestone__kind">${esc(ms.kind)}</span>` : ""}
        </div>
        <p class="kokkai-milestone__title">${esc(ms.title || "")}</p>
        ${ms.gist ? `<p class="kokkai-milestone__gist">${chipify(ms.gist)}</p>` : ""}
        ${ms.source_url ? `<p class="kokkai-milestone__source"><a href="${esc(ms.source_url)}" target="_blank" rel="noopener">${esc(ms.source_url)}</a></p>` : ""}
      </div>`;
  }

  function renderMilestoneList(el, milestones, opts) {
    if (!el) return;
    opts = opts || {};
    const list = Array.isArray(milestones) ? milestones.slice() : [];
    if (!list.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    list.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    el.innerHTML = list.map(milestoneHTML).join("");
    el.hidden = false;
  }

  function renderTimeline(milestones) {
    renderMilestoneList($("kokkai-timeline"), milestones);
  }

  // 国会グラフと同型・同トークン。他画面（画面2の街全体推移）でも同じ関数を使い回す
  function renderYearChart(el, hitsByYear, ariaText) {
    if (!el) return;
    const entries = Object.entries(hitsByYear || {}).filter(([, v]) => typeof v === "number");
    if (!entries.length) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    const max = Math.max(...entries.map(([, v]) => v), 1);
    el.setAttribute("role", "img");
    el.setAttribute("aria-label", ariaText || `「医療的ケア児」言及数の推移（${entries.map(([y, v]) => `${y}年 ${v}件`).join("、")}）`);
    el.innerHTML = entries
      .map(([y, v]) => {
        const pct = Math.max(4, Math.round((v / max) * 100));
        return `<div class="kokkai-bar">
          <span class="kokkai-bar__count">${esc(String(v))}</span>
          <div class="kokkai-bar__track"><div class="kokkai-bar__fill" style="height:${pct}%"></div></div>
          <span class="kokkai-bar__year">${esc(y)}</span>
        </div>`;
      })
      .join("");
    el.hidden = false;
  }

  function renderKokkaiChart(hitsByYear) {
    const entries = Object.entries(hitsByYear || {}).filter(([, v]) => typeof v === "number");
    renderYearChart($("kokkai-chart"), hitsByYear, `国会での「医療的ケア児」言及数の推移（${entries.map(([y, v]) => `${y}年 ${v}件`).join("、")}）`);
  }

  function kokkaiTopicHTML(t) {
    const speaker = t.speaker ? ` ・ ${esc(t.speaker)}` : "";
    return `<details class="src">
      <summary>${esc(t.date || "")} ${esc(t.kaigi || "")}${speaker}</summary>
      <div class="src__body">
        <p class="kcell__summary">${esc(t.gist || "")}</p>
        ${t.quote ? `<blockquote class="src__quote">${esc(t.quote)}</blockquote>` : ""}
        <p class="src__meta">${t.source_url ? `<a href="${esc(t.source_url)}" target="_blank" rel="noopener">${esc(t.source_url)}</a>` : ""}</p>
      </div>
    </details>`;
  }

  function renderKokkaiTopics(topics) {
    const el = $("kokkai-topics-list");
    const list = Array.isArray(topics) ? topics.slice(0, 10) : [];
    el.innerHTML = list.map(kokkaiTopicHTML).join("");
  }

  function renderKokkaiSection() {
    const section = $("kokkai-section");
    const hasMilestones = Array.isArray(KOKKAI.milestones) && KOKKAI.milestones.length > 0;
    const hasTopics = Array.isArray(KOKKAI.kokkai_topics) && KOKKAI.kokkai_topics.length > 0;
    const hasStats = !!(KOKKAI.stats && KOKKAI.stats.hits_by_year && Object.keys(KOKKAI.stats.hits_by_year).length);
    if (!hasMilestones && !hasTopics && !hasStats) {
      section.hidden = true;
      return;
    }
    section.hidden = false;
    renderTimeline(KOKKAI.milestones);
    renderKokkaiChart(KOKKAI.stats && KOKKAI.stats.hits_by_year);
    renderKokkaiTopics(KOKKAI.kokkai_topics);
  }

  // ---- 2.5 全国の熱量マトリクス ----
  function themeCellHTML(key, n) {
    const label = THEME_LABELS[key];
    const cls = n >= 5 ? "l" : n >= 3 ? "m" : n >= 1 ? "s" : "";
    const dot = cls ? `<span class="matrix-dot matrix-dot--${cls}" aria-hidden="true"></span>` : "";
    return `<td class="matrix-cell" title="${esc(label)} ${esc(String(n))}件" aria-label="${esc(label)} ${esc(String(n))}件">${dot}</td>`;
  }

  function renderMatrix() {
    const titleEl = $("matrix-section-title");
    if (titleEl) titleEl.textContent = `${DATA.length}の街の、議論の分布。`;
    const table = $("matrix-table");
    const theadHTML = `<thead><tr><th>自治体</th><th>言及</th>${THEME_ORDER.map((k) => `<th>${esc(THEME_LABELS[k])}</th>`).join("")}</tr></thead>`;
    const rows = [];
    let lastGroup = null;
    for (const m of sortedMunicipalities()) {
      const grp = groupOf(m);
      if (grp !== lastGroup) {
        rows.push(`<tr class="matrix-group"><th colspan="${THEME_ORDER.length + 2}">${esc(GROUP_LABELS[grp])}</th></tr>`);
        lastGroup = grp;
      }
      const stats = STATS[m.id];
      const counts = (stats && stats.theme_counts) || {};
      const hitsTotal = stats && typeof stats.hits_total === "number" ? stats.hits_total : null;
      const hitsCell =
        hitsTotal !== null
          ? `<td class="matrix-hits" title="言及 ${esc(hitsTotal.toLocaleString("ja-JP"))}件（機械計数）" aria-label="言及 ${esc(hitsTotal.toLocaleString("ja-JP"))}件（機械計数）">${esc(hitsTotal.toLocaleString("ja-JP"))}</td>`
          : `<td class="matrix-hits matrix-hits--none" aria-label="言及数 未計数">—</td>`;
      const cells = THEME_ORDER.map((k) => themeCellHTML(k, counts[k] || 0)).join("");
      rows.push(
        `<tr><td class="matrix-city"><button type="button" class="matrix-city__btn" data-id="${esc(m.id)}">${esc(m.pref)} ${esc(m.name)}</button></td>${hitsCell}${cells}</tr>`
      );
    }
    table.innerHTML = theadHTML + `<tbody>${rows.join("")}</tbody>`;
    table.addEventListener("click", (e) => {
      const btn = e.target.closest(".matrix-city__btn");
      if (!btn) return;
      const id = btn.dataset.id;
      location.hash = id;
      selectCity(id, { scroll: true });
    });
  }

  // ---- 画面1: 問いカード（テーマの選択は任意・単一選択） ----
  let selectedTheme = null;
  function bindThemeCards() {
    const cards = $("theme-cards");
    if (!cards) return;
    cards.addEventListener("click", (e) => {
      const btn = e.target.closest(".theme-card");
      if (!btn) return;
      const key = btn.dataset.theme;
      selectedTheme = selectedTheme === key ? null : key;
      cards.querySelectorAll(".theme-card").forEach((b) => {
        const active = b.dataset.theme === selectedTheme;
        b.classList.toggle("is-selected", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
    });
  }

  // ---- 画面2 次の一歩: 共有 / 今は何もしない（クリック挙動。データに依らず固定文言） ----
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

  // ---- 現在地サマリー「今わかっていること」: クリックで該当詳細セクションへスクロール ----
  function bindGenzaichiLinks() {
    const list = $("genzaichi-wakatta");
    if (!list) return;
    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".genzaichi-card__link");
      if (!btn) return;
      if (e.target.closest(".term-chip")) return; // 用語チップのタップはポップ開閉を優先
      const target = genzaichiScrollTarget(btn.dataset.sourceRef);
      if (target && !target.hidden) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
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
  renderKokkaiSection();
  kokkaiSectionHasData = !$("kokkai-section").hidden;
  renderMatrix();
  bindThemeCards();
  bindExitActions();
  bindGenzaichiLinks();
  bindTermChips();

  const picker = $("gikai-picker");
  if (picker) {
    picker.addEventListener("submit", (e) => {
      e.preventDefault();
      const id = $("gikai-sel").value;
      if (!id) return;
      const hash = selectedTheme ? `${id}/${selectedTheme}` : id;
      location.hash = hash;
      if (selectedTheme) {
        selectThemeCity(id, selectedTheme, { scroll: true });
      } else {
        selectCity(id, { scroll: true });
      }
    });
  }

  window.addEventListener("hashchange", () => applyHash({ scroll: true }));
  if (location.hash) applyHash({ scroll: false });
})();
