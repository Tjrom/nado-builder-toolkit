"use client";

import { useCallback, useState } from "react";

type Candle = {
  product_id?: number;
  granularity?: number;
  timestamp?: string;
  open_x18?: string;
  high_x18?: string;
  low_x18?: string;
  close_x18?: string;
  volume?: string;
};

export default function HomePage() {
  const [contractsJson, setContractsJson] = useState<string | null>(null);
  const [contractsErr, setContractsErr] = useState<string | null>(null);
  const [contractsLoading, setContractsLoading] = useState(false);

  const [productId, setProductId] = useState("1");
  const [granularity, setGranularity] = useState("60");
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [candlesErr, setCandlesErr] = useState<string | null>(null);
  const [candlesLoading, setCandlesLoading] = useState(false);

  const fetchContracts = useCallback(async () => {
    setContractsLoading(true);
    setContractsErr(null);
    setContractsJson(null);
    try {
      const res = await fetch("/api/contracts");
      const data = await res.json();
      if (!res.ok) {
        setContractsErr(data?.error ?? `Error ${res.status}`);
        return;
      }
      setContractsJson(JSON.stringify(data, null, 2));
    } catch (e) {
      setContractsErr(String(e));
    } finally {
      setContractsLoading(false);
    }
  }, []);

  const fetchCandles = useCallback(async () => {
    setCandlesLoading(true);
    setCandlesErr(null);
    setCandles(null);
    try {
      const q = new URLSearchParams({
        productId,
        granularity,
        limit: "12"
      });
      const res = await fetch(`/api/candles?${q}`);
      const data = await res.json();
      if (!res.ok) {
        setCandlesErr(data?.error ?? `Error ${res.status}`);
        return;
      }
      const list = Array.isArray(data?.candlesticks) ? data.candlesticks : [];
      setCandles(list);
    } catch (e) {
      setCandlesErr(String(e));
    } finally {
      setCandlesLoading(false);
    }
  }, [productId, granularity]);

  return (
    <main>
      <h1>Nado — overview for everyone</h1>
      <p className="lead">
        No install required: verify that <strong>Nado testnet</strong> responds and browse the latest candles. Requests
        go through this site (server-side), so <strong>wallet keys are not needed</strong>.
      </p>

      <div className="card">
        <h2>1. Check network connectivity</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Gateway query: contracts + chain id (per Nado docs).
        </p>
        <button type="button" onClick={fetchContracts} disabled={contractsLoading}>
          {contractsLoading ? "Loading…" : "Check"}
        </button>
        {contractsErr && <div className="err">{contractsErr}</div>}
        {contractsJson && !contractsErr && <div className="ok">OK</div>}
        {contractsJson && <pre>{contractsJson}</pre>}
      </div>

      <div className="card">
        <h2>2. Latest candles (archive)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Prices are returned in x18 format (value × 10¹⁸). Default product is <code>1</code>; change it if you know the
          id.
        </p>
        <div className="row">
          <div>
            <label htmlFor="pid">Product ID</label>
            <input id="pid" value={productId} onChange={(e) => setProductId(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <label htmlFor="gran">Interval (seconds)</label>
            <select id="gran" value={granularity} onChange={(e) => setGranularity(e.target.value)}>
              <option value="60">1 min (60)</option>
              <option value="300">5 min (300)</option>
              <option value="3600">1 hour (3600)</option>
            </select>
          </div>
          <button type="button" onClick={fetchCandles} disabled={candlesLoading}>
            {candlesLoading ? "Loading…" : "Show"}
          </button>
        </div>
        {candlesErr && <div className="err">{candlesErr}</div>}
        {candles && candles.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Time (unix)</th>
                <th>Open x18</th>
                <th>High x18</th>
                <th>Low x18</th>
                <th>Close x18</th>
              </tr>
            </thead>
            <tbody>
              {candles.map((c, i) => (
                <tr key={`${c.timestamp}-${i}`}>
                  <td>{c.timestamp}</td>
                  <td>{c.open_x18?.slice(0, 12)}…</td>
                  <td>{c.high_x18?.slice(0, 12)}…</td>
                  <td>{c.low_x18?.slice(0, 12)}…</td>
                  <td>{c.close_x18?.slice(0, 12)}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {candles && candles.length === 0 && <p className="muted">Empty response (try another product id).</p>}
      </div>

      <p className="muted">
        For trading and signatures you still need the{" "}
        <a href="https://github.com/Tjrom/nado-builder-toolkit">CLI / SDK</a> on your own machine. Docs:{" "}
        <a href="https://docs.nado.xyz/developer-resources/api">Nado API</a>.
      </p>

      <footer>
        Open source:{" "}
        <a href="https://github.com/Tjrom/nado-builder-toolkit">nado-builder-toolkit</a>. Data: Nado testnet.
      </footer>
    </main>
  );
}
