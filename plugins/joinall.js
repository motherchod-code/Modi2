import { Module } from "../lib/plugins.js";
import { SessionManager } from "../lib/SessionManager.js";

Module({
  command: "joinall",
  desc: "All sessions join group via invite link or add by JID",
  category: "admin",
})(async (msg, args) => {
  const input = args[0];

  if (!input) {
    return msg.reply(
      `❌ Input দাও!\n\n` +
      `📌 Link দিয়ে:\n.joinall https://chat.whatsapp.com/XXX\n\n` +
      `📌 JID দিয়ে add:\n.joinall 120363xxx@g.us`
    );
  }

  const allSessions = SessionManager.getAllSessions();

  if (!allSessions || allSessions.length === 0) {
    return msg.reply("❌ কোনো active session নেই!");
  }

  await msg.reply(`🔄 ${allSessions.length}টা session process হচ্ছে...`);

  // ── Invite Link দিয়ে Join ──────────────────────────────
  if (input.includes("chat.whatsapp.com/")) {
    const inviteCode = input.split("chat.whatsapp.com/")[1]?.trim();

    if (!inviteCode) return msg.reply("❌ Invalid link!");

    let success = 0, failed = 0;
    const results = [];

    for (const { sessionId, sock } of allSessions) {
      try {
        const groupJid = await sock.groupAcceptInvite(inviteCode);
        results.push(`✅ ${sessionId}: Joined`);
        success++;
      } catch (err) {
        if (err.message?.includes("already")) {
          results.push(`⚠️ ${sessionId}: Already joined`);
        } else {
          results.push(`❌ ${sessionId}: ${err.message}`);
          failed++;
        }
      }
      await delay(1500);
    }

    return msg.reply(buildReport(success, failed, results));
  }

  // ── Group JID দিয়ে Add ─────────────────────────────────
  if (input.endsWith("@g.us")) {
    let success = 0, failed = 0;
    const results = [];

    for (const { sessionId, sock } of allSessions) {
      try {
        const userJid = sock.user?.id;
        if (!userJid) {
          results.push(`❌ ${sessionId}: JID পাওয়া যায়নি`);
          failed++;
          continue;
        }
        await sock.groupParticipantsUpdate(input, [userJid], "add");
        results.push(`✅ ${sessionId}: Added`);
        success++;
      } catch (err) {
        results.push(`❌ ${sessionId}: ${err.message}`);
        failed++;
      }
      await delay(1000);
    }

    return msg.reply(buildReport(success, failed, results));
  }

  // ── Invalid Input ──────────────────────────────────────
  return msg.reply("❌ Valid link বা Group JID দাও!");
});

// ── Helpers ────────────────────────────────────────────

function buildReport(success, failed, results) {
  return [
    `📊 *Result:*`,
    `✅ Success: ${success}`,
    `❌ Failed: ${failed}`,
    ``,
    results.join("\n"),
  ].join("\n");
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
