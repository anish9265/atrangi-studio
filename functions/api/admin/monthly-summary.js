import { json, readBody, dbHeaders, checkAdmin } from "../../_lib/admin.js";

export async function onRequestPost({ request, env }) {
  try {
    const admin = await checkAdmin(request, env);
    if (admin.response) return admin.response;

    const { month } = await readBody(request);

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return json({ error: "Month must be in YYYY-MM format" }, 400);
    }

    const [year, monthNumber] = month.split("-").map(Number);
    const startDate = new Date(Date.UTC(year, monthNumber - 1, 1));
    const endDate = new Date(Date.UTC(year, monthNumber, 1));

    const events = [];
    const maxPages = 40;
    let offset = 0;

    for (let page = 0; page < maxPages; page++) {
      const eventsResponse = await fetch(
        `${admin.restUrl}/usage_events?created_at=gte.${encodeURIComponent(startDate.toISOString())}&created_at=lt.${encodeURIComponent(endDate.toISOString())}&select=business_id,event_type,rating&order=id.asc&limit=1000&offset=${offset}`,
        { headers: dbHeaders(admin.key) }
      );

      if (!eventsResponse.ok) {
        throw new Error(
          `Could not load usage events: ${await eventsResponse.text()}`
        );
      }

      const pageEvents = await eventsResponse.json();

      if (!Array.isArray(pageEvents) || pageEvents.length === 0) break;

      events.push(...pageEvents);
      offset += pageEvents.length;
    }

    const businessMap = new Map();

    for (const event of events) {
      const businessId = Number(event.business_id);

      if (!businessMap.has(businessId)) {
        businessMap.set(businessId, {
          page_views: 0,
          reviews_generated: 0,
          google_clicks: 0,
          rating_1: 0,
          rating_2: 0,
          rating_3: 0,
          rating_4: 0,
          rating_5: 0
        });
      }

      const stats = businessMap.get(businessId);

      if (event.event_type === "page_view") stats.page_views++;

      if (event.event_type === "review_generated") {
        stats.reviews_generated++;
        const rating = Number(event.rating);
        if (rating >= 1 && rating <= 5) stats[`rating_${rating}`]++;
      }

      if (event.event_type === "google_click") stats.google_clicks++;
    }

    const summaryRows = Array.from(businessMap.entries()).map(
      ([businessId, stats]) => ({
        business_id: businessId,
        month: `${month}-01`,
        ...stats
      })
    );

    if (summaryRows.length === 0) {
      return json({
        success: true,
        month,
        summaries_created: 0,
        message: "No usage events found for this month."
      });
    }

    const summaryResponse = await fetch(
      `${admin.restUrl}/monthly_summaries?on_conflict=business_id,month`,
      {
        method: "POST",
        headers: dbHeaders(admin.key, {
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation"
        }),
        body: JSON.stringify(summaryRows)
      }
    );

    if (!summaryResponse.ok) {
      throw new Error(
        `Could not save monthly summaries: ${await summaryResponse.text()}`
      );
    }

    const saved = await summaryResponse.json();

    return json({
      success: true,
      month,
      summaries_created: saved.length,
      summaries: saved
    });
  } catch (error) {
    console.error("Monthly summary error:", error);
    return json({ error: "Something went wrong" }, 500);
  }
}
