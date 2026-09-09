# Freebuf RSS 中转

> **2026-09-09 更新：本仓库已降级为兜底方案。**
> 当前主力是借第三方 NewsNow 实例当上游（`https://newsnow.busiyi.world/api/s?id=freebuf`，
> 实测能拿到真实数据，见 `server/sources/freebuf.ts` 的 `fetchUpstream`），
> 不依赖任何设备开机，也不需要先建仓库。
> 本仓库只在 `FB_RELAY` 配置了之后才会被用到。下面的内容仍然有效，作为上游挂掉时的后备。

## 为什么需要这个

Freebuf 的 CDN 是 `c.yundunwaf.com`（创宇盾 WAF），它**按 ASN 封禁了 Cloudflare 的出口 IP 段**。
部署在 Cloudflare Pages 的 NewsNow 直连 `https://www.freebuf.com/feed` 必然返回 **405**，
实测以下方式全部无效：换 User-Agent（含 Googlebot/Baiduspider）、带 Referer、换路径、
HTTP 而非 HTTPS、换 Cloudflare 数据中心。

**但同一个城市的非 Cloudflare IP 可以正常访问**（实测 AWS 俄勒冈出口 200，CF 同地区出口 405），
所以只要出口不是 Cloudflare 就行。GitHub Actions 的 runner 是 Azure IP，可以访问。

本仓库的作用：定时（每 10 分钟）抓取 Freebuf RSS → 转成 JSON → 提交回仓库。
NewsNow 的 Worker 再从 `raw.githubusercontent.com` 读这个 JSON，绕过封禁。
读取顺序为 raw → github/raw → jsDelivr 兜底，并在 Worker 进程内缓存 60 秒。

## 部署步骤

1. 在 GitHub 新建**空仓库**（建议命名 `freebuf-relay`，Public，不要勾 README）

2. 把本目录内容推上去（用 **HTTPS**，本机没配 SSH key，走 `git@` 会 publickey denied；
   首次 push 会弹浏览器让你登录 GitHub）：

```bash
cd /Users/tangcm/WorkBuddy/2026-08-17-16-10-45/newsnow/freebuf-relay
git remote add origin https://github.com/<你的用户名>/freebuf-relay.git
git push -u origin main
```

> 如果浏览器没弹出来、直接报认证失败，就用网页端：仓库页面 → Add file → Create new file，
> 文件名填 `.github/workflows/fetch.yml` 粘贴对应内容，再 Add file → Upload files 拖入 `fetch.mjs`。

3. 进仓库 → **Actions** 页 → 若提示 "Workflows aren't being run on this fork/enable" 点 **Enable**
   → 右上角手动跑一次 **Fetch Freebuf RSS** → 确认生成了 `freebuf.json`

4. 回到 NewsNow，配置环境变量并重新部署：

```bash
cd /path/to/newsnow
# 在 wrangler.toml 的 [vars] 里加（或写入 Pages 环境变量）：
#   FB_RELAY = "<你的用户名>/freebuf-relay"
./deploy-cf.sh
```

之后 NewsNow 的 Freebuf 源就会走中转，数据延迟 ≤ 30 分钟。

## 注意

- GitHub 对长期无 commit 的仓库会**停用 scheduled workflow**（约 60 天）。
  但本仓库每次抓取成功都会 commit，所以只要有内容更新就会保持活跃。
- 若 Actions 从未成功、`freebuf.json` 不存在，NewsNow 会回退到直连并拿到空列表（不会报错）。
