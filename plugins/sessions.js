import { Module } from "../lib/plugins.js";
import sessionManager from "../lib/sessionManagerInstance.js";

Module({
  command: "sessions",
  desc: "Show all session status",
})(async (message) => {
  try {
    let total = 0;
    let connected = 0;
    let starting = 0;
    let stopped = 0;

    let text = "📊 *Session Status*\n\n";

    for (const [id, entry] of sessionManager.sessions) {
      total++;

      if (entry.status === "connected") {
        connected++;
        text += `🟢 ${id}\n`;
      } else if (entry.status === "starting") {
        starting++;
        text += `🟡 ${id} (starting)\n`;
      } else {
        stopped++;
        text += `🔴 ${id} (${entry.status})\n`;
      }
    }

    text += `\n✅ Connected: ${connected}`;
    text += `\n🟡 Starting: ${starting}`;
    text += `\n🔴 Stopped: ${stopped}`;
    text += `\n📦 Total: ${total}`;

    return message.send(text);

  } catch (err) {
    console.error(err);
    message.send("❌ Error getting sessions");
  }
});
