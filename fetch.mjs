// 抓取 Freebuf RSS 并转成 NewsNow 可直接消费的 JSON
// 零依赖，在 GitHub Actions（node 20）中直接运行
import { writeFileSync } from "node:fs"

const FEED = "https://www.freebuf.com/feed"
const OUT = "freebuf.json"

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

function decode(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"))
  return m ? decode(m[1]) : ""
}

async function main() {
  const res = await fetch(FEED, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/rss+xml,application/xml,text/xml,*/*",
    },
  })

  if (!res.ok) throw new Error(`feed returned ${res.status}`)

  const xml = await res.text()
  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || []

  const items = blocks.map((b) => {
    const title = pick(b, "title")
    const url = pick(b, "link")
    const description = pick(b, "description")
    const pubDate = pick(b, "pubDate")
    const guid = pick(b, "guid")
    return {
      id: guid || url,
      title,
      url,
      pubDate: pubDate || undefined,
      extra: { hover: description.slice(0, 200) },
    }
  }).filter(i => i.id && i.title && i.url)

  if (items.length === 0) throw new Error("parsed 0 items, feed format may have changed")

  writeFileSync(OUT, `${JSON.stringify({ updatedAt: Date.now(), items }, null, 2)}\n`)
  console.log(`OK: ${items.length} items, first = ${items[0].title}`)
}

main().catch((e) => {
  console.error("FAILED:", e.message)
  process.exit(1)
})
