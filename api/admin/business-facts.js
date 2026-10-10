module.exports = async function handler(req, res) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminEmail = process.env.ADMIN_EMAIL;

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !adminEmail
    ) {
      return res.status(500).json({
        error: "Server configuration is incomplete."
      });
    }

    // -----------------------------
    // 1. Check login
    // -----------------------------

    const authorization =
      req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "You must be logged in."
      });
    }

    const accessToken =
      authorization.replace("Bearer ", "").trim();

    // -----------------------------
    // 2. Verify logged-in user
    // -----------------------------

    const userResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!userResponse.ok) {
      return res.status(401).json({
        error: "Your login session is invalid or expired."
      });
    }

    const user = await userResponse.json();

    if (
      !user.email ||
      user.email.toLowerCase() !==
        adminEmail.toLowerCase()
    ) {
      return res.status(403).json({
        error:
          "You are not authorized to manage business facts."
      });
    }

    // -----------------------------
    // GET - Load facts
    // -----------------------------

    if (req.method === "GET") {

      const businessId =
        req.query.businessId;

      if (!businessId) {
        return res.status(400).json({
          error: "Business ID is required."
        });
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/business_facts?business_id=eq.${encodeURIComponent(
          businessId
        )}&select=id,business_id,category,fact,rating_group,active,created_at&order=id.asc`,
        {
          headers: {
            apikey: serviceRoleKey
          }
        }
      );

      if (!response.ok) {
        const errorText =
          await response.text();

        console.error(
          "Facts fetch failed:",
          errorText
        );

        return res.status(500).json({
          error: "Could not load business facts."
        });
      }

      const facts = await response.json();

      return res.status(200).json({
        facts
      });
    }

    // -----------------------------
    // POST - Add fact
    // -----------------------------

    if (req.method === "POST") {

const {
  businessId,
  category,
  fact,
  ratingGroup
} = req.body || {};

if (
  ratingGroup != null &&
  !["negative", "neutral", "positive"].includes(ratingGroup)
) {
  return res.status(400).json({
    error: "Invalid rating group."
  });
}

      if (
        !businessId ||
        !category ||
        !fact
      ) {
        return res.status(400).json({
          error:
            "Business ID, category and fact are required."
        });
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/business_facts`,
        {
          method: "POST",

          headers: {
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },

body: JSON.stringify({
  business_id: businessId,
  category: category.trim(),
  fact: fact.trim(),
  rating_group: ratingGroup || null,
  active: true
})
        }
      );

      const responseText =
        await response.text();

      if (!response.ok) {
        console.error(
          "Fact insert failed:",
          responseText
        );

        return res.status(500).json({
          error:
            "Could not add business fact."
        });
      }

      const insertedFact =
        JSON.parse(responseText);

      return res.status(200).json({
        success: true,
        fact: insertedFact[0]
      });
    }

    // -----------------------------
    // PATCH - Edit / activate / deactivate
    // -----------------------------

    if (req.method === "PATCH") {

const {
  id,
  category,
  fact,
  active,
  ratingGroup
} = req.body || {};

      if (!id) {
        return res.status(400).json({
          error: "Fact ID is required."
        });
      }

      const updateData = {};

      if (typeof category === "string") {
        updateData.category =
          category.trim();
      }

      if (typeof fact === "string") {
        updateData.fact =
          fact.trim();
      }

      if (typeof active === "boolean") {
        updateData.active = active;
      }

      if (
        Object.keys(updateData).length === 0
      ) {
        return res.status(400).json({
          error: "Nothing to update."
        });
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/business_facts?id=eq.${encodeURIComponent(
          id
        )}`,
        {
          method: "PATCH",

          headers: {
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },

          body: JSON.stringify(updateData)
        }
      );

      const responseText =
        await response.text();

      if (!response.ok) {
        console.error(
          "Fact update failed:",
          responseText
        );

        return res.status(500).json({
          error:
            "Could not update business fact."
        });
      }

      const updatedFact =
        JSON.parse(responseText);

      if (!updatedFact.length) {
        return res.status(404).json({
          error: "Fact not found."
        });
      }

      return res.status(200).json({
        success: true,
        fact: updatedFact[0]
      });
    }

    // -----------------------------
    // DELETE - Delete fact
    // -----------------------------

    if (req.method === "DELETE") {

      const id =
        req.body?.id ||
        req.query?.id;

      if (!id) {
        return res.status(400).json({
          error: "Fact ID is required."
        });
      }

      const response = await fetch(
        `${supabaseUrl}/rest/v1/business_facts?id=eq.${encodeURIComponent(
          id
        )}`,
        {
          method: "DELETE",

          headers: {
            apikey: serviceRoleKey,
            Prefer: "return=representation"
          }
        }
      );

      const responseText =
        await response.text();

      if (!response.ok) {
        console.error(
          "Fact delete failed:",
          responseText
        );

        return res.status(500).json({
          error:
            "Could not delete business fact."
        });
      }

      return res.status(200).json({
        success: true
      });
    }

    return res.status(405).json({
      error: "Method not allowed"
    });

  } catch (error) {

    console.error(
      "Business facts API error:",
      error
    );

    return res.status(500).json({
      error:
        "Something went wrong while managing business facts."
    });
  }
};
