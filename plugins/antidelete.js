// plugins/antidelete.js
// ── Based on actual serialize.js + plugins.js structure ──────────────────────
//
// KEY FACTS from serialize.js:
//   • message._sessionId  ← session ID (NOT message.sessionId)
//   • message.conn        ← Baileys sock
//   • message.raw         ← original Baileys msg (auto-deleted after 5s!)
//   • message.type        ← content type string (e.g. "imageMessage")
//   • message.sender      ← sender JID
//   • message.from        ← chat/group JID
//   • message.isGroup     ← boolean
//   • message.isFromMe    ← boolean
//   • message.body        ← text body
//   • message.send()      ← send to same chat
//   • message.conn.sendMessage(jid, content) ← send anywhere
// ─────────────────────────────────────────────────────────────────────────────

import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";

// ── Message cache ─────────────────────────────────────────────────────────────
// Raw is saved here IMMEDIATELY (before the 5s serialize.js cleanup fires).
// TTL: 10 minutes — enough to catch delayed deletes.

const msgCache = new Map(); // msgId → CachedMsg
const CACHE_TTL_MS = 10 * 60 * 1000;

// Prune stale entries every 3 minutes
setInterval(() => {
  const cutoff = Date.now() - CACHE_TTL_MS;
  for (const [id, e] of msgCache) {
    if (e.cachedAt < cutoff) msgCache.delete(id);
  }
}, 3 * 60_000).unref?.();

// ── DB key helpers ────────────────────────────────────────────────────────────

const cfgKey = (groupJid) => `antidelete:${groupJid}`;

// ── Target builder ────────────────────────────────────────────────────────────

function buildTargets(cfg, groupJid, botJid) {
  const t = [];
  if (cfg.sendGroup) t.push(groupJid);
  if (cfg.sendPrivate && botJid) t.push(botJid);
  if (cfg.sendCustom) t.push(cfg.sendCustom);
  return [...new Set(t)]; // deduplicate
}

function getBotJid(conn) {
  const raw = conn?.user?.id || "";
  // Baileys format: "1234567890:42@s.whatsapp.net" → "1234567890@s.whatsapp.net"
  return raw.includes(":") ? raw.split(":")[0] + "@s.whatsapp.net" : raw;
}

// ── Detect message type ───────────────────────────────────────────────────────

const TYPE_EMOJI = {
  conversation: "💬",
  extendedTextMessage: "💬",
  imageMessage: "🖼️",
  videoMessage: "🎥",
  audioMessage: "🎵",
  documentMessage: "📄",
  documentWithCaptionMessage: "📄",
  stickerMessage: "🎭",
};

function typeLabel(type) {
  if (!type) return "Message";
  if (type.includes("image")) return "Image";
  if (type.includes("video")) return "Video";
  if (type.includes("audio")) return "Audio";
  if (type.includes("document")) return "Document";
  if (type.includes("sticker")) return "Sticker";
  if (type.includes("Text") || type === "conversation") return "Text";
  return "Message";
}

// ── Forward deleted message ───────────────────────────────────────────────────

async function forwardDeleted(cached, targets) {
  const conn = cached.conn;
  if (!conn) return;

  const senderNum = String(cached.sender || "").split("@")[0];
  const emoji = TYPE_EMOJI[cached.type] || "📩";
  const label = typeLabel(cached.type);

  const header =
    `*╔══ 🗑️ AntiDelete ══╗*\n` +
    `*│ ${emoji} Type    :* ${label}\n` +
    `*│ 👤 Sender  :* @${senderNum}\n` +
    `*│ 👥 Group   :* ${cached.groupName || "Unknown"}\n` +
    `*╚════════════════╝*`;

  for (const target of targets) {
    try {
      // 1. Send header with mention
      await conn.sendMessage(target, {
        text: header,
        mentions: cached.sender ? [cached.sender] : [],
      });

      // 2. Forward the original raw Baileys message
      await conn.sendMessage(target, {
        forward: cached.rawMsg,
        force: true,
      });
    } catch (err) {
      console.error("[antidelete] forward failed →", target, err?.message);
    }
  }
}

// ── .antidelete command ───────────────────────────────────────────────────────

