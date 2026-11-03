import { readFileSync } from "node:fs";
import { importPacket } from "../src/lib/packet/import";
import { packetPath } from "../src/lib/packet/load";
import { prisma } from "../src/lib/db";

async function main() {
  const buf = readFileSync(packetPath());
  console.log(`Importing ${packetPath()} (${(buf.length / 1024 / 1024).toFixed(2)} MB)…`);
  const report = await importPacket(buf);
  if (!report.imported) {
    console.log(`Already imported (sha ${report.sha256.slice(0, 12)}…). No-op.`);
  } else {
    console.log("Imported:", JSON.stringify(report.counts, null, 2));
    console.log(`Unresolved references: ${report.unresolvedRefs.length}`);
    for (const u of report.unresolvedRefs.slice(0, 20)) {
      console.log(`  - ${u.raw} @ ${u.where} (${u.error ?? "unresolved"})`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
