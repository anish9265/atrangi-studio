module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
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
          "You are not authorized to use the admin panel."
      });
    }

    const businessesResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/businesses?select=id,name,slug,category,language,active,created_at&order=created_at.desc`,
        {
          headers: {
            apikey: serviceRoleKey
          }
        }
      );

    if (!businessesResponse.ok) {
      const errorText =
        await businessesResponse.text();

      console.error(
        "Supabase businesses query failed:",
        errorText
      );

      return res.status(500).json({
        error:
          "Could not load businesses from database."
      });
    }

    const businesses =
      await businessesResponse.json();

    return res.status(200).json({
      businesses
    });

  } catch (error) {

    console.error(
      "Admin businesses error:",
      error
    );

    return res.status(500).json({
      error:
        "Something went wrong while loading businesses."
    });
  }
};
