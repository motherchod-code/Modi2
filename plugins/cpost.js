import { Module } from "../lib/plugins.js";
import axios from "axios";
import fs from "fs";

Module({
  command: "cpost",
  aliases: ["cp"],
  fromMe: true,
  description: "Ultimate Channel Poster",
})(async (message, match) => {

  try {
    if (!match) {
      return message.send(
        "Usage:\n.cpost <channel_link> <text/url/reply>"
      );
    }

    await message.react("⏳");

    // =========================
    // PARSE INPUT
    // =========================
    const args = match.trim().split(" ");
    const link = args.shift();
    const input = args.join(" ").trim();

    // =========================
    // GET CHANNEL JID
    // =========================
    const invite = link.match(/channel\/([\w\d]+)/)?.[1];
    if (!invite) return message.send("❌ Invalid channel link");

    const meta = await message.client.newsletterMetadata("invite", invite);
    const jid = meta.id;

    // =========================
    // VARIABLES
    // =========================
    let msg = null;
    const quoted = message.quoted || null;
    const qType = quoted?.mtype || quoted?.type || null;

    const mediaTypes = [
      "imageMessage",
      "videoMessage",
      "audioMessage",
      "documentMessage",
    ];

    // =========================
    // REPLY MODE (MEDIA)
    // =========================
    if (quoted && mediaTypes.includes(qType)) {

      let buffer;
      try {
        buffer = await message.client.downloadMediaMessage(quoted);
      } catch (e) {
        console.error(e);
        return message.send("❌ Failed to download media");
      }

      if (!buffer || buffer.length === 0) {
        return message.send("❌ Empty media buffer");
      }

      if (qType === "imageMessage") {
        msg = {
          image: buffer,
          caption: input || quoted.caption || ""
        };
      }

      else if (qType === "videoMessage") {
        msg = {
          video: buffer,
          caption: input || quoted.caption || ""
        };
      }

      else if (qType === "audioMessage") {
        msg = {
          audio: buffer,
          mimetype: quoted.mimetype || "audio/mpeg",
          ptt: false
        };
      }

      else if (qType === "documentMessage") {
        msg = {
          document: buffer,
          mimetype: quoted.mimetype || "application/octet-stream",
          fileName: quoted.fileName || "file"
        };
      }
    }

    // =========================
    // REPLY MODE (TEXT)
    // =========================
    else if (quoted && quoted.text) {
      msg = {
        text: input || quoted.text
      };
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
          return message.send("❌ Failed to download URL");
        }

        // Detect type by extension
        if (url.match(/\.(jpg|jpeg|png|webp)/i)) {
          msg = { image: buffer, caption };
        }

        else if (url.match(/\.(mp4|mkv|mov)/i)) {
          msg = { video: buffer, caption };
        }

        else if (url.match(/\.(mp3|wav|ogg|m4a)/i)) {
          msg = { audio: buffer, mimetype: "audio/mpeg" };
        }

        else {
          // fallback by content-type
          const head = await axios.head(url).catch(() => null);
          const ct = head?.headers?.["content-type"] || "";

          if (ct.startsWith("image")) {
            msg = { image: buffer, caption };
          } 
          else if (ct.startsWith("video")) {
            msg = { video: buffer, caption };
          } 
          else if (ct.startsWith("audio")) {
            msg = { audio: buffer, mimetype: "audio/mpeg" };
          }
        }
      }
    }

    // =========================
    // TEXT FALLBACK
    // =========================
    if (!msg) {
      if (!input) return message.send("❌ No content to post");
      msg = { text: input };
    }

    // =========================
    // SEND TO CHANNEL 🚀
    // =========================
    try {
      await message.client.newsletterSendMessage(jid, msg);
    } catch (e) {
      console.log("Newsletter failed, trying fallback...");
      await message.client.sendMessage(jid, msg);
    }

    await message.react("✅");
    return message.send("✅ Posted to channel successfully");

  } catch (err) {
    console.error("[CPOST ERROR]", err);
    await message.react("❌");
    return message.send("❌ Error: " + err.message);
  }
});
