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

    const monthDate =
      `${month}-01`;

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
    // Get monthly summaries
    // -------------------------

    const summariesResponse =
      await fetch(
        `${supabaseRestUrl}/monthly_summaries?month=eq.${encodeURIComponent(monthDate)}&select=business_id,month,page_views,reviews_generated,google_clicks,rating_1,rating_2,rating_3,rating_4,rating_5`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization:
              `Bearer ${serviceRoleKey}`
          }
        }
      );

    if (!summariesResponse.ok) {
      const errorText =
        await summariesResponse.text();

      throw new Error(
        `Could not load monthly summaries: ${errorText}`
      );
    }

    const summaries =
      await summariesResponse.json();

    // -------------------------
    // Match businesses
    // with monthly summaries
    // -------------------------

    const summaryMap =
      new Map();

    summaries.forEach(
      (summary) => {

        summaryMap.set(
          Number(summary.business_id),
          summary
        );

      }
    );

    // -------------------------
    // Create analytics
    // -------------------------

    const analytics =
      businesses.map(
        (business) => {

          const summary =
            summaryMap.get(
              Number(business.id)
            );

          return {
            business_id:
              business.id,

            business_name:
              business.name,

            slug:
              business.slug,

            category:
              business.category ||
              "other",

            active:
              business.active,

            page_views:
              Number(
                summary?.page_views || 0
              ),

            reviews_generated:
              Number(
                summary?.reviews_generated || 0
              ),

            google_clicks:
              Number(
                summary?.google_clicks || 0
              ),

            rating_1:
              Number(
                summary?.rating_1 || 0
              ),

            rating_2:
              Number(
                summary?.rating_2 || 0
              ),

            rating_3:
              Number(
                summary?.rating_3 || 0
              ),

            rating_4:
              Number(
                summary?.rating_4 || 0
              ),

            rating_5:
              Number(
                summary?.rating_5 || 0
              )
          };

        }
      );

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
