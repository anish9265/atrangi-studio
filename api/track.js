export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    const {
      business_id,
      event_type,
      session_id,
      rating
    } = req.body || {};

    // -------------------------
    // Basic validation
    // -------------------------

    if (!business_id || !event_type) {
      return res.status(400).json({
        error: "business_id and event_type are required"
      });
    }

    const allowedEvents = [
      "page_view",
      "review_generated",
      "google_click"
    ];

    if (!allowedEvents.includes(event_type)) {
      return res.status(400).json({
        error: "Invalid event type"
      });
    }

    // Rating is only relevant for review_generated
    if (
      event_type === "review_generated" &&
      rating !== undefined &&
      (
        !Number.isInteger(Number(rating)) ||
        Number(rating) < 1 ||
        Number(rating) > 5
      )
    ) {
      return res.status(400).json({
        error: "Invalid rating"
      });
    }

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({
        error: "Server configuration is incomplete"
      });
    }

    const baseUrl =
      supabaseUrl
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/rest\/v1$/, "");

    const supabaseRestUrl =
      `${baseUrl}/rest/v1`;

    // -------------------------
    // Insert usage event
    // -------------------------

    const insertResponse = await fetch(
      `${supabaseRestUrl}/usage_events`,
      {
        method: "POST",

        headers: {
          apikey: serviceRoleKey,
          Authorization:
            `Bearer ${serviceRoleKey}`,
          "Content-Type":
            "application/json",
          Prefer:
            "return=minimal"
        },

        body: JSON.stringify({
          business_id: Number(business_id),
          event_type,
          session_id:
            session_id || null,
          rating:
            event_type === "review_generated"
              ? Number(rating) || null
              : null
        })
      }
    );

    const responseText =
      await insertResponse.text();

    if (!insertResponse.ok) {

      console.error(
        "Supabase tracking error:",
        responseText
      );

      return res.status(500).json({
        error: "Could not save usage event"
      });
    }

    return res.status(200).json({
      success: true
    });

  } catch (error) {

    console.error(
      "Tracking API error:",
      error
    );

    return res.status(500).json({
      error: "Something went wrong"
    });
  }
}
