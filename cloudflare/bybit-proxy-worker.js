/**
 * Cloudflare Worker relay untuk Bybit API.
 * Deploy gratis di https://workers.cloudflare.com — 100k request/hari.
 *
 * Setup:
 * 1. Login dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. Paste seluruh kode ini → Deploy
 * 3. Salin URL worker, misal: https://bybit-relay.<username>.workers.dev
 * 4. Di Vercel: Settings → Environment Variables → tambah:
 *      BYBIT_PROXY_URL = https://bybit-relay.<username>.workers.dev
 * 5. Redeploy aplikasi.
 */

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url)
    const target = reqUrl.searchParams.get("url")
    if (!target || !target.startsWith("https://api.bybit")) {
      return new Response("Bad request", { status: 400 })
    }

    // Teruskan header signing (X-BAPI-*) apa adanya ke Bybit
    const headers = new Headers()
    for (const name of ["X-BAPI-API-KEY", "X-BAPI-SIGN", "X-BAPI-TIMESTAMP", "X-BAPI-RECV-WINDOW"]) {
      const val = request.headers.get(name)
      if (val) headers.set(name, val)
    }

    try {
      const res = await fetch(target, { method: "GET", headers })
      return new Response(res.body, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      })
    } catch (e) {
      return new Response(JSON.stringify({ proxyError: String(e) }), { status: 502 })
    }
  },
}
