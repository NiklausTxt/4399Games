const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

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
  if (/^(网站|游戏)$/i.test(text)) return "2048 游戏地址：https://dontpanic42.top";
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
