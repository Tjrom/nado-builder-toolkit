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
        setContractsErr(data?.error ?? `Ошибка ${res.status}`);
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
        setCandlesErr(data?.error ?? `Ошибка ${res.status}`);
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
      <h1>Nado — обзор для всех</h1>
      <p className="lead">
        Без установки программ: проверяем, что <strong>testnet Nado</strong> отвечает, и смотрим последние свечи. Данные
        идут через этот сайт (сервер), поэтому ключи кошелька <strong>не нужны</strong>.
      </p>

      <div className="card">
        <h2>1. Проверить подключение к сети</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Запрос к шлюзу: контракты и chain id (как в документации Nado).
        </p>
        <button type="button" onClick={fetchContracts} disabled={contractsLoading}>
          {contractsLoading ? "Загрузка…" : "Проверить"}
        </button>
        {contractsErr && <div className="err">{contractsErr}</div>}
        {contractsJson && !contractsErr && <div className="ok">Готово</div>}
        {contractsJson && <pre>{contractsJson}</pre>}
      </div>

      <div className="card">
        <h2>2. Последние свечи (архив)</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Цены в ответе в формате x18 (число × 10¹⁸). Продукт по умолчанию — <code>1</code>; можно сменить, если знаете
          id.
        </p>
        <div className="row">
          <div>
            <label htmlFor="pid">Product ID</label>
            <input id="pid" value={productId} onChange={(e) => setProductId(e.target.value)} inputMode="numeric" />
          </div>
          <div>
            <label htmlFor="gran">Интервал (сек)</label>
            <select id="gran" value={granularity} onChange={(e) => setGranularity(e.target.value)}>
              <option value="60">1 мин (60)</option>
              <option value="300">5 мин (300)</option>
              <option value="3600">1 час (3600)</option>
            </select>
          </div>
          <button type="button" onClick={fetchCandles} disabled={candlesLoading}>
            {candlesLoading ? "Загрузка…" : "Показать"}
          </button>
        </div>
        {candlesErr && <div className="err">{candlesErr}</div>}
        {candles && candles.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Время (unix)</th>
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
        {candles && candles.length === 0 && <p className="muted">Пустой ответ (проверьте product id).</p>}
      </div>

      <p className="muted">
        Для торговли и подписей по-прежнему нужен{" "}
        <a href="https://github.com/Tjrom/nado-builder-toolkit">CLI / SDK</a> на своём компьютере. Документация:{" "}
        <a href="https://docs.nado.xyz/developer-resources/api">Nado API</a>.
      </p>

      <footer>
        Открытый код — репозиторий{" "}
        <a href="https://github.com/Tjrom/nado-builder-toolkit">nado-builder-toolkit</a>. Данные: Nado testnet.
      </footer>
    </main>
  );
}