Module({
  command: "antidelete",
  package: "owner",
  description:
    "Control antidelete. Usage: .antidelete on | off | group | private | <number>",
})(async (message, match) => {
  try {
    // owner-only
    if (!message.isFromMe && !message.isfromMe) {
      return message.send("_Only bot owner can use this command._");
    }
    if (!message.isGroup) {
      return message.send("❌ This command works only inside groups.");
    }

    const sessionId = message._sessionId; // ← correct property from serialize.js
    const groupJid = message.from;
    const raw = String(match || "").trim().toLowerCase();
    const key = cfgKey(groupJid);

    let cfg = db.get(sessionId, key, {}) || {};

    // ── Show status ──────────────────────────────────────────────────────────
    if (!raw) {
      const botJid = getBotJid(message.conn);
      const targets = buildTargets(cfg, groupJid, botJid);
      return message.send(
        `*⚙️ AntiDelete Status*\n\n` +
          `• Enabled     : ${cfg.enabled ? "✅ ON" : "❌ OFF"}\n` +
          `• Same group  : ${cfg.sendGroup ? "✅" : "❌"}\n` +
          `• Bot private : ${cfg.sendPrivate ? "✅" : "❌"}\n` +
          `• Custom JID  : ${cfg.sendCustom || "❌ not set"}\n\n` +
          `*Commands:*\n` +
          `.antidelete on\n` +
          `.antidelete off\n` +
          `.antidelete group    ← toggle same-group\n` +
          `.antidelete private  ← toggle bot DM\n` +
          `.antidelete <number> ← set custom target`
      );
    }

    // ── ON ───────────────────────────────────────────────────────────────────
    if (raw === "on") {
      cfg.enabled = true;
      // Default target if none set
      if (!cfg.sendGroup && !cfg.sendPrivate && !cfg.sendCustom) {
        cfg.sendGroup = true;
      }
      db.setHot(sessionId, key, cfg);
      const targets = buildTargets(cfg, groupJid, getBotJid(message.conn));
      return message.send(
        `✅ AntiDelete *ENABLED*\n📤 Sending to: *${targets.join(" + ")}*`
      );
    }

    // ── OFF ──────────────────────────────────────────────────────────────────
    if (raw === "off") {
      cfg.enabled = false;
      db.setHot(sessionId, key, cfg);
      return message.send("✅ AntiDelete *DISABLED* for this group.");
    }

    // ── Toggle group ─────────────────────────────────────────────────────────
    if (raw === "group") {
      cfg.enabled = true;
      cfg.sendGroup = !cfg.sendGroup;
      db.setHot(sessionId, key, cfg);
      return message.send(
        `✅ Same-group forwarding: *${cfg.sendGroup ? "ON ✅" : "OFF ❌"}*`
      );
    }

    // ── Toggle private ───────────────────────────────────────────────────────
    if (raw === "private") {
      cfg.enabled = true;
      cfg.sendPrivate = !cfg.sendPrivate;
      db.setHot(sessionId, key, cfg);
      return message.send(
        `✅ Bot DM forwarding: *${cfg.sendPrivate ? "ON ✅" : "OFF ❌"}*`
      );
    }

    // ── Custom number/JID ────────────────────────────────────────────────────
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 7) {
      const customJid = digits + "@s.whatsapp.net";
      cfg.enabled = true;
      cfg.sendCustom = customJid;
      db.setHot(sessionId, key, cfg);
      return message.send(`✅ Custom target set to *+${digits}*`);
    }

    return message.send(
      "❓ Unknown option.\nUse: on | off | group | private | <number>"
    );
  } catch (err) {
    console.error("[antidelete][cmd] error:", err?.message || err);
    return message.send("❌ An error occurred.");
  }
});

// ── Cache handler — runs on EVERY incoming message ────────────────────────────
// ⚠️ CRITICAL: message.raw is deleted after 5s by serialize.js CLEANUP_MS.
// We copy the raw Baileys object here immediately so it survives.

Module({
  on: "text",
  package: "antidelete-cache",
  description: "Cache messages for antidelete recovery",
})(async (message) => {
  try {
    if (!message?.key?.id) return;
    if (message.from === "status@broadcast") return;

    // Skip protocol messages (delete signals) and reactions
    if (message.type === "protocolMessage") return;
    if (message.type === "reactionMessage") return;

    // message.raw will be cleaned up after 5s — copy it NOW
    const rawMsg = message.raw || message.mek || null;
    if (!rawMsg) return;

    msgCache.set(message.key.id, {
      rawMsg,                                          // ← full Baileys message
      type: message.type || "conversation",
      body: message.body || "",
      from: message.from,
      sender: message.sender,
      groupName: message.groupMetadata?.subject || "", // populated after loadGroupInfo
      conn: message.conn,                              // ← Baileys sock
      sessionId: message._sessionId,                  // ← correct property
      cachedAt: Date.now(),
    });
  } catch {
    // Never crash the message pipeline
  }
});

// ── Delete detector — watches for protocolMessage type=0 (REVOKE) ─────────────
// When someone deletes a message, WhatsApp sends a protocolMessage (type=0)
// containing the key of the deleted message. This arrives via messages.upsert
// and lands here as a text plugin with message.type === "protocolMessage".

Module({
  on: "text",
  package: "antidelete-detect",
  description: "Detect and forward deleted messages",
})(async (message) => {
  try {
    // Only handle protocol messages
    if (message.type !== "protocolMessage") return;

    // Access raw — proto messages arrive instantly so raw should still exist
    const rawMsg = message.raw || message.mek;
    const proto = rawMsg?.message?.protocolMessage;

    // type 0 = REVOKE (message deletion)
    if (!proto || proto.type !== 0) return;

    const deletedKey = proto.key;
    if (!deletedKey?.id) return;

    const sessionId = message._sessionId;
    const groupJid = message.from;

    // ── Check antidelete config for this group ────────────────────────────
    const cfg = db.get(sessionId, cfgKey(groupJid), {}) || {};
    if (!cfg.enabled) return;

    // ── Look up cached original message ───────────────────────────────────
    const cached = msgCache.get(deletedKey.id);
    if (!cached) {
      // Message arrived before bot started, or 10min TTL expired
      console.debug("[antidelete] cache miss for id:", deletedKey.id);
      return;
    }

    // ── Build target list ─────────────────────────────────────────────────
    const botJid = getBotJid(message.conn);
    const targets = buildTargets(cfg, groupJid, botJid);
    if (!targets.length) return;

    // ── Forward ───────────────────────────────────────────────────────────
    await forwardDeleted(cached, targets);

    // Remove from cache after successful forward
    msgCache.delete(deletedKey.id);
  } catch (err) {
    console.error("[antidelete][detect] error:", err?.message || err);
  }
});
      
