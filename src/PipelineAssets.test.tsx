import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PipelineAssets from "./PipelineAssets";
import { AdminImage, loadImageBank, PipelineOptions } from "./lib/admin-api";

vi.mock("./lib/admin-api", () => ({
  loadImageBank: vi.fn(),
}));

const loadImageBankMock = vi.mocked(loadImageBank);

function image(overrides: Partial<AdminImage>): AdminImage {
  return {
    id: overrides.id || "asset-1",
    url: overrides.url || "https://cdn.example.com/asset.jpg",
    name: overrides.name || "Asset",
    kind: overrides.kind || "image",
    thumbnail_url: overrides.thumbnail_url ?? null,
  };
}

function renderAssets(value: PipelineOptions = {}, onOpenImageBank = vi.fn()) {
  const onChange = vi.fn();
  const result = render(
    <PipelineAssets value={value} onChange={onChange} onOpenImageBank={onOpenImageBank} />,
  );
  return { ...result, onChange, onOpenImageBank };
}

describe("PipelineAssets", () => {
  beforeEach(() => {
    loadImageBankMock.mockReset();
  });

  it("shows empty states, default selections, and image-bank links when no assets exist", async () => {
    loadImageBankMock.mockResolvedValue([]);
    const { onOpenImageBank } = renderAssets();

    expect(await screen.findByText("Ingen logoer er lastet opp")).toBeInTheDocument();
    expect(screen.getByText("Ingen egne thumbnails er lastet opp")).toBeInTheDocument();
    expect(screen.getByText("Ingen slideshow-bilder er lastet opp")).toBeInTheDocument();
    expect(screen.getByText("0 slideshow-bilder")).toBeInTheDocument();
    expect(screen.getByText("0 logoer")).toBeInTheDocument();
    expect(screen.getByText("0 thumbnails")).toBeInTheDocument();

    expect(screen.getByRole("combobox", { name: "Logo" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Thumbnail" })).toHaveValue("");
    expect(screen.getByRole("option", { name: "Ingen egen logo" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "AI-generert thumbnail" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gå til Bildebank og last opp logo" }));
    fireEvent.click(screen.getByRole("button", { name: "Gå til Bildebank og last opp thumbnail" }));
    fireEvent.click(screen.getByRole("button", { name: "Gå til Bildebank og last opp bilder" }));

    expect(onOpenImageBank).toHaveBeenNthCalledWith(1, "logo");
    expect(onOpenImageBank).toHaveBeenNthCalledWith(2, "thumbnail");
    expect(onOpenImageBank).toHaveBeenNthCalledWith(3, "image");
  });

  it("filters image, logo, and thumbnail assets into the correct controls", async () => {
    loadImageBankMock.mockResolvedValue([
      image({ id: "slide-1", kind: "image", name: "Slide A", url: "https://cdn.example.com/slide-a.jpg" }),
      image({ id: "logo-1", kind: "logo", name: "Logo A", url: "https://cdn.example.com/logo-a.png" }),
      image({
        id: "thumb-1",
        kind: "thumbnail",
        name: "Thumbnail A",
        url: "https://cdn.example.com/thumb-a.jpg",
      }),
    ]);

    renderAssets();

    expect(await screen.findByText("1 slideshow-bilder")).toBeInTheDocument();
    expect(screen.getByText("1 logoer")).toBeInTheDocument();
    expect(screen.getByText("1 thumbnails")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Logo A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Thumbnail A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Slide A/ })).toBeInTheDocument();

    const logoSelect = screen.getByRole("combobox", { name: "Logo" });
    const thumbnailSelect = screen.getByRole("combobox", { name: "Thumbnail" });

    expect(within(logoSelect).queryByRole("option", { name: "Thumbnail A" })).not.toBeInTheDocument();
    expect(within(thumbnailSelect).queryByRole("option", { name: "Logo A" })).not.toBeInTheDocument();
  });

  it("renders previews for the selected logo and selected thumbnail", async () => {
    loadImageBankMock.mockResolvedValue([
      image({
        id: "logo-1",
        kind: "logo",
        name: "Re-Master logo",
        url: "https://cdn.example.com/logo.png",
        thumbnail_url: "https://cdn.example.com/logo-preview.png",
      }),
      image({
        id: "thumb-1",
        kind: "thumbnail",
        name: "Midnight thumbnail",
        url: "https://cdn.example.com/thumb.jpg",
        thumbnail_url: "https://cdn.example.com/thumb-preview.jpg",
      }),
    ]);

    renderAssets({
      logoUrl: "https://cdn.example.com/logo.png",
      customThumbnailUrl: "https://cdn.example.com/thumb.jpg",
    });

    const logoPreview = await screen.findByAltText("Re-Master logo");
    const thumbnailPreview = screen.getByAltText("Midnight thumbnail");

    expect(logoPreview).toHaveAttribute("src", "https://cdn.example.com/logo-preview.png");
    expect(thumbnailPreview).toHaveAttribute("src", "https://cdn.example.com/thumb-preview.jpg");
  });

  it("refetches assets when the refresh token changes", async () => {
    loadImageBankMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        image({ id: "logo-1", kind: "logo", name: "Fresh logo", url: "https://cdn.example.com/fresh.png" }),
      ]);

    const onChange = vi.fn();
    const onOpenImageBank = vi.fn();
    const { rerender } = render(
      <PipelineAssets value={{}} onChange={onChange} refreshToken={0} onOpenImageBank={onOpenImageBank} />,
    );

    expect(await screen.findByText("0 logoer")).toBeInTheDocument();

    rerender(<PipelineAssets value={{}} onChange={onChange} refreshToken={1} onOpenImageBank={onOpenImageBank} />);

    await waitFor(() => expect(loadImageBankMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("1 logoer")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Fresh logo" })).toBeInTheDocument();
  });
});
