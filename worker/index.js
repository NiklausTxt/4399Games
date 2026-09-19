const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

const SESSION_COOKIE = "dp42_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 210_000;
const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return null;
  return Uint8Array.from(hex.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

function randomHex(byteLength = 32) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function sha256(text) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text))));
}

async function hashPassword(password, saltHex) {
  const salt = hexToBytes(saltHex);
  if (!salt) throw new Error("Invalid password salt");
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

export function validateCredentials(username, password) {
  const normalizedUsername = String(username ?? "").trim();
  const normalizedPassword = String(password ?? "");
  if (!/^[\p{L}\p{N}_-]{3,24}$/u.test(normalizedUsername)) {
    return { error: "用户名需为 3–24 位，只能包含中英文、数字、下划线或短横线。" };
  }
  if (normalizedPassword.length < 8 || normalizedPassword.length > 72) {
    return { error: "密码长度需为 8–72 位。" };
  }
  return { username: normalizedUsername, password: normalizedPassword };
}

function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=UTF-8");
  headers.set("cache-control", "no-store");
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);
  return new Response(JSON.stringify(data), { ...init, headers });
}

function cookies(request) {
  return Object.fromEntries(
    (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
      const separator = part.indexOf("=");
      return separator < 0 ? [part, ""] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    }),
  );
}

function sessionCookie(token, maxAge = SESSION_TTL_SECONDS) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

let schemaPromise;

function ensureSchema(env) {
  if (schemaPromise) return schemaPromise;
  schemaPromise = env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)"),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_id TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, game_id)
    )`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_scores_user_updated ON scores(user_id, updated_at DESC)"),
  ]).catch((error) => {
    schemaPromise = null;
    throw error;
  });
  return schemaPromise;
}

async function readJson(request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return null;
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function sameOrigin(request, url) {
  const origin = request.headers.get("origin");
  return !origin || origin === url.origin;
}

async function currentUser(request, env) {
  const token = cookies(request)[SESSION_COOKIE];
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) return null;
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  return env.DB.prepare(`SELECT users.id, users.username
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?`)
    .bind(tokenHash, now).first();
}

async function createSession(env, userId) {
  const token = randomHex();
  const tokenHash = await sha256(token);
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, userId, now + SESSION_TTL_SECONDS, now).run();
  return token;
}

async function userSummary(env, user) {
  const stats = await env.DB.prepare(`SELECT COALESCE(MAX(score), 0) AS bestScore,
    COALESCE(SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END), 0) AS gamesPlayed
    FROM scores WHERE user_id = ?`).bind(user.id).first();
  const recent = await env.DB.prepare(`SELECT game_id AS gameId, score, completed, updated_at AS updatedAt
    FROM scores WHERE user_id = ? ORDER BY updated_at DESC LIMIT 10`).bind(user.id).all();
  return {
    loggedIn: true,
    user: { id: user.id, username: user.username },
    stats: { bestScore: Number(stats?.bestScore) || 0, gamesPlayed: Number(stats?.gamesPlayed) || 0 },
    recent: recent.results ?? [],
  };
}

async function handleApi(request, env, url) {
  await ensureSchema(env);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (method !== "GET" && !sameOrigin(request, url)) return json({ error: "请求来源无效。" }, { status: 403 });

  if (path === "/api/auth/me" && method === "GET") {
    const user = await currentUser(request, env);
    return user ? json(await userSummary(env, user)) : json({ loggedIn: false });
  }

  if (path === "/api/auth/register" && method === "POST") {
    const body = await readJson(request);
    const credentials = validateCredentials(body?.username, body?.password);
    if (credentials.error) return json({ error: credentials.error }, { status: 400 });

    const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE")
      .bind(credentials.username).first();
    if (exists) return json({ error: "这个用户名已经被使用。" }, { status: 409 });

    const salt = randomHex(16);
    const passwordHash = await hashPassword(credentials.password, salt);
    const now = Math.floor(Date.now() / 1000);
    let result;
    try {
      result = await env.DB.prepare("INSERT INTO users (username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?)")
        .bind(credentials.username, passwordHash, salt, now).run();
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) return json({ error: "这个用户名已经被使用。" }, { status: 409 });
      throw error;
    }
    const user = { id: result.meta.last_row_id, username: credentials.username };
    const token = await createSession(env, user.id);
    return json(await userSummary(env, user), { status: 201, headers: { "set-cookie": sessionCookie(token) } });
  }

  if (path === "/api/auth/login" && method === "POST") {
    const body = await readJson(request);
    const credentials = validateCredentials(body?.username, body?.password);
    if (credentials.error) return json({ error: "用户名或密码不正确。" }, { status: 401 });
    const user = await env.DB.prepare("SELECT id, username, password_hash, password_salt FROM users WHERE username = ? COLLATE NOCASE")
      .bind(credentials.username).first();
    const candidate = user ? await hashPassword(credentials.password, user.password_salt) : await hashPassword(credentials.password, "00".repeat(16));
    if (!user || !timingSafeEqual(candidate, user.password_hash)) {
      return json({ error: "用户名或密码不正确。" }, { status: 401 });
    }
    const token = await createSession(env, user.id);
    return json(await userSummary(env, user), { headers: { "set-cookie": sessionCookie(token) } });
  }

  if (path === "/api/auth/logout" && method === "POST") {
    const token = cookies(request)[SESSION_COOKIE];
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, { headers: { "set-cookie": sessionCookie("", 0) } });
  }

  if (path === "/api/scores" && method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return json({ error: "请先登录。" }, { status: 401 });
    const body = await readJson(request);
    const score = Number(body?.score);
    const gameId = String(body?.gameId ?? "");
    const completed = body?.completed === true ? 1 : 0;
    if (!Number.isSafeInteger(score) || score < 0 || score > 1_000_000_000 || !/^[0-9a-z-]{8,64}$/i.test(gameId)) {
      return json({ error: "成绩数据无效。" }, { status: 400 });
    }
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(`INSERT INTO scores (user_id, game_id, score, completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, game_id) DO UPDATE SET
        score = MAX(scores.score, excluded.score),
        completed = MAX(scores.completed, excluded.completed),
        updated_at = excluded.updated_at`)
      .bind(user.id, gameId, score, completed, now, now).run();
    return json(await userSummary(env, user));
  }

  return json({ error: "接口不存在。" }, { status: 404 });
}

async function sha1(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function hasValidWeChatSignature(url, token) {
  const signature = url.searchParams.get("signature");
  const timestamp = url.searchParams.get("timestamp");
  const nonce = url.searchParams.get("nonce");

  if (!signature || !timestamp || !nonce || !token) return false;

  const expected = await sha1([token, timestamp, nonce].sort().join(""));
  return expected === signature;
}

function xmlValue(xml, tag) {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`);
  const plain = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  return (xml.match(cdata) || xml.match(plain))?.[1] ?? "";
}

