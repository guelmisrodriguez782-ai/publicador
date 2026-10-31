// Confere cada cliente: token válido, conta certa, uso do limite diário e próximos posts da fila.
// Uso: node scripts/verificar.mjs [--cliente elohim]
import { arquivoEstado, arquivoFila, clientes, conta, graph, lerJson } from "./lib.mjs";

const soCliente = process.argv.includes("--cliente") ? process.argv[process.argv.indexOf("--cliente") + 1] : undefined;
let falhas = 0;

for (const [nome, cfg] of Object.entries(clientes())) {
  if (soCliente && nome !== soCliente) continue;
  try {
    const { token, igId, username } = await conta(nome, cfg);
    const { data } = await graph("GET", `${igId}/content_publishing_limit`, { fields: "quota_usage,config" }, token);
    const uso = data?.[0];
    console.log(`✓ ${nome}: @${username} (id ${igId}), ${uso?.quota_usage ?? "?"}/${uso?.config?.quota_total ?? 100} posts nas últimas 24h`);
  } catch (e) {
    console.error(`✗ ${nome}: ${e.message}`);
    falhas++;
  }
  const estado = lerJson(arquivoEstado(nome), {});
  const proximos = lerJson(arquivoFila(nome), { posts: [] }).posts.filter((p) => !estado[p.id] || estado[p.id].status === "pendente");
  console.log(`  ${proximos.length} na fila${proximos.length ? `, próximo ${proximos[0].data} ${proximos[0].tipo} ${proximos[0].id}` : ""}`);
  for (const [id, r] of Object.entries(estado)) if (["erro", "perdido"].includes(r.status)) console.log(`  ${r.status}: ${id} ${r.erro ?? ""}`);
}
if (falhas) process.exit(1);
