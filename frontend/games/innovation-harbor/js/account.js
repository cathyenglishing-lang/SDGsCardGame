// Player avatar from the logged-in CardLearn account: gender "female" → female model, anything else → male.
// ?avatar=female|male overrides (testing). Falls back to male when logged out or the API is unreachable.
export async function accountAvatar() {
  const forced = new URLSearchParams(location.search).get("avatar");
  if (forced === "female" || forced === "male") return forced;
  try {
    const session = JSON.parse(localStorage.getItem("user") || "null");
    if (session?.user?.role === "guest") return session.user.gender === "female" ? "female" : "male";
    const base = String(window.CARDLEARN_API_BASE_URL || "").replace(/\/+$/, "");
    if (!session?.access_token || !base) return "male";
    const res = await fetch(`${base}/auth/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "male";
    const me = await res.json();
    return me.gender === "female" ? "female" : "male";
  } catch {
    return "male";
  }
}
