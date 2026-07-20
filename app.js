/* マチカルテ — 比較ロジック。データは data.js (window.MACHIKARUTE_DATA) */
(function () {
  "use strict";
  const DATA = (window.MACHIKARUTE_DATA || []).slice().sort((a, b) => a.id.localeCompare(b.id, "ja"));

  const ITEMS = [
    { key: "kodomo_iryo",    label: "子ども医療費助成" },
    { key: "judo_iryo",      label: "重度心身障害者の医療費助成" },
    { key: "kyuin_ki",       label: "吸引器・吸入器の給付", amountKey: "kijun_gaku", unit: "円（基準額）" },
    { key: "pulse_oximeter", label: "パルスオキシメーターの給付", amountKey: "kijun_gaku", unit: "円（基準額）", maxVariant: true, variantNote: "人工呼吸器を常時使うお子さんに適用される区分の額で比較しています" },
    { key: "hijo_dengen",    label: "非常用電源・停電への備え", amountKey: "kijun_gaku", unit: "円（基準額）", maxVariant: true, variantNote: "複数種目がある場合は最も基準額の高い種目で比較しています" },
    { key: "dokuji_teate",   label: "自治体独自の手当", amountKey: "getsu_gaku", unit: "円／月" },
    { key: "hoiku_ukeire",   label: "保育園での医療的ケア受け入れ" },
    { key: "coordinator",    label: "相談窓口・コーディネーター" },
  ];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const yen = (n) => n.toLocaleString("ja-JP");
  const CONF_LABEL = { high: "確認済（公式明記）", medium: "公式・一部曖昧", low: "要確認" };

  // L2「地域の資源」・L3「議会での議論」— 収集中のため両層とも欠損に耐える
  const SHIGEN = window.MACHIKARUTE_SHIGEN || {};
  const GIKAI = window.MACHIKARUTE_GIKAI || {};
  const SHIGEN_STATS = [
    { key: "jido_hattatsu", label: "児童発達支援" },
    { key: "hokago_day", label: "放課後等デイ" },
    { key: "tanki_nyusho", label: "短期入所（レスパイト）" },
    { key: "homon_kango", label: "訪問看護" },
  ];

  function populate() {
    for (const sel of [$("sel-a"), $("sel-b")]) {
      sel.insertAdjacentHTML("beforeend", '<option value="">選んでください</option>');
      for (const m of DATA) {
        sel.insertAdjacentHTML("beforeend", `<option value="${esc(m.id)}">${esc(m.pref)} ${esc(m.name)}</option>`);
      }
    }
    $("sel-b").value = "";
    $("foot-meta").textContent =
      `収録: ${DATA.length}自治体 × ${ITEMS.length}項目 · データ取得: ${DATA[0]?.collected_at ?? "—"} · 制度の適用可否は必ず自治体窓口でご確認ください。`;
  }

  function amountOf(item, def) {
    if (!def.amountKey || !item?.details) return null;
    if (def.maxVariant) {
      // 区分（kubun）や高額区分キーを含めた最大額＝同一ペルソナ（人工呼吸器常時使用児）適用額で比較する
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

  function cellHTML(m, item, def, lead) {
    if (!item || item.status === "unconfirmed") {
      return `<div class="kcell kcell--unconfirmed">
        <p class="kcell__city">${esc(m.name)}</p>
        <p class="kcell__summary">未確認 — 公式ページで確認できませんでした。制度がないという意味ではありません。窓口でご確認ください。</p>
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
    return `<div class="kcell ${lead ? "kcell--lead" : ""}">
      <p class="kcell__city">${esc(m.name)}</p>
      ${amountHTML}
      <p class="kcell__summary">${esc(item.summary)}</p>
      <p class="conf" data-level="${esc(item.confidence)}">たしかさ: ${esc(CONF_LABEL[item.confidence] || item.confidence)}</p>
      ${src.url ? `<details class="src"><summary>出典を読む</summary>
        <div class="src__body">
          <blockquote class="src__quote">${esc(src.quote || "")}</blockquote>
          <p class="src__meta"><a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.page_title || src.url)}</a><br>取得日 ${esc(m.collected_at)}</p>
        </div></details>` : ""}
    </div>`;
  }

  function shigenCellHTML(m) {
    const s = SHIGEN[m.id];
    if (!s) {
      return `<div class="kcell">
        <p class="kcell__city">${esc(m.name)}</p>
        <p class="kcell__summary">未集計</p>
      </div>`;
    }
    const counts = s.counts || {};
    const statsHTML = SHIGEN_STATS.map((def) => {
      const n = counts[def.key];
      if (n === null || n === undefined) return "";
      return `<li class="shigen__item"><span class="shigen__label">${esc(def.label)}</span><span class="kcell__amount">${yen(n)}<span class="proof__unit"> ヶ所</span></span></li>`;
    }).join("");
    const flagHTML =
      typeof s.ikea_taio_flag === "number"
        ? `<p class="shigen__flag">うち医療的ケア対応フラグ ${yen(s.ikea_taio_flag)}</p>`
        : "";
    const src = (s.sources && s.sources[0]) || {};
    const sourceHTML = src.name
      ? `<p class="src__meta">${esc(src.name)}${s.data_date ? `（${esc(s.data_date)}）` : ""}</p>`
      : "";
    return `<div class="kcell">
      <p class="kcell__city">${esc(m.name)}</p>
      <ul class="shigen__list">${statsHTML}</ul>
      ${flagHTML}
      <p class="origin origin--jissoku">実測データ</p>
      ${sourceHTML}
    </div>`;
  }

  function renderShigenRow(a, b) {
    return `<div class="krow">
      <div class="krow__labelbox"><h3 class="krow__label">地域の資源（実数）</h3><p class="krow__note">障害福祉サービス等情報公表システムのオープンデータから機械集計</p></div>
      <div class="krow__cells">${shigenCellHTML(a)}${shigenCellHTML(b)}</div>
    </div>`;
  }

  function gikaiTopicHTML(t, collectedAt) {
    return `<details class="src">
      <summary>${esc(t.date)} ${esc(t.kaigi)}</summary>
      <div class="src__body">
        <p class="kcell__summary">${esc(t.gist)}</p>
        ${t.quote ? `<blockquote class="src__quote">${esc(t.quote)}</blockquote>` : ""}
        <p class="src__meta">${t.source_url ? `<a href="${esc(t.source_url)}" target="_blank" rel="noopener">${esc(t.source_url)}</a><br>` : ""}取得日 ${esc(collectedAt)}</p>
      </div>
    </details>`;
  }

  function gikaiCellHTML(m) {
    const g = GIKAI[m.id];
    if (!g) {
      return `<div class="kcell">
        <p class="kcell__city">${esc(m.name)}</p>
        <p class="kcell__summary">未収集</p>
      </div>`;
    }
    if (g.status === "unconfirmed") {
      return `<div class="kcell kcell--unconfirmed">
        <p class="kcell__city">${esc(m.name)}</p>
        <p class="kcell__summary">会議録からは確認できませんでした（議論されていないという意味ではありません）</p>
      </div>`;
    }
    const themes = Array.isArray(g.themes) && g.themes.length ? `論点: ${g.themes.map(esc).join(" ・ ")}` : "";
    const topicsHTML = (g.topics || []).slice(0, 3).map((t) => gikaiTopicHTML(t, g.collected_at)).join("");
    return `<div class="kcell">
      <p class="kcell__city">${esc(m.name)}</p>
      ${themes ? `<p class="kcell__summary">${themes}</p>` : ""}
      <p class="kcell__summary">${esc(g.soukatsu || "")}</p>
      ${topicsHTML}
      <p class="origin origin--kobunsho">公文書</p>
    </div>`;
  }

  function renderGikaiRow(a, b) {
    return `<div class="krow">
      <div class="krow__labelbox"><h3 class="krow__label">議会での議論</h3><p class="krow__note">直近約3年の会議録から『医療的ケア児』の質疑を要約。公文書ベース</p></div>
      <div class="krow__cells">${gikaiCellHTML(a)}${gikaiCellHTML(b)}</div>
    </div>`;
  }

  function render(a, b) {
    $("karte-title").textContent = `${a.name} と ${b.name} のカルテ`;
    $("karte-cols").innerHTML = `<span>項目</span><span>${esc(a.pref)} ${esc(a.name)}</span><span>${esc(b.pref)} ${esc(b.name)}</span>`;
    const rows = ITEMS.map((def, i) => {
      const ia = a.items?.[def.key];
      const ib = b.items?.[def.key];
      const va = amountOf(ia, def);
      const vb = amountOf(ib, def);
      // 数値が両方あるときだけ、大きい側にリード表示（金額はいずれも「多いほど手厚い」項目のみamountKeyを設定）
      const leadA = va !== null && vb !== null && va > vb;
      const leadB = va !== null && vb !== null && vb > va;
      return `<div class="krow" style="animation-delay:${i * 40}ms">
        <div class="krow__labelbox"><h3 class="krow__label">${esc(def.label)}</h3>${def.variantNote ? `<p class="krow__note">${esc(def.variantNote)}</p>` : ""}</div>
        <div class="krow__cells">${cellHTML(a, ia, def, leadA)}${cellHTML(b, ib, def, leadB)}</div>
      </div>`;
    }).join("");
    $("karte-rows").innerHTML = rows + renderShigenRow(a, b) + renderGikaiRow(a, b);
    $("karte").hidden = false;
  }

  function heroProof() {
    // 実データから「差が最大の金額項目」を1つ選んで見せる。数値の捏造はしない。
    const box = $("hero-proof");
    let best = null;
    for (const def of ITEMS.filter((d) => d.amountKey)) {
      for (let i = 0; i < DATA.length; i++) {
        for (let j = i + 1; j < DATA.length; j++) {
          const va = amountOf(DATA[i].items?.[def.key], def);
          const vb = amountOf(DATA[j].items?.[def.key], def);
          if (va === null || vb === null || va === vb) continue;
          const diff = Math.abs(va - vb);
          if (!best || diff > best.diff) best = { def, a: DATA[i], b: DATA[j], va, vb, diff };
        }
      }
    }
    if (!best) { box.hidden = true; return; }
    const [hi, lo] = best.va >= best.vb ? [{ m: best.a, v: best.va }, { m: best.b, v: best.vb }] : [{ m: best.b, v: best.vb }, { m: best.a, v: best.va }];
    box.innerHTML = `
      <p class="proof__item">たとえば「${esc(best.def.label)}」</p>
      <div class="proof__pair">
        <div><p class="proof__city">${esc(hi.m.pref)} ${esc(hi.m.name)}</p><p class="proof__amount">${yen(hi.v)}<span class="proof__unit"> ${esc(best.def.unit)}</span></p></div>
        <div><p class="proof__city">${esc(lo.m.pref)} ${esc(lo.m.name)}</p><p class="proof__amount">${yen(lo.v)}<span class="proof__unit"> ${esc(best.def.unit)}</span></p></div>
      </div>
      <p class="proof__note">同じ子でも、差は ${yen(best.diff)}円。これは実際に両自治体の公式ページから取得した値です（下の比較で出典を読めます）。${best.def.variantNote ? `<br>※${esc(best.def.variantNote)}。` : ""}</p>`;
    // クリックでこの2市の比較を開けるように選択状態を用意
    box.dataset.a = best.a.id;
    box.dataset.b = best.b.id;
  }

  $("picker").addEventListener("submit", (e) => {
    e.preventDefault();
    const a = DATA.find((m) => m.id === $("sel-a").value);
    const b = DATA.find((m) => m.id === $("sel-b").value);
    const note = $("picker-note");
    if (!a || !b) { note.textContent = "2つの街を選んでください。"; return; }
    if (a.id === b.id) { note.textContent = "同じ街どうしは比較できません。別の街を選んでください。"; return; }
    note.textContent = "";
    render(a, b);
    $("karte").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  populate();
  heroProof();
})();
