// Funções comuns do publicador: arquivos JSON, segredos, fuso e chamadas à Graph API do Instagram.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GRAPH = process.env.GRAPH_BASE ?? "https://graph.instagram.com";
const VERSAO = process.env.GRAPH_VERSAO ?? "v26.0";

// .env local (só no PC; no GitHub os tokens vêm dos secrets)
const envLocal = path.join(RAIZ, ".env");
if (fs.existsSync(envLocal)) {
  for (const linha of fs.readFileSync(envLocal, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

export const lerJson = (arquivo, padrao) =>
  fs.existsSync(arquivo) ? JSON.parse(fs.readFileSync(arquivo, "utf8")) : padrao;

export const salvarJson = (arquivo, dados) => {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(dados, null, 2) + "\n");
};

export const clientes = () => lerJson(path.join(RAIZ, "clientes.json"), {});
export const arquivoFila = (cliente) => path.join(RAIZ, "fila", `${cliente}.json`);
export const arquivoEstado = (cliente) => path.join(RAIZ, "estado", `${cliente}.json`);

// No Actions cada token vem como variável de ambiente (env do workflow); SEGREDOS (JSON) serve para testes
export function segredo(nome) {
  if (process.env[nome]) return process.env[nome];
  const todos = process.env.SEGREDOS ? JSON.parse(process.env.SEGREDOS) : {};
  return todos[nome];
}

// "2026-11-02T10:00:00" no fuso do cliente → "2026-11-02T10:00:00-03:00"
export function comOffset(dataLocal, fuso) {
  if (/(Z|[+-]\d\d:\d\d)$/.test(dataLocal)) return dataLocal;
  const aproximada = new Date(`${dataLocal}Z`);
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: fuso, timeZoneName: "longOffset" })
    .formatToParts(aproximada)
    .find((p) => p.type === "timeZoneName").value; // "GMT-03:00" (ou "GMT" quando é zero)
  return dataLocal + (nome === "GMT" ? "+00:00" : nome.slice(3));
}

export async function graph(metodo, caminho, params, token) {
  const url = new URL(`${GRAPH}/${caminho.startsWith("refresh_access_token") ? "" : VERSAO + "/"}${caminho}`);
  const corpo = new URLSearchParams({ ...params, access_token: token });
  let resp;
  if (metodo === "GET") {
    for (const [k, v] of corpo) url.searchParams.set(k, v);
    resp = await fetch(url);
  } else {
    resp = await fetch(url, { method: metodo, body: corpo });
  }
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok || dados.error) {
    const e = dados.error ?? {};
    const erro = new Error(`${e.message ?? resp.statusText} (código ${e.code ?? resp.status}${e.error_subcode ? "/" + e.error_subcode : ""})`);
    erro.codigo = e.code;
    throw erro;
  }
  return dados;
}

// Confere que o token é mesmo da conta esperada, para nunca postar a arte de um cliente no perfil de outro
export async function conta(nomeCliente, cfg) {
  const token = segredo(cfg.segredoToken);
  if (!token) throw new Error(`Falta o segredo ${cfg.segredoToken} do cliente ${nomeCliente}`);
  const eu = await graph("GET", "me", { fields: "user_id,username" }, token);
  if (cfg.instagram && eu.username?.toLowerCase() !== cfg.instagram.toLowerCase()) {
    throw new Error(`Token de ${nomeCliente} é da conta @${eu.username}, esperado @${cfg.instagram}`);
  }
  return { token, igId: eu.user_id, username: eu.username };
}
