// Publica no Instagram os posts da fila cujo horário já chegou. Roda no GitHub Actions a cada 15 min.
// Uso: node scripts/publicar.mjs [--simular] [--cliente elohim] [--agora 2026-11-02T10:05:00-03:00]
import fs from "node:fs";
import path from "node:path";
import { RAIZ, arquivoEstado, arquivoFila, clientes, conta, graph, lerJson, salvarJson } from "./lib.mjs";

const args = process.argv.slice(2);
const opcao = (nome) => (args.includes(nome) ? args[args.indexOf(nome) + 1] : undefined);
const simular = args.includes("--simular");
const soCliente = opcao("--cliente");
const agora = new Date(opcao("--agora") ?? Date.now());
const MAX_TENTATIVAS = 3;

// As imagens são servidas pelo próprio repositório (público), fixadas no commit que está rodando
const repo = process.env.GITHUB_REPOSITORY;
const base = process.env.MIDIA_BASE ?? (repo ? `https://raw.githubusercontent.com/${repo}/${process.env.GITHUB_SHA ?? "main"}/` : null);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function publicar({ token, igId }, post, url) {
  const params = { image_url: url };
  if (post.tipo === "STORY") params.media_type = "STORIES";
  else if (post.legenda) params.caption = post.legenda;
  const { id: container } = await graph("POST", `${igId}/media`, params, token);

  // Imagem costuma ficar FINISHED na hora; espera até 2 min antes de desistir
  for (let i = 0; ; i++) {
    const { status_code, status } = await graph("GET", container, { fields: "status_code,status" }, token);
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || status_code === "EXPIRED") throw new Error(`Container ${status_code}: ${status ?? ""}`);
    if (i >= 24) throw new Error(`Container ainda ${status_code} depois de 2 min`);
    await esperar(5000);
  }

  const { id: mediaId } = await graph("POST", `${igId}/media_publish`, { creation_id: container }, token);
  const { permalink } = await graph("GET", mediaId, { fields: "permalink" }, token).catch(() => ({}));
  return { mediaId, permalink };
}

let falhas = 0;
for (const [nome, cfg] of Object.entries(clientes())) {
  if (soCliente && nome !== soCliente) continue;
  const fila = lerJson(arquivoFila(nome), { posts: [] }).posts;
  const estado = lerJson(arquivoEstado(nome), {});
  const janela = (cfg.janelaMinutos ?? 180) * 60_000;
  const salvar = () => !simular && salvarJson(arquivoEstado(nome), estado);

  const devidos = fila
    .filter((p) => new Date(p.data) <= agora)
    .filter((p) => !["publicado", "perdido"].includes(estado[p.id]?.status))
    .filter((p) => (estado[p.id]?.tentativas ?? 0) < MAX_TENTATIVAS)
    .sort((a, b) => new Date(a.data) - new Date(b.data));
  if (!devidos.length) continue;

  let acesso;
  if (!simular) {
    try {
      acesso = await conta(nome, cfg);
    } catch (e) {
      console.error(`✗ ${nome}: ${e.message}`);
      falhas++;
      continue;
    }
  }

  for (const post of devidos) {
    const registro = estado[post.id] ?? { tentativas: 0 };
    // Atrasou demais (Actions parado, token vencido): story das 10h às 18h não faz sentido, então pula
    if (agora - new Date(post.data) > janela) {
      estado[post.id] = { ...registro, status: "perdido", em: agora.toISOString() };
      console.warn(`⚠ ${nome} ${post.id}: passou da janela de ${cfg.janelaMinutos ?? 180} min, não publicado`);
      salvar();
      continue;
    }
    if (!fs.existsSync(path.join(RAIZ, post.midia))) {
      console.error(`✗ ${nome} ${post.id}: arquivo ${post.midia} não está no repositório`);
      falhas++;
      continue;
    }
    const url = base ? new URL(post.midia, base).href : `(sem MIDIA_BASE) ${post.midia}`;
    if (simular) {
      console.log(`[simulação] ${nome} ${post.id} ${post.tipo} → ${url}${post.legenda ? ` | legenda ${post.legenda.length} caracteres` : ""}`);
      continue;
    }
    try {
      const { mediaId, permalink } = await publicar(acesso, post, url);
      estado[post.id] = { status: "publicado", em: new Date().toISOString(), mediaId, permalink, tentativas: registro.tentativas + 1 };
      console.log(`✓ ${nome} ${post.id} ${post.tipo} publicado ${permalink ?? mediaId}`);
    } catch (e) {
      const tentativas = registro.tentativas + 1;
      estado[post.id] = { status: tentativas >= MAX_TENTATIVAS ? "erro" : "pendente", tentativas, erro: e.message, em: new Date().toISOString() };
      console.error(`✗ ${nome} ${post.id} (tentativa ${tentativas}/${MAX_TENTATIVAS}): ${e.message}`);
      falhas++;
      if (e.codigo === 190) break; // token inválido: nem tenta os outros
    }
    salvar();
  }
  salvar();
}

// Saída com erro faz o GitHub mandar e-mail avisando que a execução falhou
if (falhas) process.exit(1);
