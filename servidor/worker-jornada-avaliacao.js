/*
 * Worker "jornada-avaliacao" (Cloudflare)
 *
 * Função: deixar o app de gestão do professor chamar a IA do Claude sem que a
 * chave da Anthropic fique em qualquer navegador.
 *
 * Como protege:
 * 1. Só aceita pedidos vindos dos endereços em ORIGENS.
 * 2. Só aceita pedidos com o login do Firebase do professor (confere a
 *    assinatura do Google e o UID).
 * 3. A chave fica no segredo ANTHROPIC_API_KEY do Worker (Settings, Variables
 *    and Secrets). Ela nunca aparece neste código nem no repositório.
 *
 * O corpo do pedido é repassado sem ser lido, para gastar pouco processamento
 * (o plano gratuito da Cloudflare tem limite de CPU por pedido).
 */

const PROJETO = "sistema-jornada";
const UID_PROFESSOR = "WWCWsIyLX2U2L2GQjwQx90HBtEo1";
const ORIGENS = ["https://cicero-arte.github.io"];
const TAMANHO_MAXIMO = 20 * 1024 * 1024; // 20 MB
const CHAVES_GOOGLE = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

let cacheChaves = null;
let cacheAte = 0;

export default {
  async fetch(request, env) {
    const origem = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGENS.includes(origem) ? origem : ORIGENS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };
    const erro = (status, mensagem) => new Response(
      JSON.stringify({ error: { type: "jornada", message: mensagem } }),
      { status, headers: { ...cors, "Content-Type": "application/json" } }
    );

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return erro(405, "Use POST.");
    if (!ORIGENS.includes(origem)) return erro(403, "Endereço não autorizado.");
    if (!env.ANTHROPIC_API_KEY) return erro(500, "O segredo ANTHROPIC_API_KEY não foi configurado no Worker.");

    const tamanho = Number(request.headers.get("Content-Length") || 0);
    if (!tamanho || tamanho > TAMANHO_MAXIMO) return erro(413, "Pedido vazio ou grande demais.");

    const auth = request.headers.get("Authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    try {
      await conferirLogin(token);
    } catch (e) {
      return erro(401, "Login do professor não confirmado: " + e.message);
    }

    const resposta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2026-10-21",
        "anthropic-beta": "server-side-fallback-2026-07-01"
      },
      body: request.body
    });
    return new Response(resposta.body, {
      status: resposta.status,
      headers: { ...cors, "Content-Type": "application/json" }
    });
  }
};

function b64url(texto) {
  const b = texto.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b + "===".slice((b.length + 3) % 4)), c => c.charCodeAt(0));
}

async function chavesGoogle() {
  if (cacheChaves && Date.now() < cacheAte) return cacheChaves;
  const r = await fetch(CHAVES_GOOGLE);
  if (!r.ok) throw new Error("não foi possível buscar as chaves do Google");
  const idade = /max-age=(\d+)/.exec(r.headers.get("Cache-Control") || "");
  cacheChaves = (await r.json()).keys;
  cacheAte = Date.now() + (idade ? Number(idade[1]) : 3600) * 1000;
  return cacheChaves;
}

async function conferirLogin(token) {
  const partes = token.split(".");
  if (partes.length !== 3) throw new Error("sem token");
  const cab = JSON.parse(new TextDecoder().decode(b64url(partes[0])));
  const dados = JSON.parse(new TextDecoder().decode(b64url(partes[1])));
  if (cab.alg !== "RS256") throw new Error("algoritmo inválido");
  const jwk = (await chavesGoogle()).find(k => k.kid === cab.kid);
  if (!jwk) throw new Error("chave desconhecida");
  const chave = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", chave, b64url(partes[2]),
    new TextEncoder().encode(partes[0] + "." + partes[1]));
  if (!ok) throw new Error("assinatura inválida");
  const agora = Math.floor(Date.now() / 1000);
  if (dados.iss !== "https://securetoken.google.com/" + PROJETO) throw new Error("emissor inválido");
  if (dados.aud !== PROJETO) throw new Error("projeto inválido");
  if (!(dados.exp > agora) || !(dados.iat <= agora + 300)) throw new Error("token vencido");
  if (dados.sub !== UID_PROFESSOR) throw new Error("usuário não é o professor");
}
