import type { ContextMenuParams, MenuItemConstructorOptions } from "electron";

export type ContextMenuActions = {
  replaceMisspelling(suggestion: string): void;
  addToDictionary(word: string): void;
  toggleSpellcheck(): void;
  copyText(text: string): void;
  openExternal(url: string): void;
  copyImageAt(x: number, y: number): void;
  downloadUrl(url: string): void;
};

type Params = Pick<
  ContextMenuParams,
  | "dictionarySuggestions"
  | "misspelledWord"
  | "isEditable"
  | "editFlags"
  | "selectionText"
  | "linkURL"
  | "mediaType"
  | "srcURL"
  | "x"
  | "y"
>;

const isWebUrl = (url: string) => /^https?:\/\//i.test(url);

function spellcheckItems(
  params: Params,
  actions: ContextMenuActions,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = params.dictionarySuggestions.map(
    (suggestion) => ({
      label: suggestion,
      click: () => actions.replaceMisspelling(suggestion),
    }),
  );

  if (params.misspelledWord) {
    items.push({
      label: "Add to dictionary",
      click: () => actions.addToDictionary(params.misspelledWord),
    });
  }

  return items;
}

function editItems(params: Params): MenuItemConstructorOptions[] {
  const { editFlags } = params;
  const hasSelection = params.selectionText.trim().length > 0;

  if (params.isEditable) {
    return [
      { role: "cut", enabled: editFlags.canCut },
      { role: "copy", enabled: editFlags.canCopy },
      { role: "paste", enabled: editFlags.canPaste },
      { role: "selectAll", enabled: editFlags.canSelectAll },
    ];
  }

  return hasSelection ? [{ role: "copy", enabled: editFlags.canCopy }] : [];
}

function linkItems(
  params: Params,
  actions: ContextMenuActions,
): MenuItemConstructorOptions[] {
  if (!params.linkURL) return [];

  const items: MenuItemConstructorOptions[] = [
    { label: "Copy link", click: () => actions.copyText(params.linkURL) },
  ];
  if (isWebUrl(params.linkURL)) {
    items.push({
      label: "Open link in browser",
      click: () => actions.openExternal(params.linkURL),
    });
  }
  return items;
}

function imageItems(
  params: Params,
  actions: ContextMenuActions,
): MenuItemConstructorOptions[] {
  if (params.mediaType !== "image" || !params.srcURL) return [];

  const items: MenuItemConstructorOptions[] = [
    {
      label: "Copy image",
      click: () => actions.copyImageAt(params.x, params.y),
    },
    {
      label: "Copy image address",
      click: () => actions.copyText(params.srcURL),
    },
  ];
  if (isWebUrl(params.srcURL)) {
    items.push({
      label: "Save image as…",
      click: () => actions.downloadUrl(params.srcURL),
    });
  }
  return items;
}

/**
 * Build the context menu from what was right-clicked: spelling suggestions,
 * edit actions (cut/copy/paste), link and image actions, and the spellcheck
 * toggle for editable fields. Empty groups are dropped, groups are separated.
 */
export function buildContextMenuTemplate(
  params: Params,
  actions: ContextMenuActions,
): MenuItemConstructorOptions[] {
  const groups = [
    spellcheckItems(params, actions),
    editItems(params),
    linkItems(params, actions),
    imageItems(params, actions),
    params.isEditable
      ? [
          {
            label: "Toggle spellcheck",
            click: () => actions.toggleSpellcheck(),
          },
        ]
      : [],
  ].filter((group) => group.length > 0);

  return groups.flatMap((group, index) =>
    index === 0 ? group : [{ type: "separator" as const }, ...group],
  );
}
