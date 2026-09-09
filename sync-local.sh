#!/usr/bin/env bash
# 抓 Freebuf RSS -> 直接灌进 Cloudflare D1 的 cache 表
#
# 为什么这么做：
#   Freebuf 的 CDN（c.yundunwaf.com）按 ASN 封了 Cloudflare 出口 IP，
#   部署在 CF Pages 上的 Worker 自己抓必然 405。但本机（非 CF 出口）能正常抓到。
#   写进 cache 表后，只要 cache.updated 在 sources.freebuf.interval（10 分钟）内，
#   Worker 会直接返回这份缓存，包括 ?latest=1 的刷新请求，卡片就有内容了。
#
# 用法: ./freebuf-relay/sync-local.sh
set -euo pipefail
cd "$(dirname "$0")/.."

NODE="/Users/tangcm/.workbuddy/binaries/node/versions/22.22.2-2/bin/node"

# WorkBuddy 注入的 NODE_OPTIONS 会加载 FS 代理 shim；本地代理会让 wrangler 调 D1 API 失败
unset NODE_OPTIONS PYTHONPATH
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
export WRANGLER_SEND_METRICS=false
# 非交互环境（launchd / cron）下 wrangler 不会去猜用哪个账号，必须显式给出
export CLOUDFLARE_ACCOUNT_ID="bf8afe30def0e07ad39d4a9f7ec6d10b"

echo "[$(date '+%F %T')] fetch freebuf feed"
"${NODE}" freebuf-relay/fetch.mjs
"${NODE}" freebuf-relay/gen-sql.mjs /tmp/freebuf-d1.sql

echo "[$(date '+%F %T')] write to D1"
./node_modules/.bin/wrangler d1 execute newsnow-db --remote --file /tmp/freebuf-d1.sql --yes

echo "[$(date '+%F %T')] done"
