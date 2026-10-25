const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 4 * 60 * 1000;
const requestLog = new Map();

function getClientIp(request) {
  return (
    request.headers.get("CF-Connecting-IP") ||
    String(request.headers.get("x-forwarded-for") || "")
      .split(",")[0]
      .trim() ||
    "unknown"
  );
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (isRateLimited(getClientIp(request))) {
    return jsonResponse({ error: "Too many requests" }, 429);
  }

  try {
    let body = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const { business_id, event_type, session_id, rating } = body || {};

    if (!business_id || !event_type) {
      return jsonResponse(
        { error: "business_id and event_type are required" },
        400
      );
    }

    const allowedEvents = ["page_view", "review_generated", "google_click"];

    if (!allowedEvents.includes(event_type)) {
      return jsonResponse({ error: "Invalid event type" }, 400);
    }

    const numericBusinessId = Number(business_id);

    if (!Number.isInteger(numericBusinessId) || numericBusinessId <= 0) {
      return jsonResponse({ error: "Invalid business" }, 400);
    }

    if (
      rating !== undefined &&
      rating !== null &&
      (!Number.isInteger(Number(rating)) ||
        Number(rating) < 1 ||
        Number(rating) > 5)
    ) {
      return jsonResponse({ error: "Invalid rating" }, 400);
    }

    const supabaseUrl = env.SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: "Server configuration is incomplete" }, 500);
    }

    const baseUrl = supabaseUrl
      .trim()
      .replace(/\/+$/, "")
      .replace(/\/rest\/v1$/, "");

    const supabaseRestUrl = `${baseUrl}/rest/v1`;

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
      return jsonResponse({ error: "Could not verify business" }, 500);
    }

    const foundBusinesses = await checkResponse.json();

    if (!Array.isArray(foundBusinesses) || foundBusinesses.length === 0) {
      return jsonResponse({ error: "Business not found" }, 404);
    }

    const insertResponse = await fetch(`${supabaseRestUrl}/usage_events`, {
      method: "POST",
      headers: {
        ...supabaseHeaders,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify({
        business_id: numericBusinessId,
        event_type,
        session_id: session_id || null,
        rating:
          rating !== undefined && rating !== null ? Number(rating) : null
      })
    });

    if (!insertResponse.ok) {
      const responseText = await insertResponse.text();
      console.error("Supabase tracking error:", responseText);
      return jsonResponse({ error: "Could not save usage event" }, 500);
    }

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("Tracking API error:", error);
    return jsonResponse({ error: "Something went wrong" }, 500);
  }
}
