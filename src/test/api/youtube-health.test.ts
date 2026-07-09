import { describe, expect, it } from "vitest";

import { normalizeReconnectUrl } from "../../../api/youtube-health";

describe("YouTube health reconnect URL", () => {
  it("routes Re-Master OAuth back through the custom-domain return page", () => {
    expect(
      normalizeReconnectUrl(
        "https://realtyflow.chatgenius.pro/api/oauth/google?brand_id=remasterfreddy&service=youtube",
      ),
    ).toBe(
      "https://realtyflow.chatgenius.pro/api/oauth/google?brand_id=remasterfreddy&service=youtube&return_to=%2Foauth%2Fremaster-return",
    );
  });

  it("does not rewrite other brands or malformed values", () => {
    const otherBrand =
      "https://realtyflow.chatgenius.pro/api/oauth/google?brand_id=realtyflow&service=youtube";

    expect(normalizeReconnectUrl(otherBrand)).toBe(otherBrand);
    expect(normalizeReconnectUrl("not-a-url")).toBe("not-a-url");
    expect(normalizeReconnectUrl(undefined)).toBeUndefined();
  });
});