function safeCdata(value) {
  return String(value).replaceAll("]]>", "]]]]><![CDATA[>");
}

function textReply(toUser, fromUser, content) {
  return `<xml>
<ToUserName><![CDATA[${safeCdata(toUser)}]]></ToUserName>
<FromUserName><![CDATA[${safeCdata(fromUser)}]]></FromUserName>
<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${safeCdata(content)}]]></Content>
</xml>`;
}

function replyForText(content) {
  const text = content.trim();

  if (/^(帮助|help|菜单)$/i.test(text)) {
    return `DON'T PANIC 42 功能菜单：\n\n回复“网站”获取主页地址\n回复“游戏”开始玩 2048\n回复“关于”了解这个项目`;
  }
  if (/^(网站|游戏)$/i.test(text)) return "2048 游戏地址：https://dontpanic42.top/2048/";
  if (text === "关于") return "DON'T PANIC 42 是一个个人数字实验室。现在可以直接在手机上玩 2048。";
  if (/^(你好|您好|hi|hello)$/i.test(text)) return "你好！这里是 DON'T PANIC 42。回复“帮助”查看可用功能。";
  return `收到你的消息：${text}\n\n回复“帮助”查看可用功能。`;
}

async function handleWeChat(request, env, url) {
  const valid = await hasValidWeChatSignature(url, env.WECHAT_TOKEN);
  if (!valid) return new Response("Invalid signature", { status: 403 });

  if (request.method === "GET") {
    const echostr = url.searchParams.get("echostr");
    return echostr
      ? new Response(echostr, { headers: { "content-type": "text/plain; charset=UTF-8" } })
      : new Response("Bad Request", { status: 400 });
  }

  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const xml = await request.text();
  const fromUser = xmlValue(xml, "FromUserName");
  const toUser = xmlValue(xml, "ToUserName");
  const msgType = xmlValue(xml, "MsgType");
  const event = xmlValue(xml, "Event");

  if (!fromUser || !toUser) return new Response("success");

  let reply;
  if (msgType === "event" && event === "subscribe") {
    reply = "欢迎关注 DON'T PANIC 42！\n\n回复“帮助”查看可用功能。";
  } else if (msgType === "text") {
    reply = replyForText(xmlValue(xml, "Content"));
  } else {
    return new Response("success");
  }

  return new Response(textReply(fromUser, toUser, reply), {
    headers: { "content-type": "application/xml; charset=UTF-8" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/wechat") {
      return handleWeChat(request, env, url);
    }

    if (url.pathname.startsWith("/api/")) {
      return handleApi(request, env, url);
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) headers.set(key, value);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
