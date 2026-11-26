import { describe, expect, it } from "vitest";
import { AST_MODEL_ID, AST_MODEL_LICENSE, AST_MUSIC_CATEGORIES, summarizeAstEvidence } from "./browser-ast-evidence";

describe("AST independent music characteristics without automatic genres", () => {
  it("uses the documented, commercially permitted AudioSet model and exact music labels", () => {
    expect(AST_MODEL_ID).toBe("onnx-community/ast-finetuned-audioset-10-10-0.4593-ONNX");
    expect(AST_MODEL_LICENSE).toBe("BSD-3-Clause");
    expect(AST_MUSIC_CATEGORIES.genres).toContain("Rock music");
    expect(AST_MUSIC_CATEGORIES.genres).toContain("Electronic music");
    expect(AST_MUSIC_CATEGORIES.genres).toContain("Electronic dance music");
    expect(AST_MUSIC_CATEGORIES.genres).toContain("Ambient music");
    expect(AST_MUSIC_CATEGORIES.instruments).toContain("Electric guitar");
    expect(AST_MUSIC_CATEGORIES.vocals).toContain("Singing");
  });

  it("returns independent broad classes with number of sections they appeared in", () => {
    const evidence = summarizeAstEvidence([
      [{ label: "Rock music", score: .85 }, { label: "Electric guitar", score: .73 },
        { label: "Female singing", score: .65 }, { label: "Random noise", score: .5 }],
      [{ label: "Rock music", score: .75 }, { label: "Electric guitar", score: .69 },
        { label: "Electronic music", score: .55 }],
      [{ label: "Rock music", score: .8 }, { label: "Synthesizer", score: .44 },
        { label: "Female singing", score: .75 }],
    ]);
    expect(evidence.sections).toBe(3);
    expect(evidence.genres[0]).toEqual({ label: "Rock music", sections: 3, score: .8 });
    expect(evidence.genres.some(x => x.label === "Electronic music" && x.sections === 1)).toBe(true);
    expect(evidence.instruments[0].label).toBe("Electric guitar");
    expect(evidence.vocals[0].sections).toBe(2);
    expect(evidence.genres.some(x => x.label === "Random noise")).toBe(false);
  });

  it("rejects malformed or duplicate evidence rather than falsely inferring a genre", () => {
    const empty = summarizeAstEvidence([]);
    expect(empty).toEqual({ sections: 0, genres: [], instruments: [], vocals: [], observed: 0 });
    const data = summarizeAstEvidence([[{ label: "Rock music", score: .8 },
      { label: "Rock music", score: .7 }, { label: "Electronic music", score: NaN },
      { label: "Electric guitar", score: 2 }]]);
    expect(data.genres).toEqual([{ label: "Rock music", score: .8, sections: 1 }]);
    expect(data.instruments).toEqual([]);
  });
});
