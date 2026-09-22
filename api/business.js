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

    const response = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/businesses?slug=eq.${encodeURIComponent(slug)}&active=eq.true&select=name,slug,google_review_url,category,language&limit=1`,
      {
        headers: {
          apikey: process.env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error("Supabase error:", errorText);

      return res.status(500).json({
        error: "Database request failed"
      });
    }

    const businesses = await response.json();

    if (!businesses.length) {
      return res.status(404).json({
        error: "Business not found"
      });
    }

    return res.status(200).json(businesses[0]);

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Something went wrong"
    });
  }
}
