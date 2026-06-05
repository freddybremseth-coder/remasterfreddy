const ADMIN_EMAIL = "freddy.bremseth@gmail.com";

function getBearerToken(request: any) {
  const header = String(request.headers?.authorization || "");
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

export async function requireAdmin(request: any, response: any) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const accessToken = getBearerToken(request);

  if (!supabaseUrl || !supabaseAnonKey) {
    response.status(503).json({ error: "Admin authentication is not configured." });
    return null;
  }

  if (!accessToken) {
    response.status(401).json({ error: "Missing admin access token." });
    return null;
  }

  const verification = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!verification.ok) {
    response.status(401).json({ error: "Invalid or expired admin session." });
    return null;
  }

  const user = await verification.json().catch(() => ({}));
  const email = String(user.email || "").toLowerCase();
  if (email !== ADMIN_EMAIL) {
    response.status(403).json({ error: "This account does not have Re-Master Freddy admin access." });
    return null;
  }

  return { email, accessToken, userId: String(user.id || "") };
}
