// webapp/api/rates.js
// CommonJS для Vercel в статическом проекте
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

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

  try {
    // --- FIAT
    const fx = async (base, symbols) => {
      const url = `https://api.exchangerate.host/latest?base=${encodeURIComponent(
        base
      )}&symbols=${encodeURIComponent(symbols.join(","))}`;
      return jfetch(url);
    };

    const [fxUsd, fxEur, fxCny] = await Promise.all([
      fx("USD", ["RUB", "EUR", "JPY"]),
      fx("EUR", ["RUB"]),
      fx("CNY", ["RUB"]),
    ]);
    const USD_RUB = fxUsd?.rates?.RUB ?? null;

    // --- CRYPTO
    const cg = await jfetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,tether&vs_currencies=usd,rub"
    );
    const BTC_USD = cg?.bitcoin?.usd ?? null;
    const ETH_USD = cg?.ethereum?.usd ?? null;
    const USDT_RUB = cg?.tether?.rub ?? null;

    // --- Index / Commodities
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
      const lastLine = text.trim().split("\n").at(-1);
      const parts = lastLine.split(",");
      const close = parseFloat(parts[6]);
      return Number.isFinite(close) ? close : null;
    };

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

    res.status(200).json({ ok: true, updated: Date.now(), pairs });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
};
