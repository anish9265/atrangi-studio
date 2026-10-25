import { json, dbHeaders, checkAdmin } from "../../_lib/admin.js";

export async function onRequestGet({ request, env }) {
  try {
    const admin = await checkAdmin(request, env);
    if (admin.response) return admin.response;

    const month = new URL(request.url).searchParams.get("month");

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return json({ error: "Month must be in YYYY-MM format" }, 400);
    }

    const businessesResponse = await fetch(
      `${admin.restUrl}/businesses?select=id,name,slug,category,active&order=id.asc`,
      { headers: dbHeaders(admin.key) }
    );

    if (!businessesResponse.ok) {
      throw new Error("Could not load businesses");
    }

    const businesses = await businessesResponse.json();

    const summariesResponse = await fetch(
      `${admin.restUrl}/monthly_summaries?month=eq.${encodeURIComponent(month + "-01")}&select=business_id,month,page_views,reviews_generated,google_clicks,rating_1,rating_2,rating_3,rating_4,rating_5`,
      { headers: dbHeaders(admin.key) }
    );

    if (!summariesResponse.ok) {
      throw new Error(
        `Could not load monthly summaries: ${await summariesResponse.text()}`
      );
    }

    const summaries = await summariesResponse.json();

    const summaryMap = new Map();
    summaries.forEach(s => summaryMap.set(Number(s.business_id), s));

    const analytics = businesses.map(business => {
      const s = summaryMap.get(Number(business.id));

      return {
        business_id: business.id,
        business_name: business.name,
        slug: business.slug,
        category: business.category || "other",
        active: business.active,
        page_views: Number(s?.page_views || 0),
        reviews_generated: Number(s?.reviews_generated || 0),
        google_clicks: Number(s?.google_clicks || 0),
        rating_1: Number(s?.rating_1 || 0),
        rating_2: Number(s?.rating_2 || 0),
        rating_3: Number(s?.rating_3 || 0),
        rating_4: Number(s?.rating_4 || 0),
        rating_5: Number(s?.rating_5 || 0)
      };
    });

    return json({ month, businesses: analytics });
  } catch (error) {
    console.error("Analytics API error:", error);
    return json({ error: error.message || "Something went wrong" }, 500);
  }
}
