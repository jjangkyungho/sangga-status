"use strict";

// fetch_trade.py 의 COLS 와 같은 순서
const T = { date: 0, umd: 1, jibun: 2, type: 3, use: 4, landUse: 5, floor: 6, amount: 7,
  bldAr: 8, landAr: 9, buildYear: 10, gbn: 11, canceled: 12, share: 13 };
const PYEONG = 3.3058;
const MAX_RENT_SERIES = 4;
const MAP_MONTHS = 12;
// 순차(크기) 색: 한 가지 색상의 밝기 단계
const RAMP = ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95"];

const state = { cfg: null, meta: {}, summary: {}, catalog: [], region: null, tab: "trade",
  trade: null, tradeShown: 100, rone: {}, rentSel: null, rentSido: null, stores: {} };
const charts = {};
const geo = { map: null, tiles: null, sido: null, sgg: null, sidoLayer: null, sggLayer: null, labels: null, view: null };

// ---------- 공통 ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const nf = (v, d = 0) => (v == null || isNaN(v) ? "-" : Number(v).toLocaleString("ko-KR", { maximumFractionDigits: d }));
function won(man) { // 만원 → "12억 3,000만"
  if (man == null) return "-";
  const eok = Math.floor(man / 10000), rest = Math.round(man % 10000);
  if (!eok) return `${nf(rest)}만`;
  return rest ? `${nf(eok)}억 ${nf(rest)}만` : `${nf(eok)}억`;
}
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const ymLabel = (ym) => `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 불가 환경 */ } } };
const isDark = () => document.documentElement.dataset.theme === "dark" ||
  (document.documentElement.dataset.theme !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);

let sb = null; // Supabase 클라이언트. 수집 데이터(data/…)는 로그인한 사용자만 받을 수 있는 비공개 버킷에 있다.
const ID_DOMAIN = "sangga.local"; // 아이디 → Supabase 로그인용 이메일 (예: kim → kim@sangga.local)

async function getJSON(path) {
  try {
    if (sb && path.startsWith("data/")) {
      const { data, error } = await sb.storage.from("data").download(path.slice(5));
      return error ? null : JSON.parse(await data.text());
    }
    const r = await fetch(path, { cache: "no-cache" });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
const series = () => [css("--s1"), css("--s2"), css("--s3"), css("--s4")];

function chart(id, config, emptyMsg) {
  const canvas = $(id), box = canvas.parentElement;
  charts[id]?.destroy();
  delete charts[id];
  box.querySelector(".empty")?.remove();
  if (emptyMsg) {
    canvas.style.display = "none";
    box.insertAdjacentHTML("beforeend", `<div class="empty">${esc(emptyMsg)}</div>`);
    return;
  }
  canvas.style.display = "";
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = css("--text-2");
  const grid = css("--grid");
  config.options = Object.assign({
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
  }, config.options || {});
  config.options.plugins = Object.assign({ legend: { display: false }, tooltip: { padding: 10, boxPadding: 4 } }, config.options.plugins);
  const sc = config.options.scales || {};
  for (const k of ["x", "y"]) {
    sc[k] = Object.assign({ grid: { color: grid, drawTicks: false }, border: { display: false }, ticks: { padding: 6 } }, sc[k] || {});
  }
  config.options.scales = sc;
  charts[id] = new Chart(canvas, config);
}

function kpis(el, list) {
  el.innerHTML = list.map((k) => `<div class="kpi"><div class="label">${esc(k.label)}</div><div class="value">${esc(k.value)}</div>${k.hint ? `<div class="hint">${esc(k.hint)}</div>` : ""}</div>`).join("");
}

// 정렬 가능한 표. cols: {label, get, num, fmt}
function table(el, cols, rows, opt = {}) {
  const st = el._sort || (el._sort = { i: opt.sortIndex ?? -1, dir: opt.sortDir ?? -1 });
  let data = rows;
  if (st.i >= 0 && cols[st.i]) {
    const g = cols[st.i].get;
    data = [...rows].sort((a, b) => { const x = g(a), y = g(b); return (x > y ? 1 : x < y ? -1 : 0) * st.dir; });
  }
  const shown = opt.limit ? data.slice(0, opt.limit) : data;
  el.innerHTML = `<thead><tr>${cols.map((c, i) => `<th data-sort="${i}" class="${c.num ? "num" : ""} ${st.i === i ? (st.dir > 0 ? "asc" : "desc") : ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${shown.map((r) => `<tr class="${opt.rowClass ? opt.rowClass(r) : ""}">${cols.map((c) => { const v = c.get(r); return `<td class="${c.num ? "num" : ""}">${esc(c.fmt ? c.fmt(v, r) : v)}</td>`; }).join("")}</tr>`).join("")}</tbody>`;
  el.querySelectorAll("th").forEach((th) => th.onclick = () => {
    const i = +th.dataset.sort;
    st.dir = st.i === i ? -st.dir : (cols[i].num ? -1 : 1);
    st.i = i;
    table(el, cols, rows, opt);
  });
  return data;
}

const region = (code = state.region) => state.cfg.regions.find((r) => r.code === code);
const sidoOf = (code) => state.cfg.sidos.find((s) => s.code === code);
const regionsIn = (sido) => state.cfg.regions.filter((r) => r.sido === sido);

// 최근 n개월 요약 (지도·비교 차트용)
function recent(code, n = MAP_MONTHS) {
  const ms = state.summary[code]?.months || {};
  const keys = Object.keys(ms).sort().slice(-n);
  return { n: keys.reduce((s, k) => s + ms[k].n, 0), sum: keys.reduce((s, k) => s + ms[k].sum, 0) };
}

// ---------- 지도 ----------
function bins(values) {
  const v = values.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const k = RAMP.length;
  return Array.from({ length: k - 1 }, (_, i) => v[Math.floor(((i + 1) * v.length) / k)]);
}
const colorFor = (val, br) => (!br.length || !val ? (isDark() ? "#2a2a27" : "#ecebe7") : RAMP[br.filter((b) => val >= b).length]);

function setTiles() {
  geo.tiles?.remove();
  geo.tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 15, opacity: 0.55,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(geo.map);
}

function legend(br) {
  const el = $("map-legend");
  if (!br.length) { el.innerHTML = `<span class="muted">거래 자료가 수집되면 지역별 거래량이 색으로 표시됩니다.</span>`; return; }
  el.innerHTML = `최근 ${MAP_MONTHS}개월 상가 매매 건수<div class="bar">${RAMP.map((c) => `<i style="background:${c}"></i>`).join("")}</div>
    <div class="ends"><span>적음</span><span>많음</span></div>`;
}

function showNation() {
  geo.view = "nation";
  geo.sggLayer?.remove(); geo.labels?.clearLayers();
  const vals = Object.fromEntries(state.cfg.sidos.map((s) => [s.code, regionsIn(s.code).reduce((a, r) => a + recent(r.code).n, 0)]));
  const br = bins(Object.values(vals));
  geo.sidoLayer?.remove();
  geo.sidoLayer = L.geoJSON(geo.sido, {
    style: (f) => ({ color: isDark() ? "#1a1a19" : "#fff", weight: 1.5, fillOpacity: 0.75,
      fillColor: colorFor(vals[f.properties.code], br) }),
    onEachFeature: (f, layer) => {
      layer.bindTooltip(`<b>${esc(f.properties.name)}</b><br>최근 ${MAP_MONTHS}개월 ${nf(vals[f.properties.code])}건`, { className: "rg-tip", sticky: true });
      layer.on({ click: () => showSido(f.properties.code, true),
        mouseover: () => layer.setStyle({ weight: 3, color: css("--sel") }), mouseout: () => geo.sidoLayer.resetStyle(layer) });
    },
  }).addTo(geo.map);
  geo.map.fitBounds(geo.sidoLayer.getBounds(), { padding: [8, 8] });
  $("map-back").hidden = true;
  $("map-hint").textContent = "시도를 누르면 확대되고, 시군구를 누르면 선택됩니다.";
  legend(br);
}

function showSido(code, pickFirst) {
  geo.view = code;
  geo.sidoLayer?.remove(); geo.sggLayer?.remove(); geo.labels.clearLayers();
  const feats = { type: "FeatureCollection", features: geo.sgg.features.filter((f) => f.properties.sido === code) };
  const vals = Object.fromEntries(feats.features.map((f) => [f.properties.code, recent(f.properties.code).n]));
  const br = bins(Object.values(vals));
  const sel = css("--sel");
  geo.sggLayer = L.geoJSON(feats, {
    style: (f) => ({ color: f.properties.code === state.region ? sel : (isDark() ? "#1a1a19" : "#fff"),
      weight: f.properties.code === state.region ? 4 : 1.2, fillOpacity: 0.75, fillColor: colorFor(vals[f.properties.code], br) }),
    onEachFeature: (f, layer) => {
      const r = recent(f.properties.code);
      layer.bindTooltip(`<b>${esc(f.properties.name)}</b><br>최근 ${MAP_MONTHS}개월 ${nf(r.n)}건 · ${won(r.sum)}`, { className: "rg-tip", sticky: true });
      layer.on({ click: () => setRegion(f.properties.code),
        mouseover: () => { if (f.properties.code !== state.region) layer.setStyle({ weight: 3, color: sel }); },
        mouseout: () => geo.sggLayer.resetStyle(layer) });
      if (feats.features.length <= 30) {
        geo.labels.addLayer(L.tooltip({ permanent: true, direction: "center", className: "rg-label", interactive: false })
          .setLatLng(layer.getBounds().getCenter()).setContent(esc(f.properties.name.split(" ").pop())));
      }
    },
  }).addTo(geo.map);
  geo.sggLayer.bringToFront();
  geo.map.fitBounds(geo.sggLayer.getBounds(), { padding: [8, 8] });
  $("map-back").hidden = false;
  $("map-hint").textContent = "시군구를 누르면 선택됩니다. 다른 시도는 위 드롭다운이나 '전국'으로 이동하세요.";
  legend(br);
  if (pickFirst && region().sido !== code) setRegion(regionsIn(code)[0].code);
}

async function initMap() {
  [geo.sido, geo.sgg] = await Promise.all([getJSON("geo/sido.json"), getJSON("geo/sgg.json")]);
  geo.map = L.map("map", { zoomSnap: 0.25, minZoom: 6, scrollWheelZoom: false });
  setTiles();
  geo.labels = L.layerGroup().addTo(geo.map);
  geo.map.on("focus", () => geo.map.scrollWheelZoom.enable());
  geo.map.on("blur", () => geo.map.scrollWheelZoom.disable());
  $("map-back").onclick = showNation;
}

function renderSelection() {
  const r = region(), s = sidoOf(r.sido), rc = recent(r.code);
  $("sel-name").textContent = `${s.name} ${r.name}`;
  $("sel-mini").innerHTML = `<div><div class="label">최근 ${MAP_MONTHS}개월 매매</div><div class="value">${nf(rc.n)}건</div></div>
    <div><div class="label">거래 총액</div><div class="value">${won(rc.sum)}</div></div>`;
  if (geo.map) showSido(r.sido, false);
}

// ---------- 지역 선택 (드롭다운 + 검색) ----------
function fillPicker() {
  $("sido").innerHTML = state.cfg.sidos.map((s) => `<option value="${s.code}">${esc(s.name)}</option>`).join("");
  $("sido").onchange = (e) => setRegion(regionsIn(e.target.value)[0].code);
  $("sgg").onchange = (e) => setRegion(e.target.value);

  const q = $("q"), list = $("q-list");
  let hits = [], on = 0;
  const draw = () => {
    list.innerHTML = hits.map((r, i) => `<li data-code="${r.code}" class="${i === on ? "on" : ""}">${esc(r.name)}<small>${esc(sidoOf(r.sido).name)}</small></li>`).join("");
    list.hidden = !hits.length;
    list.querySelectorAll("li").forEach((li) => li.onmousedown = (e) => { e.preventDefault(); pick(li.dataset.code); });
  };
  const pick = (code) => { q.value = ""; hits = []; draw(); q.blur(); setRegion(code); };
  q.oninput = () => {
    const t = q.value.replace(/\s/g, "");
    hits = !t ? [] : state.cfg.regions.filter((r) => (sidoOf(r.sido).name + r.name).replace(/\s/g, "").includes(t)
      || r.name.replace(/\s/g, "").includes(t)).slice(0, 12);
    on = 0; draw();
  };
  q.onkeydown = (e) => {
    if (e.key === "ArrowDown") { on = Math.min(on + 1, hits.length - 1); draw(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { on = Math.max(on - 1, 0); draw(); e.preventDefault(); }
    else if (e.key === "Enter" && hits[on]) pick(hits[on].code);
    else if (e.key === "Escape") { hits = []; draw(); }
  };
  q.onblur = () => setTimeout(() => { hits = []; draw(); }, 150);
}

function syncPicker() {
  const r = region();
  $("sido").value = r.sido;
  $("sgg").innerHTML = regionsIn(r.sido).map((x) => `<option value="${x.code}">${esc(x.name)}</option>`).join("");
  $("sgg").value = r.code;
}

// ---------- ① 매매 ----------
function tradeRows() {
  const d = state.trade;
  if (!d) return [];
  const n = +$("t-period").value, type = $("t-type").value, use = $("t-use").value, inclCancel = $("t-cancel").checked;
  const months = Object.keys(d.months).sort().reverse().slice(0, n);
  const out = [];
  for (const ym of months) for (const r of d.months[ym]) {
    if (type && r[T.type] !== type) continue;
    if (use && r[T.use] !== use) continue;
    if (!inclCancel && r[T.canceled]) continue;
    out.push(r);
  }
  return out;
}
const ppy = (r) => (r[T.amount] && r[T.bldAr] > 0 ? r[T.amount] / (r[T.bldAr] / PYEONG) : null);

function renderTrade() {
  const d = state.trade;
  const noData = !d ? "매매 자료가 아직 수집되지 않았습니다." : null;

  const useSel = $("t-use"), cur = useSel.value;
  const uses = new Set();
  if (d) Object.values(d.months).forEach((rs) => rs.forEach((r) => r[T.use] && uses.add(r[T.use])));
  useSel.innerHTML = `<option value="">전체</option>` + [...uses].sort().map((u) => `<option ${u === cur ? "selected" : ""}>${esc(u)}</option>`).join("");

  const rows = tradeRows();
  const valid = rows.filter((r) => !r[T.canceled]);
  const total = valid.reduce((s, r) => s + (r[T.amount] || 0), 0);
  const ppys = valid.map(ppy).filter((v) => v);
  kpis($("t-kpis"), [
    { label: "거래 건수", value: `${nf(valid.length)}건`, hint: rows.length - valid.length ? `해제 ${rows.length - valid.length}건 별도` : "" },
    { label: "거래 총액", value: won(total) },
    { label: "건당 중앙값", value: won(median(valid.map((r) => r[T.amount]).filter(Boolean))) },
    { label: "3.3㎡당 중앙값", value: ppys.length ? `${nf(median(ppys))}만원` : "-", hint: "건물면적 기준" },
  ]);

  const n = +$("t-period").value;
  const months = d ? Object.keys(d.months).sort().slice(-n) : [];
  const byM = Object.fromEntries(months.map((m) => [m, []]));
  valid.forEach((r) => { const k = r[T.date].slice(0, 7).replace("-", ""); byM[k]?.push(r); });
  const s1 = series()[0];
  chart("c-count", {
    type: "bar",
    data: { labels: months.map(ymLabel), datasets: [{ label: "거래 건수", data: months.map((m) => byM[m].length), backgroundColor: s1, borderRadius: 4, maxBarThickness: 28 }] },
    options: { scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { tooltip: { callbacks: { label: (c) => ` ${nf(c.raw)}건` } } } },
  }, noData);
  chart("c-ppy", {
    type: "line",
    data: { labels: months.map(ymLabel), datasets: [{ label: "3.3㎡당 중앙값", data: months.map((m) => median(byM[m].map(ppy).filter(Boolean))), borderColor: s1, backgroundColor: s1, borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, spanGaps: true, tension: 0.25 }] },
    options: { scales: { x: { grid: { display: false } }, y: { ticks: { callback: (v) => nf(v) } } },
      plugins: { tooltip: { callbacks: { label: (c) => ` ${nf(c.raw)}만원` } } } },
  }, noData);

  // 같은 시도 안 시군구 비교 (요약 자료, 유형·용도 필터 미적용)
  const r = region();
  const cmp = regionsIn(r.sido).map((x) => ({ code: x.code, name: x.name, n: recent(x.code, n).n })).sort((a, b) => b.n - a.n);
  $("cmp-title").textContent = `${sidoOf(r.sido).name} 시군구별 거래 건수`;
  $("cmp-label").textContent = `(최근 ${n}개월, 전체 유형·용도 · 막대를 누르면 이동)`;
  chart("c-compare", {
    type: "bar",
    data: { labels: cmp.map((c) => c.name), datasets: [{ label: "거래 건수", data: cmp.map((c) => c.n),
      backgroundColor: cmp.map((c) => (c.code === state.region ? css("--sel") : s1)), borderRadius: 4, maxBarThickness: 22 }] },
    options: { scales: { x: { grid: { display: false }, ticks: { autoSkip: false, maxRotation: 60 } }, y: { beginAtZero: true, ticks: { precision: 0 } } },
      plugins: { tooltip: { callbacks: { label: (c) => ` ${nf(c.raw)}건` } } },
      onClick: (_, els) => { if (els[0]) setRegion(cmp[els[0].index].code); } },
  }, Object.keys(state.summary).length ? null : "시군구 비교 자료가 없습니다.");

  const cols = [
    { label: "계약일", get: (x) => x[T.date] },
    { label: "법정동", get: (x) => x[T.umd] },
    { label: "지번", get: (x) => x[T.jibun] },
    { label: "유형", get: (x) => x[T.type] },
    { label: "용도", get: (x) => x[T.use] },
    { label: "층", get: (x) => x[T.floor] ?? "", num: true },
    { label: "거래금액", get: (x) => x[T.amount] || 0, num: true, fmt: (v) => won(v) },
    { label: "건물면적(㎡)", get: (x) => x[T.bldAr] || 0, num: true, fmt: (v) => nf(v, 2) },
    { label: "3.3㎡당(만원)", get: (x) => ppy(x) || 0, num: true, fmt: (v) => (v ? nf(v) : "-") },
    { label: "대지면적(㎡)", get: (x) => x[T.landAr] || 0, num: true, fmt: (v) => nf(v, 2) },
    { label: "건축년도", get: (x) => x[T.buildYear] ?? "", num: true },
    { label: "거래방식", get: (x) => x[T.gbn] },
    { label: "지분", get: (x) => x[T.share] },
  ];
  const el = $("t-table");
  if (!el._sort) el._sort = { i: 0, dir: -1 };
  const sorted = table(el, cols, rows, { limit: state.tradeShown, rowClass: (x) => (x[T.canceled] ? "canceled" : "") });
  $("t-more").hidden = sorted.length <= state.tradeShown;
  $("t-more").textContent = `더 보기 (${nf(state.tradeShown)} / ${nf(sorted.length)})`;
  $("t-csv").onclick = () => downloadCSV(`상가매매_${sidoOf(r.sido).name}_${r.name}.csv`, cols, sorted);
}

function downloadCSV(name, cols, rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const body = [cols.map((c) => q(c.label)).join(","), ...rows.map((r) => cols.map((c) => q(c.get(r))).join(","))].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- ② 임대 통계 ----------
async function loadRone(id) {
  if (!(id in state.rone)) state.rone[id] = await getJSON(`data/rone/${id}.json`);
  return state.rone[id];
}

async function renderRent() {
  const cat = state.catalog;
  if (!cat.length) {
    $("r-type").innerHTML = `<option>자료 없음</option>`; $("r-metric").innerHTML = "";
    $("r-list").innerHTML = `<p class="muted">임대 통계가 아직 수집되지 않았습니다.</p>`;
    $("r-legend").innerHTML = ""; $("r-kpis").innerHTML = ""; $("r-rank").innerHTML = "";
    chart("c-rent", {}, "임대 통계가 아직 수집되지 않았습니다.");
    return;
  }
  const typeSel = $("r-type"), metSel = $("r-metric");
  const types = [...new Set(cat.map((c) => c.type))];
  if (!typeSel.options.length || typeSel.options[0].textContent === "자료 없음") {
    typeSel.innerHTML = types.map((t) => `<option>${esc(t)}</option>`).join("");
  }
  const metrics = cat.filter((c) => c.type === typeSel.value);
  const curM = metSel.value;
  metSel.innerHTML = metrics.map((c) => `<option value="${esc(c.id)}" ${c.metric === curM || c.id === curM ? "selected" : ""}>${esc(c.metric)}</option>`).join("");
  const d = await loadRone(metSel.value);
  if (!d) return;

  // 선택 지역의 시도에 속한 상권만
  const sido = sidoOf(region().sido);
  const inSido = (n) => sido.short.includes(n.split(">")[0]);
  const names = Object.keys(d.series).filter((n) => inSido(n) || n === "전국")
    .sort((a, b) => (a === "전국") - (b === "전국") || a.split(">").length - b.split(">").length || a.localeCompare(b, "ko"));
  const item = Object.keys(d.series[names[0]] || {})[0] || d.metric;
  if (state.rentSido !== sido.code || !state.rentSel) {
    state.rentSido = sido.code;
    state.rentSel = names.filter((n) => sido.short.includes(n) || n === "전국").slice(0, 3);
  }
  const sel = state.rentSel.filter((n) => d.series[n]);

  const q = $("r-search").value.trim();
  const groups = {};
  names.filter((n) => !q || n.includes(q)).forEach((n) => {
    const p = n.split(">"); const g = p.length > 1 ? p.slice(0, -1).join(" > ") : "전체";
    (groups[g] ||= []).push(n);
  });
  $("r-list").innerHTML = Object.entries(groups).map(([g, ns]) => `<div class="group">${esc(g)}</div>` +
    ns.map((n) => `<label><input type="checkbox" value="${esc(n)}" ${sel.includes(n) ? "checked" : ""}>${esc(n.split(">").pop())}</label>`).join("")).join("")
    || `<p class="muted">이 시도에는 해당 유형의 조사 상권이 없습니다.</p>`;
  $("r-list").querySelectorAll("input").forEach((cb) => cb.onchange = () => {
    if (cb.checked) {
      if (state.rentSel.length >= MAX_RENT_SERIES) { cb.checked = false; alert(`최대 ${MAX_RENT_SERIES}개까지 비교할 수 있습니다.`); return; }
      state.rentSel.push(cb.value);
    } else state.rentSel = state.rentSel.filter((n) => n !== cb.value);
    renderRent();
  });

  const times = Object.keys(d.times).sort();
  const label = (t) => d.times[t] || t;
  const last = times[times.length - 1], prev = times[times.length - 2];
  const val = (n, t) => { const m = d.series[n]?.[item]; const p = m && m.find((x) => x[0] === t); return p ? p[1] : null; };
  const unit = d.unit ? ` ${d.unit}` : "";

  // 요약 카드
  const leaves = names.filter((n) => n.split(">").length > 1 && val(n, last) != null);
  const ranked = [...leaves].sort((a, b) => val(b, last) - val(a, last));
  const sidoTotal = names.find((n) => sido.short.includes(n));
  kpis($("r-kpis"), [
    { label: `${sidoTotal || sido.name} 평균`, value: sidoTotal ? `${nf(val(sidoTotal, last), 2)}${unit}` : "-", hint: label(last) },
    { label: "전국 평균", value: `${nf(val("전국", last), 2)}${unit}`, hint: label(last) },
    { label: "가장 높은 상권", value: ranked[0] ? ranked[0].split(">").pop() : "-", hint: ranked[0] ? `${nf(val(ranked[0], last), 2)}${unit}` : "" },
    { label: "가장 낮은 상권", value: ranked.length ? ranked[ranked.length - 1].split(">").pop() : "-", hint: ranked.length ? `${nf(val(ranked[ranked.length - 1], last), 2)}${unit}` : "" },
  ]);

  const colors = series();
  const ds = sel.map((n, i) => ({ label: n.split(">").pop(), full: n, data: times.map((t) => val(n, t)), borderColor: colors[i], backgroundColor: colors[i],
    borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, spanGaps: true, tension: 0.2 }));
  $("r-chart-title").textContent = `${d.name} 추이${d.unit ? ` (${d.unit})` : ""}`;
  $("r-legend").innerHTML = ds.map((s) => `<span><i style="background:${s.borderColor}"></i>${esc(s.full.replace(/>/g, " > "))}</span>`).join("");
  chart("c-rent", {
    type: "line",
    data: { labels: times.map(label), datasets: ds },
    options: { scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } } },
      plugins: { tooltip: { callbacks: { label: (c) => ` ${c.dataset.label}: ${nf(c.raw, 2)}${unit}` } } } },
  }, ds.length ? null : "왼쪽에서 상권을 선택하세요.");

  $("r-rank-title").textContent = `${sido.name} 상권별 ${d.name} (${label(last)})`;
  const rows = names.map((n) => ({ n, v: val(n, last), p: val(n, prev) })).filter((x) => x.v != null);
  const el = $("r-rank");
  if (!el._sort) el._sort = { i: 1, dir: -1 };
  table(el, [
    { label: "지역·상권", get: (x) => x.n.replace(/>/g, " > ") },
    { label: label(last), get: (x) => x.v, num: true, fmt: (v) => nf(v, 2) },
    { label: `직전 (${label(prev)})`, get: (x) => x.p ?? -Infinity, num: true, fmt: (v) => (v === -Infinity ? "-" : nf(v, 2)) },
    { label: "증감", get: (x) => (x.p == null ? -Infinity : x.v - x.p), num: true, fmt: (v) => (v === -Infinity ? "-" : (v > 0 ? "▲ " : v < 0 ? "▼ " : "") + nf(Math.abs(v), 2)) },
  ], rows, { rowClass: (x) => (sel.includes(x.n) ? "hl" : "") });
}

// ---------- ③ 매물·상권 ----------
async function renderMarket() {
  const r = region(), s = sidoOf(r.sido);
  $("m-region").textContent = `· ${s.name} ${r.name}`;
  const fill = (u) => u.replace("{lat}", r.lat).replace("{lng}", r.lng).replace("{name}", encodeURIComponent(`${s.name} ${r.name}`));
  const linkHTML = (list) => list.map((l) => `<a href="${esc(fill(l.url))}" target="_blank" rel="noopener"><b>${esc(l.name)} ↗</b><span>${esc(l.desc)}</span></a>`).join("");
  $("m-listing").innerHTML = linkHTML(state.cfg.listing_links);
  $("m-public").innerHTML = linkHTML(state.cfg.public_links);

  if (!(r.code in state.stores)) state.stores[r.code] = await getJSON(`data/stores/${r.code}.json`);
  const st = state.stores[r.code];
  const none = st ? null : "이 지역의 상권(점포) 자료가 아직 수집되지 않았습니다. 전국 자료는 며칠에 걸쳐 나눠 수집됩니다.";
  const hist = st ? Object.keys(st.history).sort() : [];
  const prev = hist.length > 1 ? st.history[hist[hist.length - 2]] : null;
  kpis($("s-kpis"), st ? [
    { label: "등록 점포 수", value: `${nf(st.total)}개`, hint: `기준 ${st.stdrYm.slice(0, 4)}.${st.stdrYm.slice(4)}` },
    { label: "직전 기준 대비", value: prev ? `${st.total - prev.total >= 0 ? "+" : ""}${nf(st.total - prev.total)}개` : "-", hint: prev ? `${hist[hist.length - 2]} 대비` : "이력이 쌓이면 표시" },
    { label: "가장 많은 업종(대분류)", value: Object.keys(st.byL)[0] || "-" },
    { label: "행정동 수", value: `${nf(Object.keys(st.byDong).length)}개` },
  ] : []);

  const s1 = series()[0];
  const bar = (id, obj, n) => {
    const e = obj ? Object.entries(obj).slice(0, n) : [];
    chart(id, {
      type: "bar",
      data: { labels: e.map((x) => x[0].split(" > ").pop()), datasets: [{ label: "점포 수", data: e.map((x) => x[1]), backgroundColor: s1, borderRadius: 4, maxBarThickness: 18 }] },
      options: { indexAxis: "y", scales: { y: { grid: { display: false } }, x: { beginAtZero: true } },
        interaction: { mode: "nearest", axis: "y", intersect: false },
        plugins: { tooltip: { callbacks: { title: (c) => e[c[0].dataIndex][0], label: (c) => ` ${nf(c.raw)}개` } } } },
    }, none);
  };
  bar("c-lcls", st?.byL, 12);
  bar("c-mcls", st?.byM, 15);

  const el = $("s-dong");
  if (!st) { el.innerHTML = ""; return; }
  const ls = Object.keys(st.byL).slice(0, 6);
  const rows = Object.entries(st.byDong).map(([dong, c]) => ({ dong, c, total: Object.values(c).reduce((a, b) => a + b, 0) }));
  if (!el._sort) el._sort = { i: 1, dir: -1 };
  table(el, [
    { label: "행정동", get: (x) => x.dong },
    { label: "전체", get: (x) => x.total, num: true, fmt: (v) => nf(v) },
    ...ls.map((l) => ({ label: l, get: (x) => x.c[l] || 0, num: true, fmt: (v) => nf(v) })),
  ], rows);
}

// ---------- 화면 전환 ----------
async function setRegion(code) {
  state.region = code;
  store.set("region", code);
  syncPicker();
  renderSelection();
  state.tradeShown = 100;
  state.trade = await getJSON(`data/trade/${code}.json`);
  if (state.region === code) render();
}

function render() {
  if (state.tab === "trade") renderTrade();
  else if (state.tab === "rent") renderRent();
  else renderMarket();
}

function setTab(tab) {
  state.tab = tab;
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
  document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== `tab-${tab}`));
  history.replaceState(null, "", `#${tab}`);
  render();
}

