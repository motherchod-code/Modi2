import { Module } from "../lib/plugins.js";
import sessionManager from "../lib/sessionManagerInstance.js";

function getRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

Module({
  command: "mreact",
})(async (message, match) => {

  if (!match) return message.send("❌ Usage:\n.mreact link 😈😐...");

  const args = match.trim().split(" ");
  const link = args.shift();
  const emojis = args;

  if (!link.includes("whatsapp.com/channel/")) {
    return message.send("❌ link vul");
  }

  if (emojis.length === 0) {
    return message.send("❌ emoji dao");
  }

  const matchLink = link.match(/channel\/([\w\d]+)\/([\w\d]+)/);
  if (!matchLink) return message.send("❌ format wrong");

  const [, channelId, messageId] = matchLink;

  let success = 0;

  for (const [id, entry] of sessionManager.sessions) {

    if (!entry.sock || entry.status !== "connected") continue;

    try {
      const randomEmoji = getRandom(emojis);

      const meta = await entry.sock.newsletterMetadata("invite", channelId);

      await entry.sock.newsletterReactMessage(
        meta.id,
        messageId,
        randomEmoji
      );

      success++;

      await new Promise(r => setTimeout(r, 300));

    } catch {}
  }

  message.send(`✅ ${success} ta session react dise`);
});
