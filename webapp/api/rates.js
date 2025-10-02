// webapp/api/rates.js
// Работает как Edge Function (Request -> Response)
export const config = { runtime: "edge" };

const jfetch = async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
};
const tfetch = async (url) => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
};

const fx = async (base, symbols) => {
  const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(
    base
  )}&symbols=${encodeURIComponent(symbols.join(","))}`;
  return jfetch(url); // { rates: {...}, date: 'YYYY-MM-DD' }
};

const yahooClose = async (ticker) => {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker
  )}?range=1d&interval=1d`;
  const j = await jfetch(url);
  const res = j?.chart?.result?.[0];
  return res?.indicators?.quote?.[0]?.close?.at(-1) ?? null;
};
const stooqClose = async (symbol) => {
  const text = await tfetch(
    `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&i=d`
  );
  const line = text.trim().split("\n").at(-1);
  const close = parseFloat(line.split(",")[6]);
  return Number.isFinite(close) ? close : null;
};

export default async function handler() {
  try {
    // 1) Фиат
    const [fxUsd, fxEur, fxCny] = await Promise.all([
      fx("USD", ["RUB", "EUR", "JPY"]),
      fx("EUR", ["RUB"]),
      fx("CNY", ["RUB"]),
    ]);
    const USD_RUB = fxUsd?.rates?.RUB ?? null;

    // 2) Крипта
    const cg = await jfetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd,rub"
    );
    const BTC_USD = cg?.bitcoin?.usd ?? null;
    const ETH_USD = cg?.ethereum?.usd ?? null;
    const USDT_RUB = cg?.tether?.rub ?? null;

    // 3) Индекс и нефть (Yahoo → Stooq)
    let SPX_USD = null;
    try {
      SPX_USD = await yahooClose("^GSPC");
    } catch {}
    if (SPX_USD == null) {
      try {
        SPX_USD = await stooqClose("^spx");
      } catch {}
    }

    let BRENT_USD = null;
    try {
      BRENT_USD = await yahooClose("BZ=F");
    } catch {}
    if (BRENT_USD == null) {
      try {
        BRENT_USD = await stooqClose("brn.f");
      } catch {}
    }

    const BRENT_RUB =
      BRENT_USD != null && USD_RUB != null ? BRENT_USD * USD_RUB : null;

    const pairs = {
      "USD/RUB": USD_RUB,
      "EUR/RUB": fxEur?.rates?.RUB ?? null,
      "CNY/RUB": fxCny?.rates?.RUB ?? null,
      "USD/EUR": fxUsd?.rates?.EUR ?? null,
      "USD/JPY": fxUsd?.rates?.JPY ?? null,
      "S&P500/USD": SPX_USD,
      "BTC/USD": BTC_USD,
      "ETH/USD": ETH_USD,
      "USDT/RUB": USDT_RUB,
      "Brent/RUB": BRENT_RUB,
    };

    return new Response(
      JSON.stringify({ ok: true, updated: Date.now(), pairs }),
      {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
        status: 200,
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
      status: 200,
    });
  }
}
