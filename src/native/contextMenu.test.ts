import { describe, expect, it, vi } from "vitest";

import {
  type ContextMenuActions,
  buildContextMenuTemplate,
} from "./contextMenu";

const flags = {
  canUndo: false,
  canRedo: false,
  canCut: true,
  canCopy: true,
  canPaste: true,
  canDelete: true,
  canSelectAll: true,
  canEditRichly: false,
};

const base = {
  dictionarySuggestions: [] as string[],
  misspelledWord: "",
  isEditable: false,
  editFlags: flags,
  selectionText: "",
  linkURL: "",
  mediaType: "none" as const,
  srcURL: "",
  x: 10,
  y: 20,
};

const actions = (): ContextMenuActions => ({
  replaceMisspelling: vi.fn(),
  addToDictionary: vi.fn(),
  toggleSpellcheck: vi.fn(),
  copyText: vi.fn(),
  openExternal: vi.fn(),
  copyImageAt: vi.fn(),
  downloadUrl: vi.fn(),
});

const labels = (t: ReturnType<typeof buildContextMenuTemplate>) =>
  t.map((i) => i.role ?? i.label ?? i.type);

describe("buildContextMenuTemplate", () => {
  it("offers cut/copy/paste/select all and the spellcheck toggle in text fields", () => {
    const t = buildContextMenuTemplate(
      { ...base, isEditable: true },
      actions(),
    );

    expect(labels(t)).toEqual([
      "cut",
      "copy",
      "paste",
      "selectAll",
      "separator",
      "Toggle spellcheck",
    ]);
  });

  it("puts spelling suggestions first", () => {
    const a = actions();
    const t = buildContextMenuTemplate(
      {
        ...base,
        isEditable: true,
        misspelledWord: "helo",
        dictionarySuggestions: ["hello"],
      },
      a,
    );

    expect(labels(t).slice(0, 3)).toEqual([
      "hello",
      "Add to dictionary",
      "separator",
    ]);
    t[0].click?.(undefined as never, undefined, undefined as never);
    expect(a.replaceMisspelling).toHaveBeenCalledWith("hello");
  });

  it("offers only copy for selected text outside fields", () => {
    const t = buildContextMenuTemplate(
      { ...base, selectionText: "some text" },
      actions(),
    );

    expect(labels(t)).toEqual(["copy"]);
  });

  it("offers link actions and only opens web links externally", () => {
    const web = buildContextMenuTemplate(
      { ...base, linkURL: "https://example.com" },
      actions(),
    );
    const other = buildContextMenuTemplate(
      { ...base, linkURL: "javascript:alert(1)" },
      actions(),
    );

    expect(labels(web)).toEqual(["Copy link", "Open link in browser"]);
    expect(labels(other)).toEqual(["Copy link"]);
  });

  it("offers image actions at the clicked position", () => {
    const a = actions();
    const t = buildContextMenuTemplate(
      { ...base, mediaType: "image", srcURL: "https://cdn.example/x.png" },
      a,
    );

    expect(labels(t)).toEqual([
      "Copy image",
      "Copy image address",
      "Save image as…",
    ]);
    t[0].click?.(undefined as never, undefined, undefined as never);
    expect(a.copyImageAt).toHaveBeenCalledWith(10, 20);
  });

  it("returns an empty menu when there is nothing to offer", () => {
    expect(buildContextMenuTemplate(base, actions())).toEqual([]);
  });
});