async function init() {
  const cfg = await getJSON("config.json");
  state.cfg = cfg;
  sb = supabase.createClient(cfg.supabase.url, cfg.supabase.key);
  const { data } = await sb.auth.getSession();
  if (data.session) return boot(data.session);
  $("login").hidden = false;
  $("login-id").focus();
  $("login-form").onsubmit = async (e) => {
    e.preventDefault();
    const id = $("login-id").value.trim();
    const email = id.includes("@") ? id : `${id}@${ID_DOMAIN}`;
    $("login-btn").disabled = true; $("login-err").hidden = true;
    const { data: d, error } = await sb.auth.signInWithPassword({ email, password: $("login-pw").value });
    $("login-btn").disabled = false;
    if (error) { $("login-err").textContent = "아이디 또는 비밀번호가 맞지 않습니다."; $("login-err").hidden = false; return; }
    $("login").hidden = true;
    boot(d.session);
  };
}

async function boot(session) {
  const cfg = state.cfg;
  $("app").hidden = false;
  $("who").textContent = `${session.user.email.replace(`@${ID_DOMAIN}`, "")} 님`;
  $("logout").onclick = async () => { await sb.auth.signOut(); location.reload(); };
  const [meta, summary, catalog] = await Promise.all([
    getJSON("data/meta.json"), getJSON("data/trade/summary.json"), getJSON("data/rone/catalog.json")]);
  state.meta = meta || {}; state.summary = summary || {}; state.catalog = catalog || [];
  $("site-title").textContent = cfg.site_title;
  document.title = cfg.site_title;
  const upd = ["trade", "rone", "stores"].map((k) => state.meta[k]?.updated).filter(Boolean).sort().pop();
  const lastTrade = Object.values(state.summary).flatMap((x) => Object.keys(x.months || {})).sort().pop();
  $("updated").textContent = upd ? `마지막 갱신 ${upd} (KST) · 전국 ${cfg.regions.length}개 시군구`
    : lastTrade ? `매매 자료 ${lastTrade.slice(0, 4)}.${lastTrade.slice(4)}까지 · 전국 ${cfg.regions.length}개 시군구` : "아직 수집된 데이터가 없습니다";

  fillPicker();
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
  ["t-period", "t-type", "t-use", "t-cancel"].forEach((id) => ($(id).onchange = () => { state.tradeShown = 100; renderTrade(); }));
  $("t-more").onclick = () => { state.tradeShown += 200; renderTrade(); };
  $("r-type").onchange = () => renderRent();
  $("r-metric").onchange = () => renderRent();
  $("r-search").oninput = () => renderRent();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (geo.map) { setTiles(); geo.view === "nation" ? showNation() : showSido(geo.view, false); }
    render();
  });

  const tab = location.hash.slice(1);
  if (["trade", "rent", "market"].includes(tab)) state.tab = tab;
  document.querySelectorAll(".tabs button").forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === state.tab));
  document.querySelectorAll(".tab").forEach((s) => (s.hidden = s.id !== `tab-${state.tab}`));

  try { await initMap(); } catch (e) { $("map").innerHTML = `<div class="empty">지도를 불러오지 못했습니다.</div>`; geo.map = null; }
  const saved = store.get("region");
  await setRegion(cfg.regions.some((r) => r.code === saved) ? saved : "11680");
}

init();
