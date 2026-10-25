import { json, readBody, dbHeaders, checkAdmin } from "../../_lib/admin.js";

const GROUPS = ["negative", "neutral", "positive"];

export async function onRequestGet({ request, env }) {
  try {
    const admin = await checkAdmin(request, env);
    if (admin.response) return admin.response;

    const businessId = new URL(request.url).searchParams.get("businessId");

    if (!businessId) {
      return json({ error: "Business ID is required." }, 400);
    }

    const response = await fetch(
      `${admin.restUrl}/business_facts?business_id=eq.${encodeURIComponent(businessId)}&select=id,business_id,category,fact,rating_group,active,created_at&order=id.asc`,
      { headers: dbHeaders(admin.key) }
    );

    if (!response.ok) {
      console.error("Facts fetch failed:", await response.text());
      return json({ error: "Could not load business facts." }, 500);
    }

    return json({ facts: await response.json() });
  } catch (error) {
    console.error("Business facts API error:", error);
    return json({ error: "Something went wrong while managing business facts." }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const admin = await checkAdmin(request, env);
    if (admin.response) return admin.response;

    const { businessId, category, fact, ratingGroup } = await readBody(request);

    if (ratingGroup != null && !GROUPS.includes(ratingGroup)) {
      return json({ error: "Invalid rating group." }, 400);
    }

    if (!businessId || !category || !fact) {
      return json({ error: "Business ID, category and fact are required." }, 400);
    }

    const response = await fetch(`${admin.restUrl}/business_facts`, {
      method: "POST",
      headers: dbHeaders(admin.key, {
        "Content-Type": "application/json",
        Prefer: "return=representation"
      }),
      body: JSON.stringify({
        business_id: businessId,
        category: String(category).trim(),
        fact: String(fact).trim(),
        rating_group: ratingGroup || null,
        active: true
      })
    });

    const text = await response.text();

    if (!response.ok) {
      console.error("Fact insert failed:", text);
      return json({ error: "Could not add business fact." }, 500);
    }

    return json({ success: true, fact: JSON.parse(text)[0] });
  } catch (error) {
    console.error("Business facts API error:", error);
    return json({ error: "Something went wrong while managing business facts." }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  try {
    const admin = await checkAdmin(request, env);
    if (admin.response) return admin.response;

    const { id, category, fact, active, ratingGroup } = await readBody(request);

    if (!id) {
      return json({ error: "Fact ID is required." }, 400);
    }

    const updateData = {};

    if (typeof category === "string") updateData.category = category.trim();
    if (typeof fact === "string") updateData.fact = fact.trim();
    if (typeof active === "boolean") updateData.active = active;

    if (ratingGroup !== undefined) {
      if (ratingGroup !== null && !GROUPS.includes(ratingGroup)) {
        return json({ error: "Invalid rating group." }, 400);
      }
      updateData.rating_group = ratingGroup;
    }

    if (Object.keys(updateData).length === 0) {
      return json({ error: "Nothing to update." }, 400);
    }

    const response = await fetch(
      `${admin.restUrl}/business_facts?id=eq.${encodeURIComponent(id)}`,
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
      console.error("Fact update failed:", text);
      return json({ error: "Could not update business fact." }, 500);
    }

    const updated = JSON.parse(text);

    if (!updated.length) {
      return json({ error: "Fact not found." }, 404);
    }

    return json({ success: true, fact: updated[0] });
  } catch (error) {
    console.error("Business facts API error:", error);
    return json({ error: "Something went wrong while managing business facts." }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const admin = await checkAdmin(request, env);
    if (admin.response) return admin.response;

    const body = await readBody(request);
    const id = body.id || new URL(request.url).searchParams.get("id");

    if (!id) {
      return json({ error: "Fact ID is required." }, 400);
    }

    const response = await fetch(
      `${admin.restUrl}/business_facts?id=eq.${encodeURIComponent(id)}`,
      { method: "DELETE", headers: dbHeaders(admin.key) }
    );

    if (!response.ok) {
      console.error("Fact delete failed:", await response.text());
      return json({ error: "Could not delete business fact." }, 500);
    }

    return json({ success: true });
  } catch (error) {
    console.error("Business facts API error:", error);
    return json({ error: "Something went wrong while managing business facts." }, 500);
  }
}
