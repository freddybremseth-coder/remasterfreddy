import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminAssets from "./AdminAssets";
import { loadImageBank, uploadImageAsset } from "./lib/admin-api";

vi.mock("./lib/admin-api", () => ({
  loadImageBank: vi.fn(),
  uploadImageAsset: vi.fn(),
  deleteImageBankEntry: vi.fn(),
}));

const loadImageBankMock = vi.mocked(loadImageBank);
const uploadImageAssetMock = vi.mocked(uploadImageAsset);

describe("AdminAssets", () => {
  beforeEach(() => {
    loadImageBankMock.mockReset();
    uploadImageAssetMock.mockReset();
    loadImageBankMock.mockResolvedValue([]);
  });

  it("opens the requested image-bank category and upload kind from an intent", async () => {
    render(<AdminAssets intent={{ kind: "thumbnail", id: 1 }} />);

    await waitFor(() => expect(loadImageBankMock).toHaveBeenCalledWith("thumbnail"));

    expect(screen.getByRole("button", { name: "Thumbnails" })).toHaveClass("active");
    expect(screen.getByRole("combobox")).toHaveValue("thumbnail");
  });

  it("updates the category and upload kind when the image-bank intent changes", async () => {
    const { rerender } = render(<AdminAssets intent={{ kind: "logo", id: 1 }} />);

    await waitFor(() => expect(loadImageBankMock).toHaveBeenCalledWith("logo"));
    expect(screen.getByRole("button", { name: "Logoer" })).toHaveClass("active");
    expect(screen.getByRole("combobox")).toHaveValue("logo");

    rerender(<AdminAssets intent={{ kind: "image", id: 2 }} />);

    await waitFor(() => expect(loadImageBankMock).toHaveBeenCalledWith("image"));
    expect(screen.getByRole("button", { name: "Bilder" })).toHaveClass("active");
    expect(screen.getByRole("combobox")).toHaveValue("image");
  });
});
