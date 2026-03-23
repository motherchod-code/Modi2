import { Module } from '../lib/plugins.js';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import FormData from 'form-data';
import mime from 'mime-types';

// ==================== UTILS ====================

// Format file size
function formatBytes(bytes, decimals = 2) {
  if (!bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// ==================== MAIN UPLOADER ====================

Module({
  command: "url",
  package: "converter",
  description: "Upload media to URL (Catbox + fallback)",
})(async (message) => {
  let tempFilePath;

  try {
    const quotedMsg = message.quoted || message;
    const mimeType = quotedMsg.content?.mimetype || quotedMsg.type;

    if (!mimeType) {
      return message.send("_Reply to media (image/video/audio/document)_");
    }

    const supportedTypes = [
      "imageMessage",
      "videoMessage",
      "audioMessage",
      "documentMessage",
      "stickerMessage",
    ];

    if (!supportedTypes.includes(quotedMsg.type)) {
      return message.send("❌ Unsupported media type");
    }

    await message.react("⏳");
    await message.send("_Uploading... Please wait_");

    // Download media
    const mediaBuffer = await quotedMsg.download();

    if (!mediaBuffer || mediaBuffer.length === 0) {
      throw new Error("Download failed");
    }

    // Size limit (200MB)
    if (mediaBuffer.length > 200 * 1024 * 1024) {
      return message.send("❌ File too large (Max 200MB)");
    }

    // Extension detect
    const ext = mime.extension(mimeType) || "bin";
    const fileName = `file_${Date.now()}.${ext}`;

    // Temp file
    tempFilePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempFilePath, mediaBuffer);

    const form = new FormData();
    form.append("fileToUpload", fs.createReadStream(tempFilePath));
    form.append("reqtype", "fileupload");

    let mediaUrl;

    // ==================== CATBOX TRY ====================
    try {
      const res = await axios.post(
        "https://catbox.moe/user/api.php",
        form,
        { headers: form.getHeaders(), timeout: 30000 }
      );

      if (!res.data || res.data.includes("error")) {
        throw new Error("Catbox failed");
      }

      mediaUrl = res.data.trim();

    } catch (catErr) {
      console.log("Catbox failed, trying Telegraph...");

      // ==================== TELEGRAPH FALLBACK ====================
      if (quotedMsg.type === "imageMessage") {
        const tgForm = new FormData();
        tgForm.append("file", fs.createReadStream(tempFilePath));

        const tgRes = await axios.post(
          "https://telegra.ph/upload",
          tgForm,
          { headers: tgForm.getHeaders() }
        );

        if (tgRes.data && tgRes.data[0]?.src) {
          mediaUrl = "https://telegra.ph" + tgRes.data[0].src;
        } else {
          throw new Error("Both uploaders failed");
        }

      } else {
        throw new Error("Catbox failed & no fallback for this file");
      }
    }

    // Detect media type
    let mediaType = "File";
    if (quotedMsg.type === "imageMessage") mediaType = "Image";
    else if (quotedMsg.type === "videoMessage") mediaType = "Video";
    else if (quotedMsg.type === "audioMessage") mediaType = "Audio";
    else if (quotedMsg.type === "documentMessage") mediaType = "Document";
    else if (quotedMsg.type === "stickerMessage") mediaType = "Sticker";

    const fileSize = formatBytes(mediaBuffer.length);

    const msg = `
╭━━━「 *UPLOAD SUCCESS* 」━━━┈⊷
┃
┃ ✅ *${mediaType} uploaded*
┃
┃ 📊 *Details*
┃ • Size: ${fileSize}
┃ • Format: ${ext.toUpperCase()}
┃
┃ 🔗 *URL*
┃ ${mediaUrl}
┃
╰━━━━━━━━━━━━━━━━━━━┈⊷`.trim();

    await message.sendreply(msg);
    await message.react("✅");

  } catch (err) {
    console.error(err);
    await message.react("❌");
    await message.send(
      `❌ Upload Failed\n\n_${err.message || "Unknown error"}_`
    );

  } finally {
    // Always cleanup
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

// ==================== TELEGRAPH ONLY ====================

Module({
  command: "telegraph",
  package: "converter",
  description: "Upload image to Telegraph",
})(async (message) => {
  let tempFilePath;

  try {
    const quotedMsg = message.quoted || message;

    if (quotedMsg.type !== "imageMessage") {
      return message.send("_Reply to an image_");
    }

    await message.react("⏳");

    const buffer = await quotedMsg.download();
    tempFilePath = path.join(os.tmpdir(), `tg_${Date.now()}.jpg`);
    fs.writeFileSync(tempFilePath, buffer);

    const form = new FormData();
    form.append("file", fs.createReadStream(tempFilePath));

    const res = await axios.post("https://telegra.ph/upload", form, {
      headers: form.getHeaders(),
    });

    if (res.data && res.data[0]?.src) {
      const url = "https://telegra.ph" + res.data[0].src;

      await message.sendreply(`✅ Uploaded\n\n🔗 ${url}`);
      await message.react("✅");
    } else {
      throw new Error("Upload failed");
    }

  } catch (err) {
    console.error(err);
    await message.react("❌");
    await message.send("❌ Telegraph upload failed");

  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});
