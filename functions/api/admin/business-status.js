import { json, readBody, dbHeaders, checkAdmin } from "../../_lib/admin.js";

export async function onRequestPatch({ request, env }) {
  try {
    const admin = await checkAdmin(request, env);
    if (admin.response) return admin.response;

    const { id, active } = await readBody(request);

    if (!id || typeof active !== "boolean") {
      return json({ error: "Business ID and status are required." }, 400);
    }

    const response = await fetch(
      `${admin.restUrl}/businesses?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: dbHeaders(admin.key, {
          "Content-Type": "application/json",
          Prefer: "return=representation"
        }),
        body: JSON.stringify({ active })
      }
    );

    const text = await response.text();

    if (!response.ok) {
      console.error("Status update failed:", text);
      return json({ error: "Could not update business status." }, 500);
    }

    const updated = JSON.parse(text);

    if (!updated.length) {
      return json({ error: "Business not found." }, 404);
    }

    return json({ success: true, business: updated[0] });
  } catch (error) {
    console.error("Business status error:", error);
    return json({ error: "Something went wrong while changing business status." }, 500);
  }
}
