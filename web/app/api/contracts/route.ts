import { NextResponse } from "next/server";

const GATEWAY_TEST = "https://gateway.test.nado.xyz/v1";

export async function GET() {
  try {
    const url = new URL(`${GATEWAY_TEST}/query`);
    url.searchParams.set("type", "contracts");
    const res = await fetch(url.toString(), {
      headers: { "Accept-Encoding": "gzip, br, deflate" },
      next: { revalidate: 30 }
    });
    const json = await res.json();
    if (json?.blocked) {
      return NextResponse.json(
        { error: "Nado временно недоступен с этого сервера (блок по IP). Откройте сайт с другого хостинга или используйте CLI локально." },
        { status: 503 }
      );
    }
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
