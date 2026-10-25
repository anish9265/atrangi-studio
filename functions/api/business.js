export async function onRequestGet(context) {
  const { request, env } = context;

  const jsonResponse = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" }
    });

  try {
    const slug = new URL(request.url).searchParams.get("slug");

    if (!slug) {
      return jsonResponse({ error: "Slug is required" }, 400);
    }

    const rawUrl = env.SUPABASE_URL;

    if (!rawUrl) {
      return jsonResponse({ error: "SUPABASE_URL is missing" }, 500);
    }

    const baseUrl = rawUrl
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/rest\/v1$/, "");

    const supabaseUrl = `${baseUrl}/rest/v1`;

    const url =
      `${supabaseUrl}/businesses` +
      `?slug=eq.${encodeURIComponent(slug)}` +
      `&active=eq.true` +
      `&select=*` +
      `&limit=1`;

    const response = await fetch(url, {
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`
      }
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("Supabase error:", responseText);
      return jsonResponse({ error: "Database request failed" }, 500);
    }

    const businesses = JSON.parse(responseText);

    if (!businesses.length) {
      return jsonResponse({ error: "Business not found" }, 404);
    }

    return jsonResponse(businesses[0]);

  } catch (error) {
    console.error("Server error:", error);
    return jsonResponse({ error: "Something went wrong" }, 500);
  }
}
