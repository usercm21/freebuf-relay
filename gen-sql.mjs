// 把 freebuf.json 转成可直接灌进 D1 cache 表的 SQL
// 用法: node gen-sql.mjs [输出文件]  默认 /tmp/freebuf-d1.sql
import { readFileSync, writeFileSync } from "node:fs"

const OUT = process.argv[2] || "/tmp/freebuf-d1.sql"
const RAW = new URL("./freebuf.json", import.meta.url)

const data = JSON.parse(readFileSync(RAW, "utf8"))
if (!Array.isArray(data.items) || data.items.length === 0) {
  console.error("freebuf.json 里没有 items，拒绝生成 SQL")
  process.exit(1)
}

const items = data.items.slice(0, 30)
const payload = JSON.stringify(items).replace(/'/g, "''")
const updated = Date.now()

writeFileSync(OUT, `INSERT OR REPLACE INTO cache (id, data, updated) VALUES ('freebuf', '${payload}', ${updated});\n`)
console.log(`SQL -> ${OUT} (${items.length} items, ${Math.round(payload.length / 1024)}KB)`)
