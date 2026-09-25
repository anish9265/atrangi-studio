export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const { slug } = req.query;

    if (!slug) {
      return res.status(400).json({
        error: "Slug is required"
      });
    }

    const rawUrl = process.env.SUPABASE_URL;

    if (!rawUrl) {
      return res.status(500).json({
        error: "SUPABASE_URL is missing"
      });
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
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`
      }
    });

    const responseText = await response.text();

    if (!response.ok) {
      console.error("Supabase URL:", url);
      console.error("Supabase error:", responseText);

return res.status(500).json({
  error: "Database request failed"
});
    }

    const businesses = JSON.parse(responseText);

    if (!businesses.length) {
return res.status(404).json({
  error: "Business not found"
});
    }

    return res.status(200).json(businesses[0]);

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Something went wrong",
      details: error.message
    });
  }
}
