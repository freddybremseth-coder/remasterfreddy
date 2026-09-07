export const REALTYFLOW_YOUTUBE_RECONNECT_URL =
  "https://realtyflow.chatgenius.pro/api/oauth/google?brand_id=remasterfreddy&service=youtube&return_to=%2Foauth%2Fremaster-return";

export function isYoutubeReconnectError(input?: string | null) {
  const value = (input || "").toLowerCase();
  return (
    value.includes("youtube-tilkoblingen er utløpt") ||
    value.includes("token has been expired or revoked") ||
    value.includes("youtube_reconnect_required") ||
    value.includes("reconnect required")
  );
}
