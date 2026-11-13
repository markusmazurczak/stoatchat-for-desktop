/**
 * Local page of the desktop settings window. Served as a data: URL with a
 * strict CSP; it only talks to the main process through `window.stoatSettings`.
 */
const PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'">
<title>Desktop settings</title>
<style>
  :root { color-scheme: dark; --bg:#191919; --panel:#232323; --line:#333; --text:#e6e6e6; --muted:#9a9a9a; --accent:#5865f2; --ok:#3ba55d; --err:#ed4245; --warn:#f0b232; }
  * { box-sizing: border-box; }
  body { margin:0; padding:20px 22px; background:var(--bg); color:var(--text); font:14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1 { font-size:18px; margin:0 0 14px; }
  h2 { font-size:13px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:18px 0 8px; }
  section { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px 14px; }
  label.choice { display:flex; gap:8px; align-items:center; margin:6px 0; cursor:pointer; }
  input[type=text] { width:100%; margin-top:8px; padding:8px 10px; border-radius:6px; border:1px solid var(--line); background:#151515; color:var(--text); font:inherit; }
  input[type=text]:disabled { opacity:.5; }
  .row { display:flex; gap:8px; margin-top:12px; flex-wrap:wrap; }
  button { padding:7px 14px; border-radius:6px; border:1px solid var(--line); background:#2c2c2c; color:var(--text); font:inherit; cursor:pointer; }
  button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
  button:disabled { opacity:.5; cursor:default; }
  .status { margin-top:10px; min-height:1.4em; color:var(--muted); }
  .status.ok { color:var(--ok); } .status.err { color:var(--err); } .notice { color:var(--warn); margin:0 0 10px; }
  .hint { color:var(--muted); font-size:12px; margin-top:6px; }
  .footer { display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
</style>
</head>
<body>
<h1>Desktop settings</h1>
<p id="notice" class="notice" hidden></p>

<h2>Server</h2>
<section>
  <label class="choice"><input type="radio" name="mode" value="official"><span>Official server (<span id="official"></span>)</span></label>
  <label class="choice"><input type="radio" name="mode" value="custom"><span>Custom server</span></label>
  <input id="url" type="text" list="recent" placeholder="https://chat.example.com/app" spellcheck="false" autocomplete="off">
  <datalist id="recent"></datalist>
  <div class="hint">Address of the Stoat web app on your server. Only https:// is allowed.</div>
  <div class="row"><button id="test">Test connection</button></div>
  <div id="status" class="status" role="status"></div>
</section>

<h2>Behaviour</h2>
<section>
  <label class="choice"><input id="voiceDblClick" type="checkbox"><span>Join voice channels with a double click</span></label>
  <div class="hint">A single click still only opens the channel.</div>
</section>

<div class="footer">
  <button id="cancel">Cancel</button>
  <button id="save" class="primary">Save</button>
</div>

<script>
  const api = window.stoatSettings;
  const $ = (id) => document.getElementById(id);
  const modeInputs = [...document.querySelectorAll('input[name=mode]')];
  let state;

  function mode() { return modeInputs.find((i) => i.checked)?.value ?? "official"; }
  function setStatus(text, kind) { const s = $("status"); s.textContent = text; s.className = "status" + (kind ? " " + kind : ""); }
  function syncInputs() { $("url").disabled = mode() !== "custom" || state.locked; $("test").disabled = state.locked; }

  async function load() {
    state = await api.getState();
    $("official").textContent = state.defaultServerUrl;
    const custom = !!state.savedServerUrl;
    modeInputs.forEach((i) => { i.checked = i.value === (custom ? "custom" : "official"); i.disabled = state.locked; });
    $("url").value = state.savedServerUrl || "";
    for (const entry of state.recentServers) { const o = document.createElement("option"); o.value = entry; $("recent").append(o); }
    const notices = [...new Set([state.reason, state.warning])].concat([ state.locked ? "The server is set by the --force-server start parameter (" + state.serverUrl + "). Remove it from the shortcut to change the server here." : ""]).filter(Boolean);
    if (notices.length) { $("notice").textContent = notices.join(" "); $("notice").hidden = false; }
    $("voiceDblClick").checked = !!state.voiceJoinOnDoubleClick;
    syncInputs();
  }

  function target() { return mode() === "custom" ? $("url").value : state.defaultServerUrl; }

  modeInputs.forEach((i) => i.addEventListener("change", syncInputs));
  $("cancel").addEventListener("click", () => api.close());
  $("test").addEventListener("click", async () => {
    setStatus("Testing…");
    const r = await api.testServer(target());
    setStatus(r.message, r.ok ? "ok" : "err");
  });
  $("save").addEventListener("click", async () => {
    $("save").disabled = true;
    const r = await api.save({ mode: mode(), url: $("url").value, voiceJoinOnDoubleClick: $("voiceDblClick").checked });
    $("save").disabled = false;
    if (r.ok) api.close(); else setStatus(r.message, r.cancelled ? "" : "err");
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") api.close(); });
  load();
</script>
</body>
</html>`;

export function settingsPageUrl() {
  return `data:text/html;charset=utf-8,${encodeURIComponent(PAGE)}`;
}
