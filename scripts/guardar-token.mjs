// Pede o token do Instagram de um cliente (sem mostrar na tela), confere a conta e guarda no .env e nos secrets do GitHub.
// Uso: node scripts/guardar-token.mjs <cliente>
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { RAIZ, clientes, conta } from "./lib.mjs";

const nome = process.argv[2];
const cfg = clientes()[nome];
if (!cfg) {
  console.error("Uso: node scripts/guardar-token.mjs <cliente>   Clientes:", Object.keys(clientes()).join(", "));
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
const pergunta = `Cole o token do Instagram de ${cfg.nome} (Ctrl+V) e aperte Enter: `;
process.stdout.write(pergunta);
rl._writeToOutput = () => {}; // esconde o que é colado
const token = (await new Promise((r) => rl.once("line", r))).trim();
rl.close();
process.stdout.write("\n");

process.env[cfg.segredoToken] = token;
try {
  const { username } = await conta(nome, cfg);
  console.log(`✓ Token válido: @${username}`);
} catch (e) {
  console.error(`✗ Token não serviu: ${e.message}`);
  process.exit(1);
}

const envPath = path.join(RAIZ, ".env");
const linhas = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith(`${cfg.segredoToken}=`)) : [];
fs.writeFileSync(envPath, [...linhas, `${cfg.segredoToken}=${token}`].join("\n") + "\n");
execFileSync("gh", ["secret", "set", cfg.segredoToken], { cwd: RAIZ, input: token, stdio: ["pipe", "ignore", "inherit"] });
console.log(`✓ Guardado no .env e no secret ${cfg.segredoToken} do GitHub.`);
