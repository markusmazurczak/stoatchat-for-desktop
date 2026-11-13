// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  channelPathFromTarget,
  findJoinTrigger,
  installVoiceDoubleClick,
  waitForJoinTrigger,
} from "./voiceDoubleClick";

// markup modelled on stoatchat/for-web (ServerSidebar Entry, VoiceCallCardPreview)
const sidebarLink = (path: string, icon: string) => `
  <a href="${path}"><div><span class="symbol">${icon}</span></div><span>General</span></a>`;
const callCard = (inner: string) => `
  <div id="card"><div class="ripple"></div><div class="avatars">${inner}</div>
  <span class="title">Join the voice channel</span><p>Start the call</p></div>`;

const origin = "http://localhost:3000";

beforeEach(() => {
  document.body.innerHTML = "";
  window.history.replaceState(null, "", "/");
});

describe("channelPathFromTarget", () => {
  it("detects voice channels in the channel list", () => {
    document.body.innerHTML = sidebarLink(
      "/server/S1/channel/C1",
      "headset_mic",
    );
    const target = document.querySelector("span.symbol");

    expect(channelPathFromTarget(target, origin)).toBe("/server/S1/channel/C1");
  });

  it("ignores text channels and other links", () => {
    document.body.innerHTML =
      sidebarLink("/server/S1/channel/C2", "tag") +
      sidebarLink("https://example.com/server/S/channel/C", "headset_mic");
    const [text, external] = document.querySelectorAll("span.symbol");

    expect(channelPathFromTarget(text, origin)).toBeNull();
    expect(channelPathFromTarget(external, origin)).toBeNull();
    expect(channelPathFromTarget(document.body, origin)).toBeNull();
  });
});

describe("findJoinTrigger", () => {
  it("finds the call card without participants", () => {
    document.body.innerHTML = callCard(
      '<span class="symbol">voice_chat</span>',
    );
    expect(findJoinTrigger(document)?.id).toBe("card");
  });

  it("finds the call card with participant avatars", () => {
    document.body.innerHTML = callCard('<img src="a.png"><img src="b.png">');
    expect(findJoinTrigger(document)?.id).toBe("card");
  });

  it("falls back to the header join button", () => {
    document.body.innerHTML =
      '<header><button id="join"><span class="symbol">call</span></button></header>';
    expect(findJoinTrigger(document)?.id).toBe("join");
  });

  it("ignores message embeds with a title, text and image", () => {
    document.body.innerHTML =
      '<div class="embed"><span class="title">Link title</span><p>Description</p><img src="x.png"></div>';
    expect(findJoinTrigger(document)).toBeNull();
  });

  it("finds nothing when already in the call", () => {
    document.body.innerHTML =
      '<div class="active-room"><button><span>mic</span></button></div>' +
      sidebarLink("/server/S1/channel/C1", "headset_mic");
    expect(findJoinTrigger(document)).toBeNull();
  });
});

describe("waitForJoinTrigger", () => {
  it("waits until the channel is open and the card is rendered", async () => {
    const pending = waitForJoinTrigger(document, "/server/S1/channel/C1", 1000);

    window.history.replaceState(null, "", "/server/S1/channel/C1");
    document.body.innerHTML = callCard(
      '<span class="symbol">voice_chat</span>',
    );

    expect((await pending)?.id).toBe("card");
  });

  it("gives up after the timeout", async () => {
    expect(
      await waitForJoinTrigger(document, "/server/S1/channel/C1", 50),
    ).toBeNull();
  });
});

describe("installVoiceDoubleClick", () => {
  it("joins only when enabled", async () => {
    let enabled = false;
    installVoiceDoubleClick(document, () => enabled);
    window.history.replaceState(null, "", "/server/S1/channel/C1");
    document.body.innerHTML =
      sidebarLink("/server/S1/channel/C1", "headset_mic") +
      callCard('<span class="symbol">voice_chat</span>');
    const join = vi.fn();
    document.getElementById("card")?.addEventListener("click", join);
    const target = document.querySelector("a span.symbol");

    target?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(join).not.toHaveBeenCalled();

    enabled = true;
    target?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 20));
    expect(join).toHaveBeenCalledTimes(1);
  });
});
