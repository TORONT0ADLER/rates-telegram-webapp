// webapp/api/rates.js
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

// ---- FIAT: primary open.er-api.com, fallback exchangerate.host
async function fxUSD() {
  // 1) primary
  try {
    // DOC: https://open.er-api.com/v6/latest/USD
    const u = "https://open.er-api.com/v6/latest/USD";
    const j = await jfetch(u);
    if (j?.result === "success" && j?.rates) {
      return {
        USD_RUB: j.rates.RUB ?? null,
        USD_EUR: j.rates.EUR ?? null,
        USD_JPY: j.rates.JPY ?? null,
        USD_CNY: j.rates.CNY ?? null,
      };
    }
  } catch (_) {}
  // 2) fallback
  try {
    const u =
      "https://api.exchangerate.host/latest?base=USD&symbols=RUB,EUR,JPY,CNY";
    const j = await jfetch(u); // { rates: {RUB,EUR,JPY,CNY} }
    const r = j?.rates || {};
    return {
      USD_RUB: r.RUB ?? null,
      USD_EUR: r.EUR ?? null,
      USD_JPY: r.JPY ?? null,
      USD_CNY: r.CNY ?? null,
    };
  } catch (_) {}
  return { USD_RUB: null, USD_EUR: null, USD_JPY: null, USD_CNY: null };
}

// ---- Yahoo/Stooq helpers
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
    // 1) FIAT (всё от USD и кросс-курсы)
    const { USD_RUB, USD_EUR, USD_JPY, USD_CNY } = await fxUSD();
    const EUR_RUB =
      USD_RUB != null && USD_EUR != null ? USD_RUB / USD_EUR : null; // RUB per EUR
    const CNY_RUB =
      USD_RUB != null && USD_CNY != null ? USD_RUB / USD_CNY : null; // RUB per CNY
    // Новая пара JPY/RUB
    const JPY_RUB =
      USD_RUB != null && USD_JPY != null ? USD_RUB / USD_JPY : null; // RUB per JPY

    // 2) CRYPTO (CoinGecko)
    let BTC_USD = null,
      ETH_USD = null;
    try {
      const cg = await jfetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd"
      );
      BTC_USD = cg?.bitcoin?.usd ?? null;
      ETH_USD = cg?.ethereum?.usd ?? null;
    } catch (_) {}

    // 3) Индекс S&P500 и Brent (Yahoo → Stooq)
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

    // Собираем пары
    const pairs = {
      "USD/RUB": USD_RUB,
      "EUR/RUB": EUR_RUB,
      "CNY/RUB": CNY_RUB,
      "JPY/RUB": JPY_RUB,     // было USD/JPY, теперь JPY/RUB
      "S&P500/USD": SPX_USD,
      "BTC/USD": BTC_USD,
      "ETH/USD": ETH_USD,
      "Brent/USD": BRENT_USD, // было Brent/RUB, теперь Brent/USD
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
