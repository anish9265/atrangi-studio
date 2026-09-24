module.exports = async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const supabaseUrl =
      process.env.SUPABASE_URL;

    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    const adminEmail =
      process.env.ADMIN_EMAIL;

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !adminEmail
    ) {
      return res.status(500).json({
        error: "Server configuration is incomplete."
      });
    }

    const authorization =
      req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "You must be logged in."
      });
    }

    const accessToken =
      authorization.replace("Bearer ", "").trim();

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

    const user =
      await userResponse.json();

    if (
      !user.email ||
      user.email.toLowerCase() !==
        adminEmail.toLowerCase()
    ) {
      return res.status(403).json({
        error:
          "You are not authorized to edit businesses."
      });
    }

    const {
      id,
      name,
      googleReviewUrl,
      category,
      language
    } = req.body || {};

    if (
      !id ||
      !name ||
      !googleReviewUrl
    ) {
      return res.status(400).json({
        error:
          "Business ID, name and Google Review URL are required."
      });
    }

    const updateResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/businesses?id=eq.${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          headers: {
            apikey: serviceRoleKey,
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            name: name.trim(),
            google_review_url:
              googleReviewUrl.trim(),
            category:
              category || "other",
            language:
              language || "en"
          })
        }
      );

    const responseText =
      await updateResponse.text();

    if (!updateResponse.ok) {
      console.error(
        "Supabase update failed:",
        responseText
      );

      return res.status(500).json({
        error:
          "Could not update business."
      });
    }

    const updatedBusiness =
      JSON.parse(responseText);

    if (!updatedBusiness.length) {
      return res.status(404).json({
        error:
          "Business not found."
      });
    }

    return res.status(200).json({
      success: true,
      business:
        updatedBusiness[0]
    });

  } catch (error) {
    console.error(
      "Business update error:",
      error
    );

    return res.status(500).json({
      error:
        "Something went wrong while updating the business."
    });
  }
};
