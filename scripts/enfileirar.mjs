// Coloca as artes de um plano semanal na fila do publicador e manda pro GitHub.
// Uso: node scripts/enfileirar.mjs <cliente> <caminho/do/plano.json> [--sem-push]
// O plano é o mesmo do render (posts[].id, data, tipo, legenda); as imagens <id>.jpg ficam ao lado dele.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, arquivoEstado, arquivoFila, clientes, comOffset, lerJson, salvarJson } from "./lib.mjs";

const [nome, planoArg] = process.argv.slice(2);
const semPush = process.argv.includes("--sem-push");
const cfg = clientes()[nome];
const planoPath = path.resolve(planoArg ?? "");
if (!cfg || !fs.existsSync(planoPath)) {
  console.error("Uso: node scripts/enfileirar.mjs <cliente> <caminho/do/plano.json> [--sem-push]");
  console.error("Clientes:", Object.keys(clientes()).join(", "));
  process.exit(1);
}

const git = (...a) => execFileSync("git", a, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();
// O Actions grava o estado no repositório; puxa antes para não dar conflito no push
if (!semPush) git("pull", "--rebase", "--autostash");

const plano = JSON.parse(fs.readFileSync(planoPath, "utf8"));
const dirPlano = path.dirname(planoPath);
const pastaMidia = path.posix.join("midia", nome, plano.semana ?? path.basename(dirPlano));
const fila = lerJson(arquivoFila(nome), { posts: [] });
const estado = lerJson(arquivoEstado(nome), {});

let novos = 0;
for (const post of plano.posts) {
  if (estado[post.id]?.status === "publicado") {
    console.log("já publicado, mantido:", post.id);
    continue;
  }
  const origem = path.join(dirPlano, `${post.id}.jpg`);
  if (!fs.existsSync(origem)) throw new Error(`Falta renderizar ${origem}`);
  const midia = `${pastaMidia}/${post.id}.jpg`;
  fs.mkdirSync(path.join(RAIZ, pastaMidia), { recursive: true });
  fs.copyFileSync(origem, path.join(RAIZ, midia));

  const item = { id: post.id, data: comOffset(post.data, cfg.fuso), tipo: post.tipo, midia };
  if (post.tipo !== "STORY" && post.legenda) item.legenda = post.legenda;
  const i = fila.posts.findIndex((p) => p.id === post.id);
  if (i >= 0) fila.posts[i] = item;
  else fila.posts.push(item);
  // Reenfileirar uma arte que falhou zera as tentativas
  if (estado[post.id]) delete estado[post.id];
  novos++;
  console.log("na fila:", item.data, item.tipo, post.id);
}
fila.posts.sort((a, b) => new Date(a.data) - new Date(b.data));
salvarJson(arquivoFila(nome), fila);
salvarJson(arquivoEstado(nome), estado);

if (semPush) {
  console.log(`${novos} posts na fila (sem push).`);
} else {
  git("add", "fila", "estado", "midia");
  if (git("status", "--porcelain", "fila", "estado", "midia")) {
    git("commit", "-m", `fila ${nome}: ${plano.semana ?? path.basename(dirPlano)} (${novos} posts)`);
    git("push");
  }
  console.log(`${novos} posts na fila e enviados ao GitHub.`);
}
