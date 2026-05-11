import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const API = "http://192.168.4.127:5051/api";

const RETAILERS = ["Woolworths", "Pak'nSave", "New World", "The Warehouse", "Chemist Warehouse"];
const RETAILER_COLORS = {
  "Woolworths": "#00AA46",
  "Pak'nSave": "#FFD000",
  "New World": "#E31837",
  "The Warehouse": "#CC0000",
  "Chemist Warehouse": "#005BAA",
};

const fmt = (n) => n != null ? `$${n.toFixed(2)}` : "—";
const fmtUnit = (n) => n != null ? `${(n * 100).toFixed(1)}¢` : "—";
const unitPrice = (price, count) => price != null && count ? price / count : null;

const fontLink = document.createElement("link");
fontLink.rel = "stylesheet";
fontLink.href = "https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap";
document.head.appendChild(fontLink);

const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d0d; color: #e8e4dc; font-family: 'DM Mono', monospace; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: #1a1a1a; }
  ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
  .app { min-height: 100vh; padding: 24px; max-width: 1200px; margin: 0 auto; }
  .header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 32px; border-bottom: 1px solid #222; padding-bottom: 20px; flex-wrap: wrap; }
  .header h1 { font-family: 'Syne', sans-serif; font-size: 28px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }
  .header .sub { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 2px; }
  .controls { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; flex-wrap: wrap; }
  .size-tabs { display: flex; gap: 4px; }
  .size-tab { padding: 6px 16px; border: 1px solid #2a2a2a; background: transparent; color: #666; font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; border-radius: 3px; transition: all 0.15s; }
  .size-tab.active { background: #e8e4dc; color: #0d0d0d; border-color: #e8e4dc; }
  .size-tab:hover:not(.active) { border-color: #444; color: #aaa; }
  .btn { padding: 8px 18px; border: 1px solid #333; background: transparent; color: #e8e4dc; font-family: 'DM Mono', monospace; font-size: 12px; cursor: pointer; border-radius: 3px; transition: all 0.15s; display: inline-flex; align-items: center; gap: 6px; }
  .btn:hover { background: #1a1a1a; border-color: #555; }
  .btn.primary { background: #e8e4dc; color: #0d0d0d; border-color: #e8e4dc; }
  .btn.primary:hover { background: #fff; }
  .btn.primary:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn.danger { color: #ff4444; border-color: #331111; }
  .btn.danger:hover { background: #1a0808; }
  .btn.sm { padding: 4px 10px; font-size: 11px; }
  .spacer { flex: 1; }
  .product-sections { display: grid; gap: 32px; }
  .section { background: #111; border: 1px solid #1e1e1e; border-radius: 6px; overflow: hidden; }
  .section-header { padding: 16px 20px; border-bottom: 1px solid #1a1a1a; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .section-title { font-family: 'Syne', sans-serif; font-size: 15px; font-weight: 700; color: #fff; }
  .section-badge { font-size: 10px; padding: 2px 8px; border-radius: 2px; text-transform: uppercase; letter-spacing: 1px; flex-shrink: 0; }
  .badge-pants { background: #1a2a3a; color: #4a9eff; }
  .badge-nappies { background: #2a1a2a; color: #c47eff; }
  .best-deal { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 11px; color: #666; flex-wrap: wrap; }
  .best-deal strong { color: #4ade80; font-size: 13px; }
  .price-table { width: 100%; border-collapse: collapse; }
  .price-table th { padding: 8px 16px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #444; font-weight: 500; border-bottom: 1px solid #1a1a1a; }
  .price-table td { padding: 11px 16px; font-size: 12px; border-bottom: 1px solid #161616; vertical-align: middle; }
  .price-table tr:last-child td { border-bottom: none; }
  .price-table tr.oos td { opacity: 0.35; }
  .price-table tr.best-row td { background: #0d1a0d; }
  .price-table tr:hover:not(.oos) td { background: #161616; }
  .retailer-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 8px; flex-shrink: 0; }
  .retailer-cell { display: flex; align-items: center; }
  .unit-price { font-size: 15px; font-weight: 500; color: #e8e4dc; }
  .unit-price.best { color: #4ade80; }
  .pack-price { font-size: 11px; color: #555; margin-top: 1px; }
  .pack-badge { display: inline-block; padding: 2px 7px; border-radius: 2px; font-size: 10px; background: #1a1a1a; color: #888; border: 1px solid #222; }
  .oos-badge { display: inline-block; padding: 2px 7px; border-radius: 2px; font-size: 10px; background: #1a0d0d; color: #663333; border: 1px solid #2a1515; text-transform: uppercase; letter-spacing: 1px; margin-left: 4px; }
  .error-badge { font-size: 10px; color: #554444; }
  .scraped-at { font-size: 10px; color: #333; }
  .chart-section { padding: 20px; border-top: 1px solid #1a1a1a; }
  .chart-title { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #444; margin-bottom: 16px; }
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
  .modal { background: #111; border: 1px solid #2a2a2a; border-radius: 6px; padding: 24px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; }
  .modal h2 { font-family: 'Syne', sans-serif; font-size: 17px; margin-bottom: 20px; }
  .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
  .form-grid .full { grid-column: 1 / -1; }
  .field label { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #555; margin-bottom: 5px; }
  .field input, .field select { width: 100%; background: #0d0d0d; border: 1px solid #2a2a2a; border-radius: 3px; padding: 8px 10px; color: #e8e4dc; font-family: 'DM Mono', monospace; font-size: 12px; }
  .field input:focus, .field select:focus { outline: none; border-color: #444; }
  .field select option { background: #111; }
  .modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
  .config-table { width: 100%; border-collapse: collapse; }
  .config-table th { padding: 6px 12px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; color: #444; border-bottom: 1px solid #1a1a1a; }
  .config-table td { padding: 8px 12px; font-size: 11px; border-bottom: 1px solid #161616; }
  .url-cell { max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #444; font-size: 10px; display: block; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: #1a2a1a; border: 1px solid #2a4a2a; color: #4ade80; padding: 10px 16px; border-radius: 4px; font-size: 12px; z-index: 200; animation: slideIn 0.2s ease; }
  .toast.error { background: #2a1a1a; border-color: #4a2a2a; color: #ff6666; }
  @keyframes slideIn { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  .dot-pulse { width: 6px; height: 6px; border-radius: 50%; background: #4ade80; display: inline-block; animation: pulse 1s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.2; } }
  .scraping-row { display: flex; gap: 8px; align-items: center; font-size: 11px; color: #555; padding: 10px 16px; }
  .empty-state { padding: 48px; text-align: center; color: #333; font-size: 12px; }
  .backend-banner { background: #1a1a0d; border: 1px solid #333; border-radius: 4px; padding: 12px 16px; margin-bottom: 20px; font-size: 11px; color: #888; display: flex; align-items: center; gap: 10px; }
  .backend-banner a { color: #aaa; }
`;

const styleEl = document.createElement("style");
styleEl.textContent = css;
document.head.appendChild(styleEl);

function fmtDate(iso) {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleDateString("en-NZ", { day: "numeric", month: "short" }) +
    " " + d.toLocaleTimeString("en-NZ", { hour: "2-digit", minute: "2-digit" });
}

function Toast({ msg, type, onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [onDone]);
  return <div className={`toast ${type === "error" ? "error" : ""}`}>{msg}</div>;
}

function AddVariantModal({ onClose, onSave, currentSize }) {
  const [form, setForm] = useState({ retailer: RETAILERS[0], product_type: "pants", size: currentSize, pack_count: "", url: "", notes: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => {
    if (!form.pack_count || !form.url) return;
    await onSave({ ...form, size: parseInt(form.size), pack_count: parseInt(form.pack_count) });
    onClose();
  };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Add Variant</h2>
        <div className="form-grid">
          <div className="field"><label>Retailer</label>
            <select value={form.retailer} onChange={e => set("retailer", e.target.value)}>
              {RETAILERS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="field"><label>Product</label>
            <select value={form.product_type} onChange={e => set("product_type", e.target.value)}>
              <option value="pants">Nappy Pants</option>
              <option value="nappies">Nappies</option>
            </select>
          </div>
          <div className="field"><label>Size</label>
            <input type="number" value={form.size} onChange={e => set("size", e.target.value)} min={4} max={7} />
          </div>
          <div className="field"><label>Pack Count</label>
            <input type="number" value={form.pack_count} onChange={e => set("pack_count", e.target.value)} placeholder="e.g. 96" />
          </div>
          <div className="field full"><label>Product URL</label>
            <input type="url" value={form.url} onChange={e => set("url", e.target.value)} placeholder="https://..." />
          </div>
          <div className="field full"><label>Notes (optional)</label>
            <input type="text" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="e.g. boxed bulk pack" />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={!form.pack_count || !form.url}>Add</button>
        </div>
      </div>
    </div>
  );
}

function ConfigModal({ variants, onClose, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(null);
  const [editUrl, setEditUrl] = useState("");
  const [editCount, setEditCount] = useState("");
  const startEdit = (v) => { setEditing(v.id); setEditUrl(v.url); setEditCount(v.pack_count); };
  const saveEdit = async (id) => { await onUpdate(id, { url: editUrl, pack_count: parseInt(editCount) }); setEditing(null); };
  const inp = { background: "#0d0d0d", border: "1px solid #333", color: "#e8e4dc", padding: "2px 6px", borderRadius: 2, fontFamily: "DM Mono, monospace", fontSize: 11 };
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 820 }}>
        <h2>Configure Variants</h2>
        <div style={{ overflowX: "auto", marginBottom: 16 }}>
          <table className="config-table">
            <thead><tr><th>Retailer</th><th>Product</th><th>Sz</th><th>Pack</th><th>URL</th><th></th></tr></thead>
            <tbody>
              {variants.map(v => (
                <tr key={v.id}>
                  <td>{v.retailer}</td>
                  <td>{v.product_type === "pants" ? "Pants" : "Nappies"}</td>
                  <td>{v.size}</td>
                  <td>{editing === v.id ? <input style={{ ...inp, width: 55 }} value={editCount} onChange={e => setEditCount(e.target.value)} /> : `${v.pack_count}pk`}</td>
                  <td>{editing === v.id
                    ? <input style={{ ...inp, width: 300 }} value={editUrl} onChange={e => setEditUrl(e.target.value)} />
                    : <span className="url-cell" title={v.url}>{v.url}</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {editing === v.id
                      ? <><button className="btn sm" onClick={() => saveEdit(v.id)}>Save</button><button className="btn sm" onClick={() => setEditing(null)} style={{ marginLeft: 4 }}>✕</button></>
                      : <><button className="btn sm" onClick={() => startEdit(v)}>Edit</button><button className="btn sm danger" onClick={() => onDelete(v.id)} style={{ marginLeft: 4 }}>Del</button></>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="modal-actions"><button className="btn primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}

function PriceTable({ rows, scraping }) {
  if (!rows.length) return <div className="empty-state">No variants configured for this size.</div>;
  const inStock = rows.filter(r => r.in_stock && r.price != null);
  const bestUP = inStock.length ? Math.min(...inStock.map(r => unitPrice(r.price, r.pack_count))) : null;
  const sorted = [...rows].sort((a, b) => {
    const ua = unitPrice(a.price, a.pack_count), ub = unitPrice(b.price, b.pack_count);
    if (!a.in_stock && b.in_stock) return 1;
    if (a.in_stock && !b.in_stock) return -1;
    if (ua == null) return 1; if (ub == null) return -1;
    return ua - ub;
  });
  return (
    <table className="price-table">
      <thead><tr><th>Retailer</th><th>Pack</th><th>Per nappy</th><th>Pack price</th><th>Checked</th></tr></thead>
      <tbody>
        {sorted.map(row => {
          const up = unitPrice(row.price, row.pack_count);
          const isBest = up != null && up === bestUP && row.in_stock;
          const isOos = !row.in_stock || row.price == null;
          return (
            <tr key={row.id} className={`${isOos ? "oos" : ""} ${isBest ? "best-row" : ""}`}>
              <td><div className="retailer-cell"><span className="retailer-dot" style={{ background: RETAILER_COLORS[row.retailer] || "#555" }} />{row.retailer}</div></td>
              <td>
                <span className="pack-badge">{row.pack_count}pk</span>
                {isOos && <span className="oos-badge">{row.error === "URL not configured" ? "no url" : "OOS"}</span>}
              </td>
              <td>
                {!isOos && <span className={`unit-price ${isBest ? "best" : ""}`}>{isBest && "★ "}{fmtUnit(up)}</span>}
                {row.error && !row.price && <span className="error-badge">{row.error}</span>}
              </td>
              <td>{!isOos ? <><span style={{ fontSize: 13 }}>{fmt(row.price)}</span>{row.notes && <div className="pack-price">{row.notes}</div>}</> : "—"}</td>
              <td><span className="scraped-at">{fmtDate(row.scraped_at)}</span></td>
            </tr>
          );
        })}
        {scraping && <tr><td colSpan={5}><div className="scraping-row"><div className="dot-pulse" />Fetching latest prices…</div></td></tr>}
      </tbody>
    </table>
  );
}

function TrendChart({ history, productType, size }) {
  const relevant = history.filter(h => h.product_type === productType && h.size === size && h.price != null && h.in_stock);
  if (relevant.length < 2) return null;
  const byDateRetailer = {};
  relevant.forEach(h => {
    const date = h.scraped_at.slice(0, 10);
    if (!byDateRetailer[date]) byDateRetailer[date] = {};
    const up = unitPrice(h.price, h.pack_count);
    if (byDateRetailer[date][h.retailer] == null || up < byDateRetailer[date][h.retailer]) byDateRetailer[date][h.retailer] = up;
  });
  const dates = Object.keys(byDateRetailer).sort();
  const retailers = [...new Set(relevant.map(h => h.retailer))];
  const chartData = dates.map(date => ({
    date,
    ...Object.fromEntries(retailers.map(r => [r, byDateRetailer[date][r] != null ? +(byDateRetailer[date][r] * 100).toFixed(1) : null]))
  }));
  return (
    <div className="chart-section">
      <div className="chart-title">Price per nappy (¢) over time</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: -16, bottom: 0 }}>
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#444" }} tickLine={false} axisLine={false} tickFormatter={v => `${v}¢`} />
          <Tooltip contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 3, fontSize: 11 }} labelStyle={{ color: "#666", marginBottom: 4 }} formatter={(v, name) => [`${v}¢`, name]} />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} />
          {retailers.map(r => <Line key={r} type="monotone" dataKey={r} stroke={RETAILER_COLORS[r] || "#888"} strokeWidth={1.5} dot={false} connectNulls={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProductSection({ type, size, latest, history, scraping }) {
  const rows = latest.filter(r => r.product_type === type && r.size === size);
  const inStock = rows.filter(r => r.in_stock && r.price != null);
  const best = inStock.length ? inStock.reduce((a, b) => unitPrice(a.price, a.pack_count) < unitPrice(b.price, b.pack_count) ? a : b) : null;
  return (
    <div className="section">
      <div className="section-header">
        <span className={`section-badge ${type === "pants" ? "badge-pants" : "badge-nappies"}`}>{type === "pants" ? "Pull-up Pants" : "Nappies"}</span>
        <span className="section-title">Huggies Ultra Dry · Size {size}</span>
        {best && <div className="best-deal">Best: <strong>{fmtUnit(unitPrice(best.price, best.pack_count))}</strong><span style={{ color: "#555" }}>@ {best.retailer} ({best.pack_count}pk)</span></div>}
      </div>
      <PriceTable rows={rows} scraping={scraping} />
      <TrendChart history={history} productType={type} size={size} />
    </div>
  );
}

export default function App() {
  const [size, setSize] = useState(5);
  const [sizes, setSizes] = useState([5]);
  const [latest, setLatest] = useState([]);
  const [history, setHistory] = useState([]);
  const [variants, setVariants] = useState([]);
  const [scraping, setScraping] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [toast, setToast] = useState(null);
  const [lastScrape, setLastScrape] = useState(null);
  const [backendOk, setBackendOk] = useState(null);

  const showToast = (msg, type = "ok") => setToast({ msg, type });

  const loadData = useCallback(async () => {
    try {
      const [latestRes, historyRes, variantsRes] = await Promise.all([
        fetch(`${API}/prices/latest`),
        fetch(`${API}/prices/history?limit=300`),
        fetch(`${API}/variants`),
      ]);
      const [lat, hist, vars] = await Promise.all([latestRes.json(), historyRes.json(), variantsRes.json()]);
      setLatest(lat); setHistory(hist); setVariants(vars);
      setBackendOk(true);
      const allSizes = [...new Set(vars.map(v => v.size))].sort();
      setSizes(allSizes.length ? allSizes : [5]);
      if (!allSizes.includes(size) && allSizes.length) setSize(allSizes[0]);
    } catch {
      setBackendOk(false);
    }
  }, [size]);

  useEffect(() => { loadData(); }, []);

  const scrapeAll = async () => {
    setScraping(true);
    try {
      const res = await fetch(`${API}/scrape`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const results = await res.json();
      const errors = results.filter(r => r.error && r.error !== "URL not configured");
      setLastScrape(new Date());
      await loadData();
      if (errors.length) showToast(`${results.length - errors.length}/${results.length} scraped — ${errors.length} errors`, "error");
      else showToast(`All ${results.length} variants updated`);
    } catch { showToast("Scrape failed — check backend", "error"); }
    finally { setScraping(false); }
  };

  const addVariant = async (data) => {
    const res = await fetch(`${API}/variants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (res.ok) { await loadData(); showToast("Variant added"); }
    else { const e = await res.json(); showToast(e.error || "Failed", "error"); }
  };

  const deleteVariant = async (id) => { await fetch(`${API}/variants/${id}`, { method: "DELETE" }); await loadData(); showToast("Removed"); };
  const updateVariant = async (id, data) => { await fetch(`${API}/variants/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); await loadData(); showToast("Saved"); };

  return (
    <div className="app">
      <div className="header">
        <h1>Nappy Tracker</h1>
        <span className="sub">Huggies Ultra Dry · NZ</span>
        {lastScrape && <span className="sub" style={{ marginLeft: "auto" }}>refreshed {fmtDate(lastScrape.toISOString())}</span>}
      </div>

      {backendOk === false && (
        <div className="backend-banner">
          ⚠ Can't reach backend at <strong style={{ color: "#ccc", margin: "0 6px" }}>192.168.4.127:5051</strong>
          — start with <code style={{ color: "#aaa" }}>python app.py</code> on nosy box, or update the API const at the top of this file.
        </div>
      )}

      <div className="controls">
        <div className="size-tabs">
          {sizes.map(s => <button key={s} className={`size-tab ${size === s ? "active" : ""}`} onClick={() => setSize(s)}>Size {s}</button>)}
        </div>
        <div className="spacer" />
        <button className="btn" onClick={() => setShowAdd(true)}>+ Variant</button>
        <button className="btn" onClick={() => setShowConfig(true)}>Configure</button>
        <button className="btn primary" onClick={scrapeAll} disabled={scraping}>
          {scraping ? <><span className="dot-pulse" />Refreshing…</> : "↻ Refresh Prices"}
        </button>
      </div>

      <div className="product-sections">
        <ProductSection type="pants" size={size} latest={latest} history={history} scraping={scraping} />
        <ProductSection type="nappies" size={size} latest={latest} history={history} scraping={scraping} />
      </div>

      {showAdd && <AddVariantModal currentSize={size} onClose={() => setShowAdd(false)} onSave={addVariant} />}
      {showConfig && <ConfigModal variants={variants} onClose={() => setShowConfig(false)} onDelete={deleteVariant} onUpdate={updateVariant} />}
      {toast && <Toast msg={toast.msg} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
