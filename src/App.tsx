import React, { useEffect, useMemo, useState } from "react";

type PricePoint = {
  date: string;
  close: number;
  ma7?: number;
  ma30?: number;
  forecast?: number;
  lower?: number;
  upper?: number;
  type: "history" | "forecast";
};

type TimeRange = "1M" | "3M" | "6M" | "1Y";

const DEFAULT_TICKER = "AAPL";
const RANGE_OPTIONS: TimeRange[] = ["1M", "3M", "6M", "1Y"];
const STOCK_SUGGESTIONS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "META", "GOOGL", "NFLX"];

function round(num: number, digits = 2) {
  return Number(num.toFixed(digits));
}

function movingAverage(data: number[], window: number) {
  return data.map((_, idx) => {
    if (idx < window - 1) return undefined;
    const slice = data.slice(idx - window + 1, idx + 1);
    return round(slice.reduce((a, b) => a + b, 0) / window);
  });
}

function linearRegressionForecast(values: number[], steps: number) {
  const n = values.length;
  const xs = Array.from({ length: n }, (_, i) => i + 1);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = values.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - meanX) * (values[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }

  const slope = denominator === 0 ? 0 : numerator / denominator;
  const intercept = meanY - slope * meanX;

  return Array.from({ length: steps }, (_, i) => {
    const x = n + i + 1;
    const predicted = intercept + slope * x;
    const band = 3 + i * 0.5;
    return {
      value: round(predicted),
      lower: round(predicted - band),
      upper: round(predicted + band),
    };
  });
}

function generateMockSeries(ticker: string) {
  const today = new Date();
  const seed = ticker
    .toUpperCase()
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

  const totalDays = 260;
  let price = 80 + (seed % 120);
  const series: { date: string; close: number }[] = [];

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const drift = Math.sin((totalDays - i + seed) / 12) * 1.1;
    const noise = ((seed * (i + 3)) % 11 - 5) * 0.35;
    const momentum = (seed % 2 === 0 ? 0.18 : -0.02) + ((seed % 7) - 3) * 0.01;
    price = Math.max(10, price + drift + noise + momentum);
    series.push({
      date: d.toISOString().slice(0, 10),
      close: round(price),
    });
  }

  return series;
}

function buildChartData(series: { date: string; close: number }[]) {
  const closes = series.map((d) => d.close);
  const ma7 = movingAverage(closes, 7);
  const ma30 = movingAverage(closes, 30);

  const history: PricePoint[] = series.map((item, idx) => ({
    date: item.date,
    close: item.close,
    ma7: ma7[idx],
    ma30: ma30[idx],
    type: "history",
  }));

  const predictions = linearRegressionForecast(closes.slice(-45), 14);
  const lastDate = new Date(series[series.length - 1].date);

  const future: PricePoint[] = predictions.map((item, idx) => {
    const nextDate = new Date(lastDate);
    nextDate.setDate(lastDate.getDate() + idx + 1);
    return {
      date: nextDate.toISOString().slice(0, 10),
      close: NaN,
      forecast: item.value,
      lower: item.lower,
      upper: item.upper,
      type: "forecast",
    };
  });

  return { history, future };
}

function getRangeCount(range: TimeRange, length: number) {
  const map: Record<TimeRange, number> = {
    "1M": 22,
    "3M": 66,
    "6M": 132,
    "1Y": 252,
  };
  return Math.min(map[range], length);
}

function buildInsight(history: PricePoint[]) {
  const latest = history[history.length - 1];
  const prev = history[Math.max(0, history.length - 6)];
  const start = history[0];
  const change5 = prev ? ((latest.close - prev.close) / prev.close) * 100 : 0;
  const changeAll = start ? ((latest.close - start.close) / start.close) * 100 : 0;
  const shortTrend = change5 > 1.5 ? "短期偏强" : change5 < -1.5 ? "短期偏弱" : "短期震荡";
  const longTrend = changeAll > 8 ? "中期上行" : changeAll < -8 ? "中期下行" : "中期震荡";
  return `${shortTrend}，${longTrend}。最近 5 日变动 ${round(change5)}%，当前页面为演示版模拟数据。`;
}

function buildMarketSnapshot(activeTicker: string, lastPrice: number) {
  const base = [
    { ticker: "SPY", name: "S&P 500 ETF" },
    { ticker: "QQQ", name: "Nasdaq 100 ETF" },
    { ticker: "NVDA", name: "NVIDIA" },
    { ticker: "TSLA", name: "Tesla" },
  ];

  return base.map((item, idx) => ({
    ...item,
    price: round(lastPrice * (0.72 + idx * 0.16 + (item.ticker === activeTicker ? 0.08 : 0))),
    change: round(((activeTicker.charCodeAt(0) + idx * 13) % 9) - 4 + idx * 0.4),
  }));
}

