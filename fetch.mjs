// 生成 NewsNow 可直接消费的 freebuf.json
// 零依赖，node 20 直接跑（GitHub Actions）
//
// 为什么不能直接抓 Freebuf：它的 CDN 是创宇盾 WAF，按 ASN 封禁机房出口 IP。
// 实测 Cloudflare 405、GitHub Actions 的 Azure 出口同样 405
// （别信"换台机器就能抓"这种想当然，AWS 能通只是运气）。
// 所以主路是从一个能通的上游 NewsNow 实例拿，直连只作为上游也没了时的最后尝试。
import { readFileSync, writeFileSync } from "node:fs"

const UPSTREAM = (process.env.FB_UPSTREAM || "https://newsnow.busiyi.world").replace(/\/+$/, "")
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

// 重试间隔递增，避免几次尝试都落在同一个拦截窗口里
async function retry(times, fn) {
  let lastErr
  for (let i = 0; i < times; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i < times - 1) await new Promise(r => setTimeout(r, (i + 1) * 2000))
    }
  }
  throw lastErr
}

async function fromUpstream() {
  const res = await fetch(`${UPSTREAM}/api/s?id=freebuf`, {
    headers: { "User-Agent": UA, "Accept": "application/json" },
  })
  if (!res.ok) throw new Error(`upstream returned ${res.status}`)
  const data = await res.json()
  const items = (data?.items || []).filter(i => i?.id && i?.title && i?.url)
  if (!items.length) throw new Error("upstream returned 0 items")
  return items.map(i => ({
    id: String(i.id),
    title: String(i.title),
    url: String(i.url),
    pubDate: i.pubDate,
    extra: i.extra,
  }))
}

async function fromFeed() {
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

  const blocks = xml.match(/<item>[\s\S]*?<\/item>/g) || []
  const items = blocks.map((b) => {
    const url = pick(b, "link")
    return {
      id: pick(b, "guid") || url,
      title: pick(b, "title"),
      url,
      pubDate: pick(b, "pubDate") || undefined,
      extra: { hover: pick(b, "description").slice(0, 200) },
    }
  }).filter(i => i.id && i.title && i.url)

  if (!items.length) throw new Error("parsed 0 items")
  return items
}

async function main() {
  let items
  try {
    items = await retry(3, fromUpstream)
    console.log("source: upstream")
  } catch (e) {
    console.log(`upstream failed (${e.message}), fallback to direct feed`)
    items = await retry(4, fromFeed)
    console.log("source: direct feed")
  }

  // 内容没变就不写文件，否则每 10 分钟一个空 commit 会把历史刷爆
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
