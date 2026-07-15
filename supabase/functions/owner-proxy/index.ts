import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUMMARY_URL = "https://n8n.mkindustrials.com/webhook-test/owner/summary";
const SET_PRICE_URL = "https://n8n.mkindustrials.com/webhook-test/owner/set-price";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/owner-proxy/, "");

  try {
    if (path === "/summary" || path === "/summary/") {
      // Try GET first, then POST
      let upstream: Response;
      try {
        upstream = await fetch(SUMMARY_URL, { method: "GET" });
      } catch {
        upstream = await fetch(SUMMARY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
      }
      const data = await upstream.json();
      return new Response(JSON.stringify(data), {
        status: upstream.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (path === "/set-price" || path === "/set-price/") {
      const body = await req.json();
      const upstream = await fetch(SET_PRICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await upstream.text();
      return new Response(data, {
        status: upstream.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown path" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "proxy error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
