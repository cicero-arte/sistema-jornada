import worker from "./worker-jornada-avaliacao.js";
const { subtle } = globalThis.crypto;
const par = await subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign","verify"]);
const outro = await subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" }, true, ["sign","verify"]);
const jwk = { ...(await subtle.exportKey("jwk", par.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const b64 = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");
async function token(dados, chave = par.privateKey, kid = "k1") {
  const a = b64({ alg: "RS256", kid, typ: "JWT" }) + "." + b64(dados);
  const s = await subtle.sign("RSASSA-PKCS1-v1_5", chave, new TextEncoder().encode(a));
  return a + "." + Buffer.from(s).toString("base64url");
}
const agora = Math.floor(Date.now() / 1000);
const ok = { iss: "https://securetoken.google.com/sistema-jornada", aud: "sistema-jornada", sub: "WWCWsIyLX2U2L2GQjwQx90HBtEo1", iat: agora - 10, exp: agora + 3000 };
let ultimo = null;
globalThis.fetch = async (url, op) => {
  if (String(url).includes("googleapis.com/service_accounts")) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Cache-Control": "max-age=100" } });
  if (String(url) === "https://api.anthropic.com/v1/messages") { ultimo = { headers: op.headers, body: await new Response(op.body).text() }; return new Response(JSON.stringify({ ok: true }), { status: 200 }); }
  throw new Error("url inesperada " + url);
};
const env = { ANTHROPIC_API_KEY: "sk-ant-ficticia" };
const corpo = JSON.stringify({ model: "claude-opus-5-5", messages: [] });
const pedido = (tk, extra = {}) => new Request("https://jornada-avaliacao.exemplo/", { method: "POST", body: corpo, duplex: "half",
  headers: { "Origin": "https://cicero-arte.github.io", "Content-Type": "application/json", "Content-Length": String(corpo.length), "Authorization": "Bearer " + tk, ...extra } });
let certos = 0, falhas = 0;
async function t(nome, req, status, e = env) {
  ultimo = null;
  const r = await worker.fetch(req, e);
  const bom = r.status === status; bom ? certos++ : falhas++;
  console.log(bom ? "ok   " : "FALHA", nome, "->", r.status, bom ? "" : await r.text());
  return r;
}
const r1 = await t("token do professor passa", pedido(await token(ok)), 200);
console.log("      chave colocada pelo Worker:", ultimo && ultimo.headers["x-api-key"] === "sk-ant-ficticia", "| corpo repassado igual:", ultimo && ultimo.body === corpo, "| CORS:", r1.headers.get("Access-Control-Allow-Origin"));
await t("outro usuário é recusado", pedido(await token({ ...ok, sub: "outro" })), 401);
await t("token vencido é recusado", pedido(await token({ ...ok, exp: agora - 5 })), 401);
await t("outro projeto é recusado", pedido(await token({ ...ok, aud: "outro-projeto", iss: "https://securetoken.google.com/outro-projeto" })), 401);
await t("assinatura falsa é recusada", pedido(await token(ok, outro.privateKey)), 401);
await t("chave desconhecida é recusada", pedido(await token(ok, par.privateKey, "k9")), 401);
await t("token sem assinatura (alg none) é recusado", pedido(b64({ alg: "none", kid: "k1" }) + "." + b64(ok) + "."), 401);
await t("sem token é recusado", pedido(""), 401);
await t("outro site é recusado", pedido(await token(ok), { Origin: "https://site-estranho.com" }), 403);
await t("GET é recusado", new Request("https://x/", { method: "GET", headers: { Origin: "https://cicero-arte.github.io" } }), 405);
await t("pré-verificação CORS responde", new Request("https://x/", { method: "OPTIONS", headers: { Origin: "https://cicero-arte.github.io" } }), 204);
await t("sem segredo configurado avisa", pedido(await token(ok)), 500, {});
await t("pedido grande demais é recusado", pedido(await token(ok), { "Content-Length": String(30 * 1024 * 1024) }), 413);
console.log(`\n${certos} certos, ${falhas} com falha`);
