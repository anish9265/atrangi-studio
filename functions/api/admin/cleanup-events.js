import { json, dbHeaders, checkAdmin } from "../../_lib/admin.js";

export async function onRequestPost({ request, env }) {
  try {
    const admin = await checkAdmin(request, env);
    if (admin.response) return admin.response;

    const cleanupDate = new Date();
    cleanupDate.setUTCDate(1);
    cleanupDate.setUTCMonth(cleanupDate.getUTCMonth() - 2);
    const cleanupDateString = cleanupDate.toISOString();

    const countResponse = await fetch(
      `${admin.restUrl}/usage_events?created_at=lt.${encodeURIComponent(cleanupDateString)}&select=id`,
      { headers: dbHeaders(admin.key, { Prefer: "count=exact" }) }
    );

    if (!countResponse.ok) {
      throw new Error(`Could not check old events: ${await countResponse.text()}`);
    }

    const contentRange = countResponse.headers.get("content-range");
    let eventsFound = 0;

    if (contentRange) {
      const match = contentRange.match(/\/(\d+)$/);
      if (match) eventsFound = Number(match[1]);
    }

    if (eventsFound === 0) {
      return json({
        success: true,
        message: "No old usage events found.",
        events_found: 0,
        events_deleted: 0,
        cleanup_before: cleanupDateString
      });
    }

    const deleteResponse = await fetch(
      `${admin.restUrl}/usage_events?created_at=lt.${encodeURIComponent(cleanupDateString)}`,
      {
        method: "DELETE",
        headers: dbHeaders(admin.key, { Prefer: "return=representation" })
      }
    );

    if (!deleteResponse.ok) {
      throw new Error(`Could not delete old events: ${await deleteResponse.text()}`);
    }

    const deleted = await deleteResponse.json();

    return json({
      success: true,
      message: "Old usage events cleaned successfully.",
      events_found: eventsFound,
      events_deleted: Array.isArray(deleted) ? deleted.length : 0,
      cleanup_before: cleanupDateString,
      triggered_by: "admin"
    });
  } catch (error) {
    console.error("Cleanup API error:", error);
    return json({ error: "Something went wrong" }, 500);
  }
}
