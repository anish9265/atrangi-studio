import { json, readBody, dbHeaders, checkAdmin } from "../../_lib/admin.js";

export async function onRequestPatch({ request, env }) {
  try {
    const admin = await checkAdmin(request, env);
    if (admin.response) return admin.response;

    const { id, name, googleReviewUrl, category, language, businessInfo } =
      await readBody(request);

    if (!id || !name || !googleReviewUrl) {
      return json(
        { error: "Business ID, name and Google Review URL are required." },
        400
      );
    }

    const updateData = {
      name: String(name).trim(),
      google_review_url: String(googleReviewUrl).trim(),
      category: category || "other",
      language: language || "en"
    };

    if (typeof businessInfo === "string") {
      updateData.business_info = businessInfo.trim().slice(0, 500) || null;
    }

    const response = await fetch(
      `${admin.restUrl}/businesses?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: dbHeaders(admin.key, {
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }),
        body: JSON.stringify(updateData)
      }
    );

    const text = await response.text();

    if (!response.ok) {
      console.error("Supabase update failed:", text);
      return json({ error: "Could not update business." }, 500);
    }

    const updated = JSON.parse(text);

    if (!updated.length) {
      return json({ error: "Business not found." }, 404);
    }

    return json({ success: true, business: updated[0] });
  } catch (error) {
    console.error("Business update error:", error);
    return json({ error: "Something went wrong while updating the business." }, 500);
  }
}
