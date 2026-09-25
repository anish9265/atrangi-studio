export default async function handler(req, res) {

  // Vercel Cron sends GET.
  // Admin panel button sends POST.
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {

    // -------------------------
    // Supabase settings
    // -------------------------

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
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


    // -------------------------
    // Authentication
    // -------------------------

    const authorization =
      req.headers.authorization || "";


    // Vercel Cron authentication
    const cronSecret =
      process.env.CRON_SECRET;

    const isCronRequest =
      cronSecret &&
      authorization ===
        `Bearer ${cronSecret}`;


    // Admin panel authentication
    let isAdminRequest = false;


    if (!isCronRequest) {

      // Admin button must use POST
      if (req.method !== "POST") {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }


      if (!authorization.startsWith("Bearer ")) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }


      const accessToken =
        authorization.replace(
          "Bearer ",
          ""
        );


      // -------------------------
      // Verify logged-in user
      // -------------------------

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


      isAdminRequest = true;
    }


    // -------------------------
    // Safety check
    // -------------------------

    if (!isCronRequest && !isAdminRequest) {
      return res.status(401).json({
        error: "Unauthorized"
      });
    }


    // -------------------------
    // Calculate cleanup date
    // -------------------------

    const cleanupDate =
      new Date();

    cleanupDate.setUTCDate(1);

    cleanupDate.setUTCMonth(
      cleanupDate.getUTCMonth() - 2
    );

    const cleanupDateString =
      cleanupDate.toISOString();


    // -------------------------
    // Count old events first
    // -------------------------

    const countResponse =
      await fetch(
        `${supabaseRestUrl}/usage_events?created_at=lt.${encodeURIComponent(cleanupDateString)}&select=id`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization:
              `Bearer ${serviceRoleKey}`,
            Prefer: "count=exact"
          }
        }
      );


    if (!countResponse.ok) {

      const errorText =
        await countResponse.text();

      throw new Error(
        `Could not check old events: ${errorText}`
      );

    }


    const contentRange =
      countResponse.headers.get(
        "content-range"
      );


    let eventsFound = 0;


    if (contentRange) {

      const match =
        contentRange.match(
          /\/(\d+)$/
        );

      if (match) {
        eventsFound =
          Number(match[1]);
      }

    }


    // -------------------------
    // Nothing to delete
    // -------------------------

    if (eventsFound === 0) {

      return res.status(200).json({

        success: true,

        message:
          "No old usage events found.",

        events_found: 0,

        events_deleted: 0,

        cleanup_before:
          cleanupDateString

      });

    }


    // -------------------------
    // Delete old events
    // -------------------------

    const deleteResponse =
      await fetch(
        `${supabaseRestUrl}/usage_events?created_at=lt.${encodeURIComponent(cleanupDateString)}`,
        {
          method: "DELETE",

          headers: {
            apikey: serviceRoleKey,

            Authorization:
              `Bearer ${serviceRoleKey}`,

            Prefer:
              "return=representation"
          }
        }
      );


    if (!deleteResponse.ok) {

      const errorText =
        await deleteResponse.text();

      throw new Error(
        `Could not delete old events: ${errorText}`
      );

    }


    const deletedEvents =
      await deleteResponse.json();


    const eventsDeleted =
      Array.isArray(deletedEvents)
        ? deletedEvents.length
        : 0;


    // -------------------------
    // Return result
    // -------------------------

    return res.status(200).json({

      success: true,

      message:
        "Old usage events cleaned successfully.",

      events_found:
        eventsFound,

      events_deleted:
        eventsDeleted,

      cleanup_before:
        cleanupDateString,

      triggered_by:
        isCronRequest
          ? "cron"
          : "admin"

    });


  } catch (error) {

    console.error(
      "Cleanup API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Something went wrong"
    });

  }

}
