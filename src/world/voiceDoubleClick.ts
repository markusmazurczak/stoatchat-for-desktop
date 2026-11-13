/**
 * Fork-only: optionally join a voice channel by double-clicking it in the
 * channel list. The web app (stoatchat/for-web) has no such option, so this
 * works on its DOM: a single click opens the channel as usual, the double
 * click then presses the channel's "join" control once it appears.
 *
 * Detection is language independent (Material Symbols icon names and the
 * structure of the call card). If the markup changes, nothing happens and the
 * behaviour is the same as without the option.
 */

const CHANNEL_PATH = /^\/server\/[^/]+\/channel\/[^/]+\/?$/;
const VOICE_CHANNEL_ICON = "headset_mic";
const CALL_CARD_ICON = "voice_chat";
const HEADER_JOIN_ICON = "call";
export const JOIN_TIMEOUT_MS = 3000;

function leafTexts(root: Element) {
  return [...root.querySelectorAll("*")]
    .filter((node) => node.childElementCount === 0)
    .map((node) => ({ node, text: node.textContent?.trim() ?? "" }));
}

/**
 * Path of the voice channel link that was double-clicked, or null if the
 * target is not a voice channel in the channel list.
 */
export function channelPathFromTarget(
  target: EventTarget | null,
  origin: string,
): string | null {
  if (!(target instanceof Element)) return null;
  const link = target.closest("a[href]");
  if (!link) return null;

  let url: URL;
  try {
    url = new URL(link.getAttribute("href") ?? "", origin);
  } catch {
    return null;
  }
  if (url.origin !== origin || !CHANNEL_PATH.test(url.pathname)) return null;

  const isVoice = leafTexts(link).some(
    ({ text }) => text === VOICE_CHANNEL_ICON,
  );
  return isVoice ? url.pathname.replace(/\/$/, "") : null;
}

/**
 * The call card preview has exactly this shape:
 * [ripple, avatars or voice_chat icon, title, subtext <p>].
 * Matching the full shape avoids clicking message embeds in the voice
 * channel's chat, which can also contain a title, text and images.
 */
function isCallCard(element: Element) {
  const children = [...element.children];
  if (children.length !== 4) return false;
  if (!children[2].classList.contains("title")) return false;
  if (children[3].tagName !== "P") return false;

  const avatars = children[1];
  return (
    !!avatars.querySelector("img") ||
    leafTexts(avatars).some(({ text }) => text === CALL_CARD_ICON) ||
    avatars.textContent?.trim() === CALL_CARD_ICON
  );
}

/**
 * The control that joins the open voice channel: the call card preview, or
 * the join button in the channel header. Elements inside links (the channel
 * list) are ignored.
 */
export function findJoinTrigger(root: ParentNode): HTMLElement | null {
  const elements = [...root.querySelectorAll<HTMLElement>("*")].filter(
    (element) => !element.closest("a[href]"),
  );

  const card = elements.find(isCallCard);
  if (card) return card;

  for (const element of elements) {
    if (
      element.childElementCount === 0 &&
      element.textContent?.trim() === HEADER_JOIN_ICON
    ) {
      const button = element.closest<HTMLElement>("button, [role=button]");
      if (button) return button;
    }
  }
  return null;
}

/**
 * Wait until the channel is open and its join control exists.
 */
export function waitForJoinTrigger(
  doc: Document,
  path: string,
  timeoutMs = JOIN_TIMEOUT_MS,
): Promise<HTMLElement | null> {
  const ready = () =>
    doc.location.pathname.replace(/\/$/, "") === path
      ? findJoinTrigger(doc)
      : null;

  return new Promise((resolve) => {
    const immediate = ready();
    if (immediate) return resolve(immediate);

    const observer = new MutationObserver(() => {
      const trigger = ready();
      if (trigger) finish(trigger);
    });
    const timer = setTimeout(() => finish(null), timeoutMs);
    function finish(result: HTMLElement | null) {
      observer.disconnect();
      clearTimeout(timer);
      resolve(result);
    }
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  });
}

/**
 * Listen for double clicks on voice channels while the option is enabled.
 */
export function installVoiceDoubleClick(
  doc: Document,
  isEnabled: () => boolean,
) {
  let pending = false;

  doc.addEventListener(
    "dblclick",
    (event) => {
      if (!isEnabled() || pending) return;
      const path = channelPathFromTarget(event.target, doc.location.origin);
      if (!path) return;

      pending = true;
      waitForJoinTrigger(doc, path)
        .then((trigger) => trigger?.click())
        .finally(() => {
          pending = false;
        });
    },
    true,
  );
}
