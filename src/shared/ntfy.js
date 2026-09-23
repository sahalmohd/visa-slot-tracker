export const NTFY_SERVER = "https://ntfy.sh";

/**
 * Publish a message to ntfy.sh via its JSON publish API.
 *
 * Uses the JSON body form (not ntfy's header-based publish API) because
 * header values must be ASCII, and notification messages in this app
 * contain non-ASCII characters (e.g. the "→" in date-change alerts).
 * A header-based publish would corrupt or reject those messages.
 */
export async function publishNtfy({
  topic,
  token = "",
  title,
  message,
  priority = 3,
  tags = [],
  clickUrl = ""
}) {
  if (!topic) {
    throw new Error("ntfy error: topic is missing.");
  }

  const headers = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const body = {
    topic,
    title,
    message,
    priority,
    tags
  };
  if (clickUrl) {
    body.click = clickUrl;
  }

  const response = await fetch(NTFY_SERVER, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`ntfy error: HTTP ${response.status} ${responseBody.slice(0, 180)}`);
  }

  return { ok: true };
}
