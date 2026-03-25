import axios from "axios";
import yts from "yt-search";
import { Module } from "../lib/plugins.js";

Module({
command: "play2",
package: "youtube",
description: "Play song (Parallel Fastest API + Fail Safe)",
})(async (message, match) => {
try {
if (!match) {
return message.send("❌ enter Song name\n\n.play tomake chai");
}

await message.react("🔍");  

let infoSent = false;  

// 📌 API 2 (INSTANT START - query ভিত্তিক)  
const api2Promise = axios  
  .get(  
    `https://youtube.whatsappbot027-8f0.workers.dev/music?query=${encodeURIComponent(  
      match  
    )}`,  
    { timeout: 60000 }  
  )  
  .then((res) => {  
    const data = res.data;  

    if (data?.status === "success" && data?.url) {  
      // যদি info আগে না পাঠানো হয়  
      if (!infoSent) {  
        infoSent = true;  
        message.send({  
          image: { url: data.thumbnail },  
          caption: `🎵 *Now Playing*

📌 ${data.title}
⏱️ ${data.duration}

⬇️ Downloading...`,
});
}

return {  
        url: data.url,  
        title: data.title,  
        thumbnail: data.thumbnail,  
      };  
    }  

    throw new Error("API2 invalid");  
  });  

// 🔎 yt-search (parallel)  
const searchPromise = yts(match);  

// 📌 API 1 (yt-search শেষে)  
const api1Promise = searchPromise.then(async (res) => {  
  if (!res.videos || res.videos.length === 0) {  
    throw new Error("No video found");  
  }  

  const video = res.videos[0];  

  // info send (duplicate prevent)  
  if (!infoSent) {  
    infoSent = true;  
    await message.send({  
      image: { url: video.thumbnail },  
      caption: `🎵 *Now Playing*

📌 ${video.title}
👤 ${video.author.name}
⏱️ ${video.timestamp}

⬇️ Downloading...`,
});
}

const { data } = await axios.get(  
    `https://api-aswin-sparky.koyeb.app/api/downloader/song?url=${encodeURIComponent(  
      video.url  
    )}`,  
    { timeout: 60000 }  
  );  

  if (data?.status && data?.data?.url) {  
    return {  
      url: data.data.url,  
      title: data.data.title || video.title,  
      thumbnail: video.thumbnail,  
    };  
  }  

  throw new Error("API1 invalid");  
});  

// ⚡ FASTEST RESPONSE SYSTEM  
let result;  
try {  
  result = await Promise.race([api2Promise, api1Promise]);  
} catch {  
  // 🛟 fallback (যদি race fail করে)  
  const results = await Promise.allSettled([  
    api2Promise,  
    api1Promise,  
  ]);  

  const success = results.find((r) => r.status === "fulfilled");  

  if (!success) {  
    return message.send("❌ pore abar try koro");  
  }  

  result = success.value;  
}  

// 🎧 AUDIO SEND  
await message.send({  
  audio: { url: result.url },  
  mimetype: "audio/mpeg",  
  fileName: `${result.title}.mp3`,  
  contextInfo: {  
    externalAdReply: {  
      title: result.title,  
      body: "Powered By Rabbit Xmd Mini",  
      thumbnailUrl: result.thumbnail,  
      mediaType: 2,  
    },  
  },  
});  

await message.react("🎧");

} catch (err) {
console.error("[PLAY FINAL ERROR]", err?.response?.data || err.message);
await message.send("⚠️ Play failed, abar try koro");
}
});

Eita te add korbo je boro file hole document kore asbe
  
