module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    // -----------------------------
    // 1. Check required environment variables
    // -----------------------------

    const supabaseUrl = process.env.SUPABASE_URL;
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

    // -----------------------------
    // 2. Check login token
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
    // 3. Verify the logged-in user
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

    // -----------------------------
    // 4. Make sure this is YOUR admin account
    // -----------------------------

    if (
      !user.email ||
      user.email.toLowerCase() !==
        adminEmail.toLowerCase()
    ) {
      return res.status(403).json({
        error: "You are not authorized to use the admin panel."
      });
    }

    // -----------------------------
    // 5. Read business information
    // -----------------------------

    const {
      name,
      googleReviewUrl,
      category,
      language
    } = req.body || {};

    if (!name || !googleReviewUrl) {
      return res.status(400).json({
        error:
          "Business name and Google Review URL are required."
      });
    }

    // -----------------------------
    // 6. Create a URL-friendly slug
    // -----------------------------

    let slug = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!slug) {
      return res.status(400).json({
        error: "Could not create a valid business URL."
      });
    }

    // -----------------------------
    // 7. Check whether slug already exists
    // -----------------------------

    const checkResponse = await fetch(
      `${supabaseUrl}/rest/v1/businesses?slug=eq.${encodeURIComponent(
        slug
      )}&select=id&limit=1`,
      {
headers: {
  apikey: serviceRoleKey
}
      }
    );

    if (!checkResponse.ok) {
      const errorText =
        await checkResponse.text();

      console.error(
        "Slug check failed:",
        errorText
      );

return res.status(500).json({
  error: "Could not check business URL."
});
    }

    const existingBusinesses =
      await checkResponse.json();

    // -----------------------------
    // 8. If slug exists, add a number
    // -----------------------------

    if (existingBusinesses.length > 0) {
      let number = 2;
      let newSlug = `${slug}-${number}`;

      while (true) {
        const response = await fetch(
          `${supabaseUrl}/rest/v1/businesses?slug=eq.${encodeURIComponent(
            newSlug
          )}&select=id&limit=1`,
          {
headers: {
  apikey: serviceRoleKey
}
          }
        );

        const data = await response.json();

        if (data.length === 0) {
          slug = newSlug;
          break;
        }

        number++;
        newSlug = `${slug}-${number}`;
      }
    }

    // -----------------------------
    // 9. Add business to Supabase
    // -----------------------------

    const insertResponse = await fetch(
      `${supabaseUrl}/rest/v1/businesses`,
      {
        method: "POST",

headers: {
  apikey: serviceRoleKey,
  "Content-Type": "application/json",
  Prefer: "return=representation"
},
body: JSON.stringify({
          name: name.trim(),
          slug,
          google_review_url:
            googleReviewUrl.trim(),
          category:
            category || "other",
          language:
            language || "en",
          active: true
        })
      }
    );

    const responseText =
      await insertResponse.text();

    if (!insertResponse.ok) {
      console.error(
        "Supabase insert failed:",
        responseText
      );

      return res.status(500).json({
        error: "Could not add business to database."
      });
    }

    const insertedBusiness =
      JSON.parse(responseText);

    // -----------------------------
    // 10. Success
    // -----------------------------

    return res.status(200).json({
      success: true,
      slug,
      business: insertedBusiness[0]
    });

  } catch (error) {
    console.error(
      "Admin business error:",
      error
    );

    return res.status(500).json({
      error: "Something went wrong.",
      details: error.message
    });
  }
}
