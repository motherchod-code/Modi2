import { Module } from "../lib/plugins.js";
import axios from "axios";

Module({
  command: "cpost",
  aliases: ["cp"],
  fromMe: true,
  description: "Channel post",
})(async (message, match) => {
  try {
    if (!match) {
      return message.send("Usage: .cpost <channel_link> <text/url/reply>");
    }

    await message.react("⌛");

    const args = match.trim().split(" ");
    const link = args.shift();
    const input = args.join(" ");

    // Extract channel ID
    const id = link.match(/channel\/([\w\d]+)/)?.[1];
    if (!id) return message.send("Invalid channel link");

    // Get real JID
    const meta = await message.client.newsletterMetadata("invite", id);
    const jid = meta.id;

    let msg = null;

    // =========================
    // REPLY MODE
    // =========================
    if (message.reply_message) {
      const quoted = message.reply_message;

      const mimetype =
        quoted.mimetype ||
        quoted.message?.imageMessage?.mimetype ||
        quoted.message?.audioMessage?.mimetype ||
        quoted.message?.videoMessage?.mimetype ||
        "";

      // ✅ quoted.download() দিয়ে buffer নাও
      const buffer = await quoted.download();

      // IMAGE
      if (mimetype.startsWith("image") || quoted.message?.imageMessage) {
        msg = {
          image: buffer,
          caption: input || quoted.text || ""
        };
      }

      // AUDIO / SONG
      else if (mimetype.startsWith("audio") || quoted.message?.audioMessage) {
        msg = {
          audio: buffer,
          mimetype: "audio/mpeg",
          ptt: false
        };
      }

      // VIDEO
      else if (mimetype.startsWith("video") || quoted.message?.videoMessage) {
        msg = {
          video: buffer,
          caption: input || quoted.text || ""
        };
      }

      // TEXT
      else if (quoted.text) {
        msg = {
          text: input || quoted.text
        };
      }

      if (!msg) return message.send("Unsupported message type in reply");
    }

    // =========================
    // URL MODE
    // =========================
    if (!msg && input.includes("http")) {
      const url = input.match(/https?:\/\/\S+/)?.[0];
      if (url) {
        const caption = input.replace(url, "").trim();

        let buffer;
        try {
          const res = await axios.get(url, {
            responseType: "arraybuffer",
            headers: { "User-Agent": "Mozilla/5.0" }
          });
          buffer = Buffer.from(res.data);
        } catch {
          return message.send("Failed to download from URL");
        }

        // IMAGE
        if (url.match(/\.(jpg|jpeg|png|webp)/i)) {
          msg = { image: buffer, caption: caption || "" };
        }

        // AUDIO
        else if (url.match(/\.(mp3|wav|m4a|ogg)/i)) {
          msg = { audio: buffer, mimetype: "audio/mpeg", ptt: false };
        }

        // VIDEO
        else if (url.match(/\.(mp4|mkv|mov)/i)) {
          msg = { video: buffer, caption: caption || "" };
        }

        // Extension না থাকলে Content-Type দিয়ে চেক
        else {
          const res2 = await axios.head(url, {
            headers: { "User-Agent": "Mozilla/5.0" }
          }).catch(() => null);
          const ct = res2?.headers?.["content-type"] || "";

          if (ct.startsWith("image")) {
            msg = { image: buffer, caption: caption || "" };
          } else if (ct.startsWith("audio")) {
            msg = { audio: buffer, mimetype: "audio/mpeg", ptt: false };
          } else if (ct.startsWith("video")) {
            msg = { video: buffer, caption: caption || "" };
          }
        }
      }
    }

    // =========================
    // TEXT FALLBACK
    // =========================
    if (!msg) {
      if (!input) return message.send("No content to post");
      msg = { text: input };
    }

    // =========================
    // SEND (with fallback)
    // =========================
    try {
      await message.client.newsletterSendMessage(jid, msg);
    } catch {
      await message.client.sendMessage(jid, msg);
    }

    await message.react("✅");
    return message.send("Channel post sent successfully");

  } catch (err) {
    console.error("[CPOST ERROR]", err);
    await message.react("❌");
    return message.send(`Failed: ${err.message}`);
  }
});