function buildLinePath(values: number[], width: number, height: number, padding = 20) {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const usableHeight = height - padding * 2;
  const usableWidth = width - padding * 2;
  return values
    .map((value, index) => {
      const x = padding + (index / Math.max(1, values.length - 1)) * usableWidth;
      const y = padding + (1 - (value - min) / Math.max(1, max - min || 1)) * usableHeight;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

function ChartCard({
  title,
  history,
  future,
}: {
  title: string;
  history: PricePoint[];
  future: PricePoint[];
}) {
  const width = 900;
  const height = 320;
  const historyValues = history.map((d) => d.close);
  const ma7Values = history.map((d) => d.ma7 ?? d.close);
  const ma30Values = history.map((d) => d.ma30 ?? d.close);
  const forecastValues = future.map((d) => d.forecast ?? 0);

  const allValues = [...historyValues, ...forecastValues];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const padding = 20;
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  const historyPath = buildLinePath(historyValues, width * 0.82, height, padding);
  const ma7Path = buildLinePath(ma7Values, width * 0.82, height, padding);
  const ma30Path = buildLinePath(ma30Values, width * 0.82, height, padding);

  const forecastPath = forecastValues
    .map((value, index) => {
      const x = width * 0.82 + (index / Math.max(1, forecastValues.length - 1)) * (width * 0.18 - padding);
      const y = padding + (1 - (value - min) / Math.max(1, max - min || 1)) * usableHeight;
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");

  return (
    <div style={styles.card}>
      <div style={styles.sectionTitle}>{title}</div>
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", minWidth: 600, height: 320, display: "block" }}>
          <rect x="0" y="0" width={width} height={height} fill="#ffffff" rx="16" />
          {[0, 1, 2, 3].map((i) => (
            <line
              key={i}
              x1={20}
              y1={20 + i * 70}
              x2={width - 20}
              y2={20 + i * 70}
              stroke="#e2e8f0"
              strokeDasharray="4 4"
            />
          ))}
          <path d={historyPath} fill="none" stroke="#2563eb" strokeWidth="3" />
          <path d={ma7Path} fill="none" stroke="#10b981" strokeWidth="2" />
          <path d={ma30Path} fill="none" stroke="#f59e0b" strokeWidth="2" />
          <path d={forecastPath} fill="none" stroke="#7c3aed" strokeWidth="3" strokeDasharray="8 6" />
        </svg>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: 13, color: "#475569" }}>
        <span>蓝线：收盘价</span>
        <span>绿线：MA7</span>
        <span>橙线：MA30</span>
        <span>紫线：预测</span>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "linear-gradient(180deg, #eef4ff 0%, #f8fafc 55%, #ffffff 100%)",
    padding: 16,
    color: "#0f172a",
    fontFamily: "Arial, sans-serif",
  } as React.CSSProperties,
  container: {
    maxWidth: 1280,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  } as React.CSSProperties,
  hero: {
    background: "#020617",
    color: "white",
    borderRadius: 24,
    padding: 24,
    boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
  } as React.CSSProperties,
  card: {
    background: "white",
    borderRadius: 24,
    padding: 20,
    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.06)",
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 16,
  } as React.CSSProperties,
  input: {
    width: "100%",
    height: 46,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    padding: "0 14px",
    fontSize: 14,
    boxSizing: "border-box",
  } as React.CSSProperties,
  button: {
    height: 46,
    borderRadius: 14,
    border: "none",
    background: "white",
    color: "#0f172a",
    padding: "0 18px",
    fontWeight: 700,
    cursor: "pointer",
  } as React.CSSProperties,
  chip: {
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.08)",
    color: "white",
    padding: "8px 12px",
    fontSize: 12,
    cursor: "pointer",
  } as React.CSSProperties,
};

export default function StockForecastSimple() {
  const [tickerInput, setTickerInput] = useState(DEFAULT_TICKER);
  const [activeTicker, setActiveTicker] = useState(DEFAULT_TICKER);
  const [selectedRange, setSelectedRange] = useState<TimeRange>("6M");
  const [historyData, setHistoryData] = useState<PricePoint[]>([]);
  const [futureData, setFutureData] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function loadData(ticker: string) {
    try {
      setLoading(true);
      setError("");
      const series = generateMockSeries(ticker);
      const built = buildChartData(series);
      setHistoryData(built.history);
      setFutureData(built.future);
      setActiveTicker(ticker.toUpperCase());
    } catch {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData(DEFAULT_TICKER);
  }, []);

  const shownHistory = useMemo(() => {
    const count = getRangeCount(selectedRange, historyData.length);
    return historyData.slice(-count);
  }, [historyData, selectedRange]);

  const latestHistory = shownHistory[shownHistory.length - 1];
  const firstHistory = shownHistory[0];
  const latestForecast = futureData[futureData.length - 1];
  const rangeChange = latestHistory && firstHistory ? round(((latestHistory.close - firstHistory.close) / firstHistory.close) * 100) : 0;
  const forecastChange = latestHistory && latestForecast?.forecast ? round(((latestForecast.forecast - latestHistory.close) / latestHistory.close) * 100) : 0;
  const insight = shownHistory.length ? buildInsight(shownHistory) : "等待数据加载";
  const marketSnapshot = buildMarketSnapshot(activeTicker, latestHistory?.close || 100);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 900;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.hero}>
          <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 10 }}>Stock Forecast Pro · 演示版</div>
          <h1 style={{ fontSize: isMobile ? 32 : 48, margin: 0, lineHeight: 1.1 }}>股票趋势分析与未来走势推演</h1>
          <p style={{ marginTop: 14, color: "#cbd5e1", lineHeight: 1.7, maxWidth: 800 }}>
            这版只用模拟数据，目的是先保证你本地直接看到完整页面。后面再把真实 API 接进去。
          </p>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.2fr auto", gap: 12, marginTop: 18 }}>
            <div>
              <input
                value={tickerInput}
                onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                placeholder="输入股票代码，例如 AAPL / TSLA / NVDA"
                style={styles.input}
              />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                {STOCK_SUGGESTIONS.map((item) => (
                  <button key={item} style={styles.chip} onClick={() => { setTickerInput(item); loadData(item); }}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button style={styles.button} onClick={() => loadData(tickerInput)}>{loading ? "加载中..." : "开始分析"}</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginTop: 18 }}>
            {[
              ["当前股票", activeTicker],
              ["最新收盘价", latestHistory ? `$${latestHistory.close}` : "--"],
              ["区间涨跌", `${rangeChange}%`],
              ["14天预测变化", `${forecastChange}%`],
            ].map(([label, value]) => (
              <div key={label} style={{ background: "rgba(255,255,255,0.06)", borderRadius: 16, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{label}</div>
                <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.8fr 1fr", gap: 24 }}>
          <ChartCard title="历史趋势与未来预测" history={shownHistory} future={futureData} />

          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={styles.card}>
              <div style={styles.sectionTitle}>AI 风格解读</div>
              <div style={{ background: "#f1f5f9", borderRadius: 16, padding: 16, color: "#475569", lineHeight: 1.7 }}>
                {insight}
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.sectionTitle}>时间范围</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {RANGE_OPTIONS.map((range) => (
                  <button
                    key={range}
                    onClick={() => setSelectedRange(range)}
                    style={{
                      borderRadius: 999,
                      padding: "8px 12px",
                      border: selectedRange === range ? "1px solid #0f172a" : "1px solid #e2e8f0",
                      background: selectedRange === range ? "#0f172a" : "#f8fafc",
                      color: selectedRange === range ? "white" : "#475569",
                      cursor: "pointer",
                    }}
                  >
                    {range}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 24 }}>
          <div style={styles.card}>
            <div style={styles.sectionTitle}>市场快照</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {marketSnapshot.map((item) => (
                <div key={item.ticker} style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 14 }}>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{item.name}</div>
                  <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{item.ticker}</div>
                  <div style={{ marginTop: 10, fontSize: 28, fontWeight: 800 }}>${item.price}</div>
                  <div style={{ marginTop: 4, color: item.change >= 0 ? "#059669" : "#e11d48", fontWeight: 700 }}>
                    {item.change >= 0 ? "+" : ""}{item.change}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.card}>
            <div style={styles.sectionTitle}>下一步产品扩展</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 14, color: "#475569", lineHeight: 1.7 }}>
              <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14 }}>1. 先把这版发布到 Vercel，作为演示站。</div>
              <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14 }}>2. 再接真实股票 API 和后端接口。</div>
              <div style={{ background: "#f8fafc", borderRadius: 16, padding: 14 }}>3. 最后再做提醒、订阅和商业化页面。</div>
            </div>
          </div>
        </div>

        {error ? <div style={{ color: "#dc2626", fontWeight: 700 }}>{error}</div> : null}
      </div>
    </div>
  );
}
