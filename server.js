const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const pty = require("node-pty");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 10000;
const PASSWORD = process.env.ZEPVM_PASSWORD || "";

if (!PASSWORD) {
  console.warn("WARNING: ZEPVM_PASSWORD is not set. Terminal access is disabled until it is configured.");
}

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function makeToken() {
  return crypto.randomBytes(32).toString("hex");
}

const sessions = new Map();

app.post("/api/login", (req, res) => {
  if (!PASSWORD) return res.status(503).json({ error: "ZEPVM_PASSWORD is not configured." });

  const password = String(req.body?.password || "");
  if (password !== PASSWORD) return res.status(401).json({ error: "Invalid password." });

  const token = makeToken();
  sessions.set(token, Date.now());

  // Keep memory bounded.
  for (const [key, created] of sessions) {
    if (Date.now() - created > 24 * 60 * 60 * 1000) sessions.delete(key);
  }

  res.json({ token });
});

app.get("/api/info", (_req, res) => {
  res.json({
    name: "ZepVm",
    hostname: "ZepVm",
    terminal: "Browser PTY",
    platform: process.platform,
    node: process.version
  });
});

server.on("upgrade", (request, socket, head) => {
  if (request.url !== "/terminal") {
    socket.destroy();
    return;
  }

  const auth = request.headers.authorization || "";
  const headerToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const queryToken = new URL(request.url, "http://localhost").searchParams.get("token") || "";
  const token = headerToken || queryToken;

  if (!token || !sessions.has(token)) {
    socket.write("HTTP/1.1 401 Unauthorized\\r\\n\\r\\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, request);
  });
});

wss.on("connection", (ws) => {
  const shell = process.env.SHELL || "/bin/bash";
  const cwd = process.env.ZEPVM_CWD || process.env.HOME || "/tmp";

  const term = pty.spawn(shell, ["--login"], {
    name: "xterm-256color",
    cols: 100,
    rows: 30,
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      ZEPVM_HOSTNAME: "ZepVm"
    }
  });

  term.write("clear\r");
  term.write("printf '\\033[1;32mZepVm Console\\033[0m  Connected\\r\\n'\r");
  term.write("printf 'Hostname: ZepVm | Browser PTY\\r\\n\\r\\n'\r");

  term.onData((data) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });

  ws.on("message", (message) => {
    try {
      const msg = JSON.parse(message.toString());

      if (msg.type === "input" && typeof msg.data === "string") {
        term.write(msg.data);
      }

      if (msg.type === "resize") {
        const cols = Math.max(20, Math.min(300, Number(msg.cols) || 100));
        const rows = Math.max(5, Math.min(100, Number(msg.rows) || 30));
        term.resize(cols, rows);
      }
    } catch {
      // Ignore malformed WebSocket messages.
    }
  });

  const close = () => {
    try { term.kill(); } catch {}
  };

  ws.on("close", close);
  ws.on("error", close);
  term.onExit(close);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ZepVm listening on ${PORT}`);
});