import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

// Dev-only helper: receives the exported ZIP blob from the browser and writes it
// to disk so the bundle can be retrieved without relying on browser downloads.
export async function POST(req: NextRequest) {
  const buf = Buffer.from(await req.arrayBuffer());
  const outDir = path.join(process.cwd(), "export");
  await fs.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "tankuj100-appstore.zip");
  await fs.writeFile(outFile, buf);
  return NextResponse.json({ ok: true, bytes: buf.length, file: outFile });
}
