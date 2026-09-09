// 抓取 Freebuf RSS 并转成 NewsNow 可直接消费的 JSON
// 零依赖，在 GitHub Actions（node 20）中直接运行
import { readFileSync, writeFileSync } from "node:fs"

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

// 创宇盾偶尔会抽风（偶发 405），重试几次；间隔递增，避免都落在同一个拦截窗口里
async function fetchFeed() {
  let lastErr
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(FEED, {
        headers: {
          "User-Agent": UA,
          "Accept": "application/rss+xml,application/xml,text/xml,*/*",
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
      })
      if (!res.ok) throw new Error(`feed returned ${res.status}`)
      const xml = await res.text()
      if (!xml.includes("<item")) throw new Error("response has no <item>, likely blocked")
      return xml
    } catch (e) {
      lastErr = e
      if (i < 3) await new Promise(r => setTimeout(r, (i + 1) * 2000))
    }
  }
  throw lastErr
}

async function main() {
  const xml = await fetchFeed()
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

  // 内容没变就不写文件：否则每 10 分钟一次空 commit，历史会被刷爆
// （Freebuf 本身每天都有新文章，所以仍然会有 commit，足以避免 GitHub 停用 scheduled workflow）
let prev = null
try {
  prev = JSON.parse(readFileSync(OUT, "utf8"))
} catch {
  // 首次运行没有旧文件
}
const same = prev?.items && JSON.stringify(prev.items.map(i => i.id)) === JSON.stringify(items.map(i => i.id))
if (same) {
  console.log(`unchanged: ${items.length} items, skip write`)
  return
}

writeFileSync(OUT, `${JSON.stringify({ updatedAt: Date.now(), items }, null, 2)}\n`)
  console.log(`OK: ${items.length} items, first = ${items[0].title}`)
}

main().catch((e) => {
  console.error("FAILED:", e.message)
  process.exit(1)
})
