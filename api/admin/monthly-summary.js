export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    // -----------------------------
    // 1. Check login session
    // -----------------------------

    const authorization =
      req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }

    const accessToken =
      authorization.replace("Bearer ", "");

    // -----------------------------
    // 2. Environment variables
    // -----------------------------

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    const adminEmail =
      process.env.ADMIN_EMAIL;

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !adminEmail
    ) {
      return res.status(500).json({
        error:
          "Server configuration is incomplete"
      });
    }

    const baseUrl =
      supabaseUrl
        .trim()
        .replace(/\/+$/, "")
        .replace(/\/rest\/v1$/, "");

    const supabaseRestUrl =
      `${baseUrl}/rest/v1`;

    // -----------------------------
    // 3. Verify logged-in user
    // -----------------------------

    const userResponse =
      await fetch(
        `${baseUrl}/auth/v1/user`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Invalid session"
      });
    }

    const user =
      await userResponse.json();

    if (user.email !== adminEmail) {
      return res.status(403).json({
        error: "Access denied"
      });
    }

    // -----------------------------
    // 4. Get requested month
    // -----------------------------

    const {
      month
    } = req.body || {};

    if (
      !month ||
      !/^\d{4}-\d{2}$/.test(month)
    ) {
      return res.status(400).json({
        error:
          "Month must be in YYYY-MM format"
      });
    }

    // -----------------------------
    // 5. Calculate month boundaries
    // -----------------------------

    const [year, monthNumber] =
      month.split("-").map(Number);

    const startDate =
      new Date(
        Date.UTC(
          year,
          monthNumber - 1,
          1
        )
      );

    const endDate =
      new Date(
        Date.UTC(
          year,
          monthNumber,
          1
        )
      );

    // -----------------------------
    // 6. Load usage events
    // -----------------------------

    const eventsResponse =
      await fetch(
        `${supabaseRestUrl}/usage_events?created_at=gte.${encodeURIComponent(
          startDate.toISOString()
        )}&created_at=lt.${encodeURIComponent(
          endDate.toISOString()
        )}&select=business_id,event_type,rating`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization:
              `Bearer ${serviceRoleKey}`
          }
        }
      );

    if (!eventsResponse.ok) {
      const errorText =
        await eventsResponse.text();

      throw new Error(
        `Could not load usage events: ${errorText}`
      );
    }

    const events =
      await eventsResponse.json();

    // -----------------------------
    // 7. Group events by business
    // -----------------------------

    const businessMap =
      new Map();

    events.forEach(
      (event) => {

        const businessId =
          Number(event.business_id);

        if (!businessMap.has(businessId)) {

          businessMap.set(
            businessId,
            {
              page_views: 0,
              reviews_generated: 0,
              google_clicks: 0,
              rating_1: 0,
              rating_2: 0,
              rating_3: 0,
              rating_4: 0,
              rating_5: 0
            }
          );

        }

        const stats =
          businessMap.get(businessId);

        if (
          event.event_type ===
          "page_view"
        ) {
          stats.page_views++;
        }

        if (
          event.event_type ===
          "review_generated"
        ) {

          stats.reviews_generated++;

          const rating =
            Number(event.rating);

          if (
            rating >= 1 &&
            rating <= 5
          ) {

            stats[
              `rating_${rating}`
            ]++;

          }

        }

        if (
          event.event_type ===
          "google_click"
        ) {
          stats.google_clicks++;
        }

      }
    );

    // -----------------------------
    // 8. Save monthly summaries
    // -----------------------------

    const summaryRows =
      Array.from(
        businessMap.entries()
      ).map(
        ([businessId, stats]) => ({
          business_id:
            businessId,

          month:
            `${month}-01`,

          ...stats
        })
      );

    if (summaryRows.length === 0) {

      return res.status(200).json({
        success: true,
        month,
        summaries_created: 0,
        message:
          "No usage events found for this month."
      });

    }

    const summaryResponse =
      await fetch(
        `${supabaseRestUrl}/monthly_summaries?on_conflict=business_id,month`,
        {
          method: "POST",

          headers: {
            apikey: serviceRoleKey,

            Authorization:
              `Bearer ${serviceRoleKey}`,

            "Content-Type":
              "application/json",

            Prefer:
              "resolution=merge-duplicates,return=representation"
          },

          body:
            JSON.stringify(
              summaryRows
            )
        }
      );

    if (!summaryResponse.ok) {

      const errorText =
        await summaryResponse.text();

      throw new Error(
        `Could not save monthly summaries: ${errorText}`
      );

    }

    const savedSummaries =
      await summaryResponse.json();

    // -----------------------------
    // 9. Return result
    // -----------------------------

    return res.status(200).json({
      success: true,
      month,
      summaries_created:
        savedSummaries.length,
      summaries:
        savedSummaries
    });

  } catch (error) {

    console.error(
      "Monthly summary error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Something went wrong"
    });

  }

}
