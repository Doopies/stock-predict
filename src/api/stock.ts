export type StockPoint = {
  date: string;
  close: number;
};

const API_KEY = "H2G3AT2MWZYP9CKU";

export async function fetchRealStock(symbol: string): Promise<StockPoint[]> {
  const upperSymbol = symbol.toUpperCase().trim();

  const res = await fetch(
    `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${upperSymbol}&outputsize=compact&apikey=${API_KEY}`
  );

  if (!res.ok) {
    throw new Error("请求失败");
  }

  const data = await res.json();
  const raw = data["Time Series (Daily)"];

  if (!raw) {
    throw new Error(data?.Note || data?.Information || data?.ErrorMessage || "无数据");
  }

  return Object.keys(raw)
    .slice(0, 100)
    .reverse()
    .map((date) => ({
      date,
      close: Number(raw[date]["4. close"]),
    }));
}