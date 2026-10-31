// Renova o token de 60 dias de cada cliente e grava o novo nos secrets do GitHub (gh secret set).
// Roda toda semana pelo Actions (precisa do secret GH_PAT) ou no PC: node scripts/renovar-token.mjs [--cliente elohim]
import { execFileSync } from "node:child_process";
import { RAIZ, clientes, graph, segredo } from "./lib.mjs";

const soCliente = process.argv.includes("--cliente") ? process.argv[process.argv.indexOf("--cliente") + 1] : undefined;
let falhas = 0;

for (const [nome, cfg] of Object.entries(clientes())) {
  if (soCliente && nome !== soCliente) continue;
  const token = segredo(cfg.segredoToken);
  if (!token) {
    console.error(`✗ ${nome}: falta o segredo ${cfg.segredoToken}`);
    falhas++;
    continue;
  }
  try {
    const novo = await graph("GET", "refresh_access_token", { grant_type: "ig_refresh_token" }, token);
    // O token vai pela entrada padrão, nunca pela linha de comando nem pelo log
    execFileSync("gh", ["secret", "set", cfg.segredoToken], { cwd: RAIZ, input: novo.access_token, stdio: ["pipe", "ignore", "inherit"] });
    const vence = new Date(Date.now() + novo.expires_in * 1000).toISOString().slice(0, 10);
    console.log(`✓ ${nome}: token renovado, vence em ${vence}`);
  } catch (e) {
    console.error(`✗ ${nome}: ${e.message}`);
    falhas++;
  }
}
if (falhas) process.exit(1);
