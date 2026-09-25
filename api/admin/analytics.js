export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    // -------------------------
    // Check admin login
    // -------------------------

    const authorization =
      req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }

    const accessToken =
      authorization.replace("Bearer ", "");

    // -------------------------
    // Supabase settings
    // -------------------------

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
    // Verify logged-in user
    // -------------------------

    const userResponse = await fetch(
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

    // -------------------------
    // Admin email check
    // -------------------------

    const adminEmail =
      process.env.ADMIN_EMAIL;

    if (
      !adminEmail ||
      user.email !== adminEmail
    ) {
      return res.status(403).json({
        error: "Access denied"
      });
    }

    // -------------------------
    // Month
    // -------------------------

    const month =
      req.query.month;

    if (
      !month ||
      !/^\d{4}-\d{2}$/.test(month)
    ) {
      return res.status(400).json({
        error:
          "Month must be in YYYY-MM format"
      });
    }

    const startDate =
      `${month}-01T00:00:00.000Z`;

    const [year, monthNumber] =
      month.split("-").map(Number);

    const nextMonthDate =
      new Date(
        Date.UTC(
          year,
          monthNumber,
          1
        )
      );

    const endDate =
      nextMonthDate.toISOString();

    // -------------------------
    // Get businesses
    // -------------------------

    const businessesResponse =
      await fetch(
        `${supabaseRestUrl}/businesses?select=id,name,slug,category,active&order=id.asc`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization:
              `Bearer ${serviceRoleKey}`
          }
        }
      );

    if (!businessesResponse.ok) {
      throw new Error(
        "Could not load businesses"
      );
    }

    const businesses =
      await businessesResponse.json();

    // -------------------------
    // Get usage events
    // -------------------------

    const eventsResponse =
      await fetch(
        `${supabaseRestUrl}/usage_events?created_at=gte.${encodeURIComponent(startDate)}&created_at=lt.${encodeURIComponent(endDate)}&select=business_id,event_type,rating`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization:
              `Bearer ${serviceRoleKey}`
          }
        }
      );

    if (!eventsResponse.ok) {
      throw new Error(
        "Could not load usage events"
      );
    }

    const events =
      await eventsResponse.json();

    // -------------------------
    // Calculate statistics
    // -------------------------

    const analytics =
      businesses.map((business) => {

        const businessEvents =
          events.filter(
            (event) =>
              Number(event.business_id) ===
              Number(business.id)
          );

        const stats = {
          page_views: 0,
          reviews_generated: 0,
          google_clicks: 0,
          rating_1: 0,
          rating_2: 0,
          rating_3: 0,
          rating_4: 0,
          rating_5: 0
        };

        businessEvents.forEach(
          (event) => {

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

              if (rating >= 1 &&
                  rating <= 5) {

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

        return {
          business_id: business.id,
          business_name: business.name,
          slug: business.slug,
          category:
            business.category || "other",
          active: business.active,
          ...stats
        };

      });

    return res.status(200).json({
      month,
      businesses: analytics
    });

  } catch (error) {

    console.error(
      "Analytics API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Something went wrong"
    });
  }
}
