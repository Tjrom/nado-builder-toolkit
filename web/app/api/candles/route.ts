import { NextResponse } from "next/server";

const ARCHIVE_TEST = "https://archive.test.nado.xyz/v1";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = Number(searchParams.get("productId") ?? "1");
  const granularity = Number(searchParams.get("granularity") ?? "60");
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "10")));

  if (!Number.isFinite(productId) || !Number.isFinite(granularity)) {
    return NextResponse.json({ error: "Invalid productId or granularity" }, { status: 400 });
  }

  try {
    const res = await fetch(ARCHIVE_TEST, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Encoding": "gzip, br, deflate"
      },
      body: JSON.stringify({
        candlesticks: { product_id: productId, granularity, limit }
      }),
      next: { revalidate: 0 }
    });
    const json = await res.json();
    if (json?.blocked) {
      return NextResponse.json(
        { error: "Archive is temporarily unreachable from this server (IP blocked at the edge)." },
        { status: 503 }
      );
    }
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
