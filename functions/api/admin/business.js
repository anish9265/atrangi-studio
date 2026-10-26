import { json, readBody, dbHeaders, checkAdmin } from "../../_lib/admin.js";

export async function onRequestPost({ request, env }) {
  try {
    const admin = await checkAdmin(request, env);
    if (admin.response) return admin.response;

    const { name, googleReviewUrl, category, language, businessInfo } =
      await readBody(request);

    if (!name || !googleReviewUrl) {
      return json(
        { error: "Business name and Google Review URL are required." },
        400
      );
    }

    const cleanBusinessInfo =
      typeof businessInfo === "string" ? businessInfo.trim().slice(0, 500) : "";

    const baseSlug = String(name)
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!baseSlug) {
      return json({ error: "Could not create a valid business URL." }, 400);
    }

    let slug = baseSlug;
    let number = 1;

    while (true) {
      const check = await fetch(
        `${admin.restUrl}/businesses?slug=eq.${encodeURIComponent(slug)}&select=id&limit=1`,
        { headers: dbHeaders(admin.key) }
      );

      if (!check.ok) {
        return json({ error: "Could not check business URL." }, 500);
      }

      const found = await check.json();

      if (found.length === 0) break;

      number++;
      slug = `${baseSlug}-${number}`;

      if (number > 30) {
        return json({ error: "Could not create a unique business URL." }, 500);
      }
    }

    const insert = await fetch(`${admin.restUrl}/businesses`, {
      method: "POST",
      headers: dbHeaders(admin.key, {
        "Content-Type": "application/json",
        Prefer: "return=representation"
      }),
      body: JSON.stringify({
        name: String(name).trim(),
        slug,
        google_review_url: String(googleReviewUrl).trim(),
        category: category || "other",
        language: language || "en",
        business_info: cleanBusinessInfo || null,
        active: true
      })
    });

    const text = await insert.text();

    if (!insert.ok) {
      console.error("Supabase insert failed:", text);
      return json({ error: "Could not add business to database." }, 500);
    }

    const inserted = JSON.parse(text);

    return json({ success: true, slug, business: inserted[0] });
  } catch (error) {
    console.error("Admin business error:", error);
    return json({ error: "Something went wrong." }, 500);
  }
}
