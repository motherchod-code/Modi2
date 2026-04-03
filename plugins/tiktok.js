import { Module } from "../lib/plugins.js";
import axios from "axios";

let tiktokCache = new Map();

Module({
  command: "tiktok",
  alias: ["tt"],
  package: "downloader",
  description: "Download TikTok video with button (David API)",
})(async (message, match) => {
  try {
    if (!match) return message.reply("❌ TikTok link dao!");

    await message.react("⏳");

    const api = `https://apis.davidcyril.name.ng/download/tiktokv3?url=${encodeURIComponent(match)}`;
    const res = await axios.get(api);
    const data = res.data;

    if (!data.success) return message.reply("❌ Video paoa jay nai!");

    const id = message.key.id;
    tiktokCache.set(id, data);

    const caption = `🎬 TikTok Downloader

👤 Author: ${data.author}
📝 Caption: ${data.description.slice(0, 80)}...

👇 Option select koro:`;

    await message.conn.sendMessage(
      message.from,
      {
        image: { url: data.thumbnail },
        caption,
        footer: "TikTok Downloader",
        buttons: [
          { buttonId: `ttvideo_${id}`, buttonText: { displayText: "📹 Video" }, type: 1 },
          { buttonId: `ttaudio_${id}`, buttonText: { displayText: "🎵 Audio" }, type: 1 }
        ],
        headerType: 4
      },
      { quoted: message }
    );

  } catch (e) {
    console.log(e);
    message.reply("❌ Error hoise!");
  }
});


// 🔘 VIDEO BUTTON
Module({
  command: "ttvideo",
  dontAddCommandList: true,
})(async (message) => {
  try {
    const btn = message.message?.buttonsResponseMessage?.selectedButtonId;
    if (!btn) return;

    const id = btn.split("_")[1];
    const data = tiktokCache.get(id);

    if (!data) return message.reply("❌ Session expired!");

    await message.conn.sendMessage(
      message.from,
      {
        video: { url: data.video },
        caption: "✅ TikTok Video Download"
      },
      { quoted: message }
    );

  } catch (e) {
    console.log(e);
  }
});


// 🔘 AUDIO BUTTON
Module({
  command: "ttaudio",
  dontAddCommandList: true,
})(async (message) => {
  try {
    const btn = message.message?.buttonsResponseMessage?.selectedButtonId;
    if (!btn) return;

    const id = btn.split("_")[1];
    const data = tiktokCache.get(id);

    if (!data) return message.reply("❌ Session expired!");

    await message.conn.sendMessage(
      message.from,
      {
        audio: { url: data.audio },
        mimetype: "audio/mp4"
      },
      { quoted: message }
    );

  } catch (e) {
    console.log(e);
  }
});
