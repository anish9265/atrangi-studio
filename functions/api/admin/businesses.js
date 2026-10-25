import { json, dbHeaders, checkAdmin } from "../../_lib/admin.js";

export async function onRequestGet({ request, env }) {
  try {
    const admin = await checkAdmin(request, env);
    if (admin.response) return admin.response;

    const response = await fetch(
      `${admin.restUrl}/businesses?select=id,name,slug,google_review_url,category,language,business_info,active,created_at&order=created_at.desc`,
      { headers: dbHeaders(admin.key) }
    );

    if (!response.ok) {
      console.error("Businesses query failed:", await response.text());
      return json({ error: "Could not load businesses from database." }, 500);
    }

    return json({ businesses: await response.json() });
  } catch (error) {
    console.error("Admin businesses error:", error);
    return json({ error: "Something went wrong while loading businesses." }, 500);
  }
}
