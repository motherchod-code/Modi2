// plugins/welcome-goodbye.js
import { Module } from "../lib/plugins.js";
import { db } from "../lib/client.js";
import { WELCOME_TEXTS, GOODBYE_TEXTS, pickRandom } from "./bin/text.js";
import axios from "axios";
import { jidNormalizedUser } from "@whiskeysockets/baileys";

const DEFAULT_GOODBYE = pickRandom(GOODBYE_TEXTS);
const DEFAULT_WELCOME = pickRandom(WELCOME_TEXTS);

/* ---------------- helpers ---------------- */
function toBool(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0) return false;
  if (typeof v === "string")
    return ["true", "1", "yes", "on"].includes(v.toLowerCase());
  return Boolean(v);
}

function buildText(template = "", replacements = {}) {
  let text = template || "";
  const wantsPp = text.includes("&pp");
  text = text.replace(/&pp/g, "").trim();
  text = text.replace(/&mention/g, replacements.mentionText || "");
  text = text.replace(/&name/g, replacements.name || "");
  text = text.replace(/&size/g, String(replacements.size ?? ""));
  return { text, wantsPp };
}

async function fetchProfileBuffer(conn, jid) {
  try {
    const url = await conn.profilePictureUrl(jid, "image").catch(() => null);
    if (!url) return null;
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 20000,
    });
    return Buffer.from(res.data);
  } catch {
    return null;
  }
}

async function sendMsg(conn, jid, text, mentions = [], img = null) {
  try {
    if (img) {
      await conn.sendMessage(jid, {
        image: img,
        caption: text,
        mentions,
      });
    } else {
      await conn.sendMessage(jid, { text, mentions });
    }
  } catch {
    await conn.sendMessage(jid, { text });
  }
}

/* 🔐 PERMISSION CHECK (Admin + Owner) */
async function isAllowed(message, groupJid) {
  const sender = message.sender || message.key?.participant || "";
  const metadata = await message.conn.groupMetadata(groupJid);

  const admins = metadata.participants
    .filter((p) => p.admin !== null)
    .map((p) => p.id);

  const isAdmin = admins.includes(sender);

  const botNumber =
    message.conn?.user?.id?.split(":")[0] + "@s.whatsapp.net";

  const isOwner = sender === botNumber;

  return isAdmin || isOwner;
}

/* ---------------- COMMANDS ---------------- */

// ✅ WELCOME
Module({ command: "welcome", package: "group" })(
  async (message, match) => {
    const groupJid = message.from;
    if (!groupJid?.includes("@g.us"))
      return message.send("❌ Group only command");

    if (!(await isAllowed(message, groupJid)))
      return message.send("❌ Admin/Owner only");

    const raw = (match || "").trim().toLowerCase();
    const botNumber =
      message.conn?.user?.id?.split(":")[0] || "bot";

    const key = `group:${groupJid}:welcome`;

    if (!raw) {
      const cfg = await db.getAsync(botNumber, key, null);
      const status = cfg ? toBool(cfg.status) : false;
      return message.send(`Welcome is ${status ? "✅ ON" : "❌ OFF"}`);
    }

    if (!["on", "off"].includes(raw))
      return message.send("Use on/off");

    await db.set(botNumber, key, { status: raw === "on" });

    return message.send(
      raw === "on" ? "✅ Welcome ON" : "❌ Welcome OFF"
    );
  }
);

// ✅ GOODBYE
Module({ command: "goodbye", package: "group" })(
  async (message, match) => {
    const groupJid = message.from;
    if (!groupJid?.includes("@g.us"))
      return message.send("❌ Group only command");

    if (!(await isAllowed(message, groupJid)))
      return message.send("❌ Admin/Owner only");

    const raw = (match || "").trim().toLowerCase();
    const botNumber =
      message.conn?.user?.id?.split(":")[0] || "bot";

    const key = `group:${groupJid}:goodbye`;

    if (!raw) {
      const cfg = await db.getAsync(botNumber, key, null);
      const status = cfg ? toBool(cfg.status) : false;
      return message.send(`Goodbye is ${status ? "✅ ON" : "❌ OFF"}`);
    }

    if (!["on", "off"].includes(raw))
      return message.send("Use on/off");

    await db.set(botNumber, key, { status: raw === "on" });

    return message.send(
      raw === "on" ? "✅ Goodbye ON" : "❌ Goodbye OFF"
    );
  }
);

// ✅ PDM (Promote/Demote)
Module({ command: "pdm", package: "group" })(
  async (message, match) => {
    const groupJid = message.from;
    if (!groupJid?.includes("@g.us"))
      return message.send("❌ Group only command");

    if (!(await isAllowed(message, groupJid)))
      return message.send("❌ Admin/Owner only");

    const raw = (match || "").trim().toLowerCase();
    const botNumber =
      message.conn?.user?.id?.split(":")[0] || "bot";

    const key = `group:${groupJid}:adminmsg`;

    if (!raw) {
      const cfg = await db.getAsync(botNumber, key, null);
      const status = cfg ? toBool(cfg.status) : false;
      return message.send(`PDM is ${status ? "✅ ON" : "❌ OFF"}`);
    }

    if (!["on", "off"].includes(raw))
      return message.send("Use on/off");

    await db.set(botNumber, key, { status: raw === "on" });

    return message.send(
      raw === "on" ? "✅ PDM ON" : "❌ PDM OFF"
    );
  }
);

/* ---------------- EVENTS ---------------- */

Module({ on: "group-participants.update" })(
  async (_, event, conn) => {
    if (!event?.id) return;

    const groupJid = event.id;
    const botNumber =
      conn?.user?.id?.split(":")[0] || "bot";

    for (const p of event.participants) {
      const user = jidNormalizedUser(p);

      // 🔹 WELCOME
      if (["add", "invite"].includes(event.action)) {
        const cfg = await db.getAsync(
          botNumber,
          `group:${groupJid}:welcome`,
          null
        );
        if (!cfg || !cfg.status) continue;

        const text = `👋 Welcome @${user.split("@")[0]}`;
        await sendMsg(conn, groupJid, text, [user]);
      }

      // 🔹 GOODBYE
      if (["remove"].includes(event.action)) {
        const cfg = await db.getAsync(
          botNumber,
          `group:${groupJid}:goodbye`,
          null
        );
        if (!cfg || !cfg.status) continue;

        const text = `👋 Goodbye @${user.split("@")[0]}`;
        await sendMsg(conn, groupJid, text, [user]);
      }

      // 🔹 PDM
      if (["promote", "demote"].includes(event.action)) {
        const cfg = await db.getAsync(
          botNumber,
          `group:${groupJid}:adminmsg`,
          null
        );
        if (!cfg || !cfg.status) continue;

        const action =
          event.action === "promote" ? "promoted" : "demoted";

        const text = `👑 @${user.split("@")[0]} ${action}`;
        await sendMsg(conn, groupJid, text, [user]);
      }
    }
  }
);
