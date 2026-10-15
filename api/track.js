const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 4 * 60 * 1000;
const requestLog = new Map();

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function isRateLimited(ip) {
  const now = Date.now();

  if (requestLog.size > 1000) {
    for (const [key, times] of requestLog.entries()) {
      const fresh = times.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
      if (fresh.length === 0) {
        requestLog.delete(key);
      } else {
        requestLog.set(key, fresh);
      }
    }
  }

  const recent = (requestLog.get(ip) || []).filter(
    t => now - t < RATE_LIMIT_WINDOW_MS
  );

  if (recent.length >= RATE_LIMIT_MAX) {
    requestLog.set(ip, recent);
    return true;
  }

  recent.push(now);
  requestLog.set(ip, recent);
  return false;
}

module.exports = async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  if (isRateLimited(getClientIp(req))) {
    return res.status(429).json({
      error: "Too many requests"
    });
  }

  try {

    const {
      business_id,
      event_type,
      session_id,
      rating
    } = req.body || {};

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

    const numericBusinessId = Number(business_id);

    if (
      !Number.isInteger(numericBusinessId) ||
      numericBusinessId <= 0
    ) {
      return res.status(400).json({
        error: "Invalid business"
      });
    }

    if (
      rating !== undefined &&
      rating !== null &&
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

    const supabaseHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    };

    // Check: business sach mein hai aur active hai
    const checkResponse = await fetch(
      `${supabaseRestUrl}/businesses?id=eq.${numericBusinessId}&active=eq.true&select=id&limit=1`,
      { headers: supabaseHeaders }
    );

    if (!checkResponse.ok) {
      return res.status(500).json({
        error: "Could not verify business"
      });
    }

    const foundBusinesses =
      await checkResponse.json();

    if (
      !Array.isArray(foundBusinesses) ||
      foundBusinesses.length === 0
    ) {
      return res.status(404).json({
        error: "Business not found"
      });
    }

    const insertResponse = await fetch(
      `${supabaseRestUrl}/usage_events`,
      {
        method: "POST",

        headers: {
          ...supabaseHeaders,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },

        body: JSON.stringify({
          business_id: numericBusinessId,
          event_type,
          session_id:
            session_id || null,
          rating:
            rating !== undefined &&
            rating !== null
              ? Number(rating)
              : null
        })
      }
    );

    if (!insertResponse.ok) {
      const responseText =
        await insertResponse.text();

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
};
