const { spawn, exec } = require("node:child_process");
const http = require("node:http");
const net = require("node:net");

const PORT = 4321;
const ROOT = __dirname;

const services = {
  server: { label: "content-downloader-server (Port 3001)", args: ["--filter", "server", "dev"], child: null, probePort: 3001 },
  app: { label: "Expo App (Port 8081)", args: ["--filter", "app", "web"], child: null, probePort: 8081 },
};

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return new RegExp(`^https?://(localhost|127\\.0\\.0\\.1):${PORT}$`).test(origin);
}

function probePort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function startService(key) {
  const svc = services[key];
  if (svc.child) return;
  const child = spawn("pnpm", svc.args, {
    cwd: ROOT,
    shell: true,
    stdio: "ignore",
    detached: true,
  });
  svc.child = child;
  child.on("exit", () => {
    svc.child = null;
  });
}

function stopService(key) {
  const svc = services[key];
  if (!svc.child) return;
  exec(`taskkill /PID ${svc.child.pid} /T /F`, () => {});
  svc.child = null;
}

async function getStatus() {
  const status = {};
  for (const key of Object.keys(services)) {
    const svc = services[key];
    const reachable = await probePort(svc.probePort);
    status[key] = {
      label: svc.label,
      running: svc.child !== null || reachable,
      managed: svc.child !== null,
    };
  }
  return status;
}

const PAGE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<title>Content Downloader Control Panel</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; background: #f5f5f7; color: #1a1a1a; margin: 0; padding: 2.5rem 1.5rem; }
  @media (prefers-color-scheme: dark) { body { background: #16161a; color: #eee; } .card { background: #232329 !important; } }
  h1 { font-size: 1.25rem; margin: 0 0 1.5rem; text-align: center; }
  .card { background: #fff; border-radius: 12px; padding: 1rem 1.25rem; max-width: 420px; margin: 0 auto 0.75rem; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .label { font-size: 0.95rem; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; background: #ccc; }
  .dot.on { background: #2ecc71; }
  .switch { position: relative; width: 46px; height: 26px; }
  .switch input { opacity: 0; width: 0; height: 0; }
  .slider { position: absolute; inset: 0; background: #ccc; border-radius: 999px; cursor: pointer; transition: 0.2s; }
  .slider::before { content: ""; position: absolute; width: 20px; height: 20px; left: 3px; top: 3px; background: white; border-radius: 50%; transition: 0.2s; }
  input:checked + .slider { background: #2ecc71; }
  input:checked + .slider::before { transform: translateX(20px); }
</style>
</head>
<body>
<h1>Content Downloader &mdash; Server Control</h1>
<div id="list"></div>
<script>
async function refresh() {
  const res = await fetch("/api/status");
  const status = await res.json();
  const list = document.getElementById("list");
  list.innerHTML = "";
  for (const [key, svc] of Object.entries(status)) {
    const card = document.createElement("div");
    card.className = "card";
    const hint = svc.running && !svc.managed ? " (extern gestartet)" : "";
    card.innerHTML = \`
      <span class="label"><span class="dot \${svc.running ? "on" : ""}"></span>\${svc.label}\${hint}</span>
      <label class="switch">
        <input type="checkbox" \${svc.running ? "checked" : ""} data-key="\${key}">
        <span class="slider"></span>
      </label>\`;
    list.appendChild(card);
  }
  list.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", async () => {
      input.disabled = true;
      await fetch("/api/toggle/" + input.dataset.key, { method: "POST" });
      await refresh();
    });
  });
}
refresh();
setInterval(refresh, 2000);
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === "/" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(PAGE);
    return;
  }
  if (req.url === "/api/status" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(await getStatus()));
    return;
  }
  const toggleMatch = req.url.match(/^\/api\/toggle\/(server|app)$/);
  if (toggleMatch && req.method === "POST") {
    if (!isAllowedOrigin(req.headers.origin)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const key = toggleMatch[1];
    if (services[key].child) {
      stopService(key);
    } else {
      startService(key);
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(await getStatus()));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Control Panel: http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  for (const key of Object.keys(services)) stopService(key);
  process.exit(0);
});
