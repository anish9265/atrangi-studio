export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export async function readBody(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}

export function dbHeaders(key, extra = {}) {
  const base = key.startsWith("sb_")
    ? { apikey: key }
    : { apikey: key, Authorization: `Bearer ${key}` };
  return { ...base, ...extra };
}

export async function checkAdmin(request, env) {
  const supabaseUrl = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmail = env.ADMIN_EMAIL;

  if (!supabaseUrl || !key || !adminEmail) {
    return { response: json({ error: "Server configuration is incomplete." }, 500) };
  }

  const authorization = request.headers.get("Authorization") || "";

  if (!authorization.startsWith("Bearer ")) {
    return { response: json({ error: "You must be logged in." }, 401) };
  }

  const accessToken = authorization.replace("Bearer ", "").trim();

  const baseUrl = supabaseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/, "");

  const userResponse = await fetch(`${baseUrl}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_ANON_KEY || key,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!userResponse.ok) {
    return { response: json({ error: "Your login session is invalid or expired." }, 401) };
  }

  const user = await userResponse.json();

  if (!user.email || user.email.toLowerCase() !== adminEmail.toLowerCase()) {
    return { response: json({ error: "You are not authorized to use the admin panel." }, 403) };
  }

  return { baseUrl, restUrl: `${baseUrl}/rest/v1`, key };
}
