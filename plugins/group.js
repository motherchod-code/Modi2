import { Module } from "../lib/plugins.js";
import { getTheme } from "../Themes/themes.js";
import {
  generateWAMessageContent,
  generateMessageID,
} from "@whiskeysockets/baileys";
const theme = getTheme();

// ==================== HELPER FUNCTIONS ====================
const extractJid = (message) => {
  // Check quoted message first
  if (message.quoted?.participant) return message.quoted.participant;
  if (message.quoted?.sender) return message.quoted.sender;

  // Check mentions
  if (message.mentions?.[0]) return message.mentions[0];

  // Extract from text with improved number parsing
  const text = message.body.split(" ").slice(1).join(" ").trim();
  const number = text.replace(/[^0-9]/g, "");

  if (number) {
    // Add country code if missing
    const normalized = number.startsWith("1") ? number : number;
    return `${normalized}@s.whatsapp.net`;
  }

  return null;
};

/**
 * Check permissions for group commands
 * ✅ FIXED: Enhanced permission checks with better error handling
 */
const checkPermissions = async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) {
      await message.send(theme.isGroup || "_This command is only for groups_");
      return false;
    }

    if (!message.isAdmin && !message.isfromMe) {
      await message.send(
        theme.isAdmin || " _This command requires admin privileges_"
      );
      return false;
    }

    if (!message.isBotAdmin) {
      await message.send(theme.isBotAdmin || "_Bot needs admin privileges_");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Permission check error:", error);
    await message.send("_Failed to check permissions_");
    return false;
  }
};

/**
 * ✅ FIXED: Safe JID comparison using message helper
 */
const areJidsSame = (message, jid1, jid2) => {
  if (!jid1 || !jid2) return false;
  if (message.areJidsSame) {
    return message.areJidsSame(jid1, jid2);
  }
  // Fallback comparison
  return jid1.split("@")[0] === jid2.split("@")[0];
};

/**
 * ✅ NEW: Extract multiple JIDs (for batch operations)
 */
const extractMultipleJids = (message) => {
  const jids = [];

  // Add mentions
  if (message.mentions?.length > 0) {
    jids.push(...message.mentions);
  }

  // Add quoted participant
  if (message.quoted?.participant) {
    jids.push(message.quoted.participant);
  }

  // Extract numbers from text
  const text = message.body.split(" ").slice(1).join(" ");
  const numbers = text.match(/\d+/g) || [];

  numbers.forEach((num) => {
    if (num.length >= 10) {
      jids.push(`${num}@s.whatsapp.net`);
    }
  });

  // Remove duplicates
  return [...new Set(jids)];
};

// ==================== MEMBER MANAGEMENT ====================

// ── Random ARGB background color ─────────────────────────────────────────────
function randomArgbColor() {
  const colors = [
    0xff128c7e, // WhatsApp Green
    0xff075e54, // Dark Green
    0xff1da1f2, // Blue
    0xffe74c3c, // Red
    0xff9b59b6, // Purple
    0xfff39c12, // Orange
    0xff2c3e50, // Dark Blue
    0xffe91e63, // Pink
    0xff00bcd4, // Cyan
    0xff8bc34a, // Light Green
    0xffff5722, // Deep Orange
    0xff607d8b, // Blue Grey
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

// ── sendGroupStatus helper ────────────────────────────────────────────────────
async function sendGroupStatus(message, storyData) {
  const waMsgContent = await generateWAMessageContent(storyData, {
    upload: message.conn.waUploadToServer,
  });

  const wrappedMessage = {
    groupStatusMessageV2: {
      message: waMsgContent.message || waMsgContent,
    },
  };

  await message.conn.relayMessage(message.from, wrappedMessage, {
    messageId: generateMessageID(),
  });

  await message.send("✅ *Group status set successfully!*");
}

// ── gstatus command ───────────────────────────────────────────────────────────
Module({
  command: "gstatus",
  package: "group",
  aliases: ["gs"],
  description: "Send a group status (text or media reply)",
  usage: ".gstatus <text> | reply to media + .gstatus <caption>",
})(async (message, match) => {
  try {
    await message.loadGroupInfo();

    // Permission checks
    if (!message.isGroup)
      return message.send(theme.isGroup || "_This command is only for groups_");
    if (!message.isfromMe)
      return message.send(
        theme.isfromMe || "_This command requires admin privileges_"
      );

    const caption = match?.trim() || "";
    const quoted = message.quoted || null;
    const qType = quoted?.type || null;

    // ── Media reply case ──────────────────────────────────────
    const mediaTypes = [
      "imageMessage",
      "videoMessage",
      "audioMessage",
      "documentMessage",
    ];

    if (quoted && mediaTypes.includes(qType)) {
      await message.react("⏳");

      const buffer = await quoted.download();

      if (!buffer || buffer.length === 0) {
        await message.react("❌");
        return message.send("❌ _Failed to download media. Please try again._");
      }

      let storyData;

      if (qType === "imageMessage") {
        storyData = {
          image: buffer,
          caption: caption || quoted.caption || "",
        };
      } else if (qType === "videoMessage") {
        storyData = {
          video: buffer,
          caption: caption || quoted.caption || "",
        };
      } else if (qType === "audioMessage") {
        storyData = {
          audio: buffer,
          mimetype: quoted.mimetype || "audio/mp4",
          ptt: !!quoted.ptt,
        };
      } else if (qType === "documentMessage") {
        storyData = {
          document: buffer,
          mimetype: quoted.mimetype || "application/octet-stream",
          fileName: quoted.fileName || "file",
        };
      }

      if (storyData) {
        await sendGroupStatus(message, storyData);
        await message.react("✅");
        return;
      }
    }

    // ── Text status ───────────────────────────────────────────
    if (!caption) {
      return message.send(
        `╭━━━「 *GSTATUS USAGE* 」━━━╮\n` +
          `┃\n` +
          `┃ *Text Status:*\n` +
          `┃ • .gstatus Hello everyone!\n` +
          `┃\n` +
          `┃ *Media Status:*\n` +
          `┃ • Reply to image/video/audio\n` +
          `┃   + .gstatus your caption\n` +
          `┃\n` +
          `╰━━━━━━━━━━━━━━━━━━╯`
      );
    }

    await message.react("⏳");

    await sendGroupStatus(message, {
      text: caption,
      backgroundColor: randomArgbColor(),
      font: 1,
    });

    await message.react("✅");
  } catch (error) {
    console.error("gstatus command error:", error);
    await message.react("❌");
    await message.send(`❌ _Failed to set group status_\n\`${error.message}\``);
  }
});

Module({
  command: "add",
  package: "group",
  description: "Add member to group",
  usage: ".add <number|reply|tag>",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const jids = extractMultipleJids(message);
    if (jids.length === 0) {
      return message.send(
        "❌ _Provide user number, tag, or reply_\n\n*Examples:*\n• .add 1234567890\n• .add @user\n• .add 123456 234567 (multiple)\n• Reply to a message"
      );
    }

    await message.react("⏳");

    const results = await message.addParticipant(jids);

    let successCount = 0;
    let failedCount = 0;
    let alreadyInGroup = 0;
    let privacyBlocked = 0;

    const mentions = [];
    let responseText = "📊 *Add Results*\n\n";

    // Process results for each JID
    for (const jid of jids) {
      const status = results?.[jid]?.status || results?.[0]?.[jid]?.status;
      const number = jid.split("@")[0];
      mentions.push(jid);

      if (status === 200 || status === "200") {
        successCount++;
        responseText += `✅ @${number} - Added successfully\n`;
      } else if (status === 403 || status === "403") {
        privacyBlocked++;
        responseText += `⚠️ @${number} - Privacy settings block\n`;
      } else if (status === 409 || status === "409") {
        alreadyInGroup++;
        responseText += `ℹ️ @${number} - Already in group\n`;
      } else {
        failedCount++;
        responseText += `❌ @${number} - Failed (${status || "Unknown"})\n`;
      }
    }

    responseText += `\n*Summary:*\n• Success: ${successCount}\n• Failed: ${failedCount}\n• Already in: ${alreadyInGroup}\n• Privacy block: ${privacyBlocked}`;

    await message.react(successCount > 0 ? "✅" : "❌");
    await message.send(responseText, { mentions });
  } catch (error) {
    console.error("Add command error:", error);
    await message.react("❌");
    await message.send("❌ _An error occurred while adding member(s)_");
  }
});

Module({
  command: "kick",
  package: "group",
  aliases: ["remove"],
  description: "Remove member from group",
  usage: ".kick <reply|tag>",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const jids = extractMultipleJids(message);
    if (jids.length === 0) {
      return message.send("❌ _Tag or reply to user(s) to kick_");
    }

    const baileys = await import("baileys");
    const { jidNormalizedUser } = baileys;
    const botJid = jidNormalizedUser(message.conn.user.id);
    const validJids = [];
    const mentions = [];

    for (const jid of jids) {
      // Check if trying to kick bot
      if (areJidsSame(message, jid, botJid)) {
        await message.send("❌ _Cannot kick myself_");
        continue;
      }

      // Check if trying to kick owner
      if (areJidsSame(message, jid, message.groupOwner)) {
        await message.send("❌ _Cannot kick the group owner_");
        continue;
      }

      // Check if trying to kick admin
      const isTargetAdmin = message.groupAdmins.some((adminId) =>
        areJidsSame(message, adminId, jid)
      );

      if (isTargetAdmin && !message.isfromMe) {
        await message.send(`❌ _Cannot kick admin @${jid.split("@")[0]}_`, {
          mentions: [jid],
        });
        continue;
      }

      validJids.push(jid);
      mentions.push(jid);
    }

    if (validJids.length === 0) {
      return message.send("❌ _No valid users to kick_");
    }

    await message.react("⏳");
    await message.removeParticipant(validJids);
    await message.react("✅");

    const kickedList = validJids
      .map((jid) => `@${jid.split("@")[0]}`)
      .join(", ");
    await message.reply(
      `✅ *Members Removed*\n\n${kickedList} ${
        validJids.length > 1 ? "have" : "has"
      } been removed from the group`,
      { mentions }
    );
  } catch (error) {
    console.error("Kick command error:", error);
    await message.react("❌");
    await message.send("❌ _Failed to remove member(s)_");
  }
});

Module({
  command: "promote",
  package: "group",
  description: "Promote member to admin",
  usage: ".promote <reply|tag>",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const jids = extractMultipleJids(message);
    if (jids.length === 0) {
      return message.send("❌ _Tag or reply to user(s) to promote_");
    }

    const validJids = [];
    const mentions = [];

    for (const jid of jids) {
      // Check if already admin
      const isAlreadyAdmin = message.groupAdmins.some((adminId) =>
        areJidsSame(message, adminId, jid)
      );

      if (isAlreadyAdmin) {
        await message.send(`ℹ️ @${jid.split("@")[0]} is already an admin`, {
          mentions: [jid],
        });
        continue;
      }

      // Check if user is in group
      const isInGroup = message.groupParticipants.some((p) =>
        areJidsSame(message, p.id, jid)
      );

      if (!isInGroup) {
        await message.send(`❌ @${jid.split("@")[0]} is not in the group`, {
          mentions: [jid],
        });
        continue;
      }

      validJids.push(jid);
      mentions.push(jid);
    }

    if (validJids.length === 0) {
      return message.send("❌ _No valid users to promote_");
    }

    await message.react("⏳");
    await message.promoteParticipant(validJids);
    await message.react("👑");

    const promotedList = validJids
      .map((jid) => `@${jid.split("@")[0]}`)
      .join(", ");
    await message.reply(
      `👑 *Promoted to Admin*\n\n${promotedList} ${
        validJids.length > 1 ? "are" : "is"
      } now group admin${validJids.length > 1 ? "s" : ""}`,
      { mentions }
    );
  } catch (error) {
    console.error("Promote command error:", error);
    await message.react("❌");
    await message.send("❌ _Failed to promote member(s)_");
  }
});

Module({
  command: "demote",
  package: "group",
  description: "Demote admin to member",
  usage: ".demote <reply|tag>",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const jids = extractMultipleJids(message);
    if (jids.length === 0) {
      return message.send("❌ _Tag or reply to admin(s) to demote_");
    }

    const validJids = [];
    const mentions = [];

    for (const jid of jids) {
      // Check if owner
      if (areJidsSame(message, jid, message.groupOwner)) {
        await message.send("❌ _Cannot demote the group owner_");
        continue;
      }

      // Check if admin
      const isAdmin = message.groupAdmins.some((adminId) =>
        areJidsSame(message, adminId, jid)
      );

      if (!isAdmin) {
        await message.send(`ℹ️ @${jid.split("@")[0]} is not an admin`, {
          mentions: [jid],
        });
        continue;
      }

      validJids.push(jid);
      mentions.push(jid);
    }

    if (validJids.length === 0) {
      return message.send("❌ _No valid admins to demote_");
    }

    await message.react("⏳");
    await message.demoteParticipant(validJids);
    await message.react("✅");

    const demotedList = validJids
      .map((jid) => `@${jid.split("@")[0]}`)
      .join(", ");
    await message.reply(
      `✅ *Demoted to Member*\n\n${demotedList} ${
        validJids.length > 1 ? "are" : "is"
      } no longer admin${validJids.length > 1 ? "s" : ""}`,
      { mentions }
    );
  } catch (error) {
    console.error("Demote command error:", error);
    await message.react("❌");
    await message.send("❌ _Failed to demote admin(s)_");
  }
});

Module({
  command: "admins",
  package: "group",
  aliases: ["adminlist"],
  description: "List all group admins",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);

    if (!message.groupAdmins || message.groupAdmins.length === 0) {
      return message.send("ℹ️ _No admins found_");
    }

    let text = `╭━━━「 *GROUP ADMINS* 」━━━╮\n┃\n`;

    // Owner first
    if (message.groupOwner) {
      text += `┃ 👑 @${message.groupOwner.split("@")[0]} (Owner)\n┃\n`;
    }

    // Other admins
    let adminCount = 0;
    message.groupAdmins.forEach((adminId) => {
      if (!areJidsSame(message, adminId, message.groupOwner)) {
        adminCount++;
        text += `┃ ${adminCount}. @${adminId.split("@")[0]}\n`;
      }
    });

    text += `┃\n╰━━━━━━━━━━━━━━━━━━╯\n\n*Total:* ${message.groupAdmins.length} admin(s)`;

    await message.send(text, { mentions: message.groupAdmins });
  } catch (error) {
    console.error("Admins command error:", error);
    await message.send("❌ _Failed to list admins_");
  }
});

// ==================== GROUP SETTINGS ====================

Module({
  command: "open",
  package: "group",
  aliases: ["unmute"],
  description: "Allow all members to send messages",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    if (!message.announce) {
      return message.send("ℹ️ _Group is already open_");
    }

    await message.react("⏳");
    await message.unmuteGroup();
    await message.react("🔓");

    await message.reply(
      "🔓 *Group Opened*\n\nAll members can now send messages"
    );
  } catch (error) {
    console.error("Open command error:", error);
    await message.send("❌ _Failed to open group_");
  }
});

Module({
  command: "close",
  package: "group",
  aliases: ["mute"],
  description: "Only admins can send messages",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    if (message.announce) {
      return message.send("ℹ️ _Group is already closed_");
    }

    await message.react("⏳");
    await message.muteGroup();
    await message.react("🔒");

    await message.reply(
      "🔒 *Group Closed*\n\nOnly admins can send messages now"
    );
  } catch (error) {
    console.error("Close command error:", error);
    await message.send("❌ _Failed to close group_");
  }
});

Module({
  command: "lock",
  package: "group",
  description: "Lock group info (only admins can edit)",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    await message.react("⏳");
    await message.conn.groupSettingUpdate(message.from, "locked");
    await message.react("🔒");

    await message.reply(
      "🔒 *Group Info Locked*\n\nOnly admins can edit group info now"
    );
  } catch (error) {
    console.error("Lock command error:", error);
    await message.send("❌ _Failed to lock group info_");
  }
});

Module({
  command: "unlock",
  package: "group",
  description: "Unlock group info (all members can edit)",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    await message.react("⏳");
    await message.conn.groupSettingUpdate(message.from, "unlocked");
    await message.react("🔓");

    await message.reply(
      "🔓 *Group Info Unlocked*\n\nAll members can edit group info now"
    );
  } catch (error) {
    console.error("Unlock command error:", error);
    await message.send("❌ _Failed to unlock group info_");
  }
});

// ==================== GROUP CUSTOMIZATION ====================

Module({
  command: "setgpp",
  package: "group",
  aliases: ["seticon", "setimage", "setgroupicon"],
  description: "Set group profile picture",
  usage: ".setgpp <reply to image>",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const isImage =
      message.type === "imageMessage" ||
      message.quoted?.type === "imageMessage";

    if (!isImage) {
      return message.send(
        "❌ _Reply to an image or send an image with the command_"
      );
    }

    await message.react("⏳");

    const buffer =
      message.type === "imageMessage"
        ? await message.download()
        : await message.quoted.download();

    if (!buffer) {
      return message.send("❌ _Failed to download image_");
    }

    await message.setPp(message.from, buffer);
    await message.react("✅");

    await message.reply(
      "✅ *Profile Picture Updated*\n\nGroup icon has been changed"
    );
  } catch (error) {
    console.error("SetGPP command error:", error);
    await message.react("❌");
    await message.send("❌ _Failed to update group profile picture_");
  }
});

Module({
  command: "subject",
  package: "group",
  aliases: ["setname", "groupname"],
  description: "Change group name",
  usage: ".subject <new name>",
})(async (message, match) => {
  try {
    if (!(await checkPermissions(message))) return;

    if (!match || match.trim().length === 0) {
      return message.send(
        "❌ _Provide a new group name_\n\n*Example:* .subject New Group Name"
      );
    }

    if (match.length > 100) {
      return message.send("❌ _Group name too long (max 100 characters)_");
    }

    await message.react("⏳");
    await message.setSubject(match.trim());
    await message.react("✅");

    await message.reply(
      `✅ *Group Name Updated*\n\n*New Name:* ${match.trim()}`
    );
  } catch (error) {
    console.error("Subject command error:", error);
    await message.send("❌ _Failed to update group name_");
  }
});

Module({
  command: "desc",
  package: "group",
  aliases: ["setdesc", "description"],
  description: "Change group description",
  usage: ".desc <new description>",
})(async (message, match) => {
  try {
    if (!(await checkPermissions(message))) return;

    if (!match || match.trim().length === 0) {
      return message.send(
        "❌ _Provide a new group description_\n\n*Example:* .desc This is our group"
      );
    }

    if (match.length > 512) {
      return message.send("❌ _Description too long (max 512 characters)_");
    }

    await message.react("⏳");
    await message.setDescription(match.trim());
    await message.react("✅");

    await message.reply(
      "✅ *Description Updated*\n\nGroup description has been changed"
    );
  } catch (error) {
    console.error("Description command error:", error);
    await message.send("❌ _Failed to update group description_");
  }
});

// ==================== GROUP INFORMATION ====================

Module({
  command: "groupinfo",
  package: "group",
  aliases: ["ginfo", "gcinfo"],
  description: "Get detailed group information",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);

    const meta = message.groupMetadata;
    const createdDate = new Date((meta.creation || 0) * 1000);
    const regularMembers =
      (message.groupParticipants?.length || 0) -
      (message.groupAdmins?.length || 0);
    const ownerNumber = message.groupOwner?.split("@")[0] || "Unknown";

    const info = `╭━━━「 *GROUP INFO* 」━━━╮
┃
┃ ✦ *Name:* ${meta.subject || "Unknown"}
┃ ✦ *ID:* ${message.from.split("@")[0]}
┃ ✦ *Created:* ${createdDate.toLocaleDateString()}
┃ ✦ *Owner:* @${ownerNumber}
┃
┃ ━━━━━━━━━━━━━━━━━━
┃
┃ 👥 *Members:* ${message.groupParticipants?.length || 0}
┃ 👑 *Admins:* ${message.groupAdmins?.length || 0}
┃ 👤 *Regular:* ${regularMembers}
┃
┃ ━━━━━━━━━━━━━━━━━━
┃
┃ ⚙️ *Settings:*
┃ • Messages: ${message.announce ? "🔒 Admins Only" : "🔓 All Members"}
┃ • Edit Info: ${message.restrict ? "🔒 Admins Only" : "🔓 All Members"}
┃ • Join Approval: ${message.joinApprovalMode ? "✅ Enabled" : "❌ Disabled"}
┃${
      meta.desc
        ? `\n┃ ━━━━━━━━━━━━━━━━━━\n┃\n┃ 📝 *Description:*\n┃ ${meta.desc.substring(
            0,
            200
          )}${meta.desc.length > 200 ? "..." : ""}\n┃`
        : ""
    }
╰━━━━━━━━━━━━━━━━━━╯`;

    await message.reply(info, {
      mentions: message.groupOwner ? [message.groupOwner] : [],
    });
  } catch (error) {
    console.error("Groupinfo command error:", error);
    await message.send("❌ _Failed to fetch group info_");
  }
});

Module({
  command: "invite",
  package: "group",
  aliases: ["link", "grouplink"],
  description: "Get group invite link",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    await message.react("⏳");
    const code = await message.inviteCode();
    await message.react("✅");

    await message.reply(
      `╭━━━「 *GROUP INVITE* 」━━━╮\n┃\n┃ 🔗 *Link:*\n┃ https://chat.whatsapp.com/${code}\n┃\n╰━━━━━━━━━━━━━━━━━━╯`
    );
  } catch (error) {
    console.error("Invite command error:", error);
    await message.send("❌ _Failed to generate invite link_");
  }
});

Module({
  command: "revoke",
  package: "group",
  aliases: ["resetlink", "newlink"],
  description: "Revoke and generate new invite link",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    await message.react("⏳");
    await message.revokeInvite();
    const newCode = await message.inviteCode();
    await message.react("✅");

    await message.reply(
      `✅ *Link Revoked*\n\nPrevious link is now invalid\n\n*New Link:*\nhttps://chat.whatsapp.com/${newCode}`
    );
  } catch (error) {
    console.error("Revoke command error:", error);
    await message.send("❌ _Failed to revoke invite link_");
  }
});

Module({
  command: "requests",
  package: "group",
  aliases: ["joinrequests", "pending"],
  description: "View pending join requests",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const requests = await message.getJoinRequests();

    if (!requests || requests.length === 0) {
      return message.send("ℹ️ _No pending join requests_");
    }

    let text = `╭━━━「 *PENDING REQUESTS* 」━━━╮\n┃\n`;

    for (let i = 0; i < requests.length; i++) {
      const req = requests[i];
      const jid = req.jid || req;
      text += `┃ ${i + 1}. @${jid.split("@")[0]}\n`;
    }

    text += `┃\n╰━━━━━━━━━━━━━━━━━━╯\n\n*Total:* ${requests.length} request(s)\n\n*Commands:*\n• .approve - Approve all\n• .reject - Reject all`;

    const mentions = requests.map((r) => r.jid || r);
    await message.reply(text, { mentions });
  } catch (error) {
    console.error("Requests command error:", error);
    await message.send("❌ _Failed to fetch join requests_");
  }
});

Module({
  command: "approve",
  package: "group",
  aliases: ["acceptall", "approveall"],
  description: "Approve all pending join requests",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const requests = await message.getJoinRequests();

    if (!requests || requests.length === 0) {
      return message.send("ℹ️ _No pending join requests_");
    }

    await message.react("⏳");
    const jids = requests.map((r) => r.jid || r);
    await message.updateJoinRequests(jids, "approve");
    await message.react("✅");

    await message.reply(
      `✅ *Approved ${requests.length} request(s)*\n\nNew members have been added`
    );
  } catch (error) {
    console.error("Approve command error:", error);
    await message.send("❌ _Failed to approve requests_");
  }
});

Module({
  command: "reject",
  package: "group",
  aliases: ["rejectall"],
  description: "Reject all pending join requests",
})(async (message) => {
  try {
    if (!(await checkPermissions(message))) return;

    const requests = await message.getJoinRequests();

    if (!requests || requests.length === 0) {
      return message.send("ℹ️ _No pending join requests_");
    }

    await message.react("⏳");
    const jids = requests.map((r) => r.jid || r);
    await message.updateJoinRequests(jids, "reject");
    await message.react("✅");

    await message.reply(`✅ *Rejected ${requests.length} request(s)*`);
  } catch (error) {
    console.error("Reject command error:", error);
    await message.send("❌ _Failed to reject requests_");
  }
});

// ==================== BOT ACTIONS ====================

Module({
  command: "leave",
  package: "group",
  aliases: ["exit", "left"],
  description: "Bot leaves the group",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isfromMe) {
      return message.send("❌ _Only bot owner can use this_");
    }

    await message.reply("👋 *Goodbye!*\n\nLeaving the group in 3 seconds...");

    setTimeout(async () => {
      try {
        await message.leaveGroup();
      } catch (err) {
        console.error("Error leaving group:", err);
      }
    }, 3000);
  } catch (error) {
    console.error("Leave command error:", error);
    await message.send("❌ _Failed to leave group_");
  }
});

// ==================== NEW FEATURES ====================

Module({
  command: "poll",
  package: "group",
  description: "Create a poll in group",
  usage: ".poll Question | Option1 | Option2 | Option3",
})(async (message, match) => {
  try {
    if (!message.isGroup) return message.send(theme.isGroup);

    if (!match) {
      return message.send(
        "❌ _Invalid format_\n\n*Usage:*\n.poll Question | Option1 | Option2 | Option3\n\n*Example:*\n.poll Best color? | Red | Blue | Green"
      );
    }

    const parts = match.split("|").map((p) => p.trim());

    if (parts.length < 3) {
      return message.send("❌ _Provide at least a question and 2 options_");
    }

    const question = parts[0];
    const options = parts.slice(1);

    if (options.length > 12) {
      return message.send("❌ _Maximum 12 options allowed_");
    }

    await message.send({
      poll: {
        name: question,
        values: options,
        selectableCount: 1,
      },
    });
  } catch (error) {
    console.error("Poll command error:", error);
    await message.send("❌ _Failed to create poll_");
  }
});

Module({
  command: "disappear",
  package: "group",
  aliases: ["ephemeral"],
  description: "Set disappearing messages",
  usage: ".disappear <0|24h|7d|90d>",
})(async (message, match) => {
  try {
    if (!(await checkPermissions(message))) return;

    const duration = match?.toLowerCase();
    let seconds;

    switch (duration) {
      case "0":
      case "off":
        seconds = 0;
        break;
      case "24h":
      case "1d":
        seconds = 86400;
        break;
      case "7d":
        seconds = 604800;
        break;
      case "90d":
        seconds = 7776000;
        break;
      default:
        return message.send(
          "❌ _Invalid duration_\n\n*Options:*\n• 0 or off - Disable\n• 24h - 24 hours\n• 7d - 7 days\n• 90d - 90 days"
        );
    }

    await message.conn.sendMessage(message.from, {
      disappearingMessagesInChat: seconds,
    });

    const status = seconds === 0 ? "disabled" : `enabled (${duration})`;
    await message.reply(`✅ Disappearing messages ${status}`);
  } catch (error) {
    console.error("Disappear command error:", error);
    await message.send("❌ _Failed to set disappearing messages_");
  }
});

Module({
  command: "announce",
  package: "group",
  description: "Send announcement to all members (DM)",
  usage: ".announce <message>",
})(async (message, match) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.isfromMe)
      return message.send(theme.isAdmin);

    if (!match) {
      return message.send(
        "❌ _Provide announcement message_\n\n*Example:* .announce Important meeting tomorrow"
      );
    }

    await message.react("⏳");

    const participants = message.groupParticipants.map((p) => p.id);
    const groupName = message.groupMetadata.subject;

    let success = 0;
    let failed = 0;

    for (const jid of participants) {
      try {
        await message.conn.sendMessage(jid, {
          text: `📢 *GROUP ANNOUNCEMENT*\n\n*From:* ${groupName}\n*Message:*\n${match}`,
        });
        success++;
        await new Promise((resolve) => setTimeout(resolve, 1500)); // Delay to avoid spam
      } catch (err) {
        failed++;
      }
    }

    await message.react("✅");
    await message.reply(
      `✅ *Announcement Sent*\n\n• Success: ${success}\n• Failed: ${failed}`
    );
  } catch (error) {
    console.error("Announce command error:", error);
    await message.send("❌ _Failed to send announcement_");
  }
});

Module({
  command: "inviteuser",
  package: "group",
  aliases: ["inv"],
  description: "Invite user via private message",
  usage: ".inviteuser <number>",
})(async (message, match) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.isfromMe)
      return message.send(theme.isAdmin);
    if (!message.isBotAdmin) return message.send(theme.isBotAdmin);

    const jid = extractJid(message);
    if (!jid) {
      return message.send(
        "❌ _Provide a number_\n\n*Example:* .inviteuser 1234567890"
      );
    }

    if (message.isParticipant(jid)) {
      return message.send("ℹ️ _User is already in the group_");
    }

    const code = await message.inviteCode();
    const groupName = message.groupMetadata.subject;

    await message.conn.sendMessage(jid, {
      text: `📩 *GROUP INVITATION*\n\n*Group:* ${groupName}\n*Invited by:* @${
        message.sender.split("@")[0]
      }\n\n*Join Link:*\nhttps://chat.whatsapp.com/${code}`,
      mentions: [message.sender],
    });

    await message.reply(
      `✅ *Invitation Sent*\n\nInvite link sent to @${jid.split("@")[0]}`,
      { mentions: [jid] }
    );
  } catch (error) {
    console.error("InviteUser command error:", error);
    await message.send("❌ _Failed to send invitation_");
  }
});

Module({
  command: "everyone",
  package: "group",
  aliases: ["all", "tagall"],
  description: "Tag all group members",
  usage: ".everyone <message>",
})(async (message, match) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.isfromMe)
      return message.send(theme.isAdmin);

    const text = match || "📢 *ATTENTION EVERYONE*";
    const participants = message.groupParticipants;

    let tagText = `${text}\n\n╭─「 *MEMBERS* 」\n`;

    for (let i = 0; i < participants.length; i++) {
      tagText += `│ ${i + 1}. @${participants[i].id.split("@")[0]}\n`;
    }

    tagText += `╰────────────\n\n*Total:* ${participants.length} members`;

    const mentions = participants.map((p) => p.id);
    await message.send(tagText, { mentions });
  } catch (error) {
    console.error("Everyone command error:", error);
    await message.send("❌ _Failed to tag everyone_");
  }
});

Module({
  command: "tagadmins",
  package: "group",
  aliases: ["admintag"],
  description: "Tag all admins",
  usage: ".tagadmins <message>",
})(async (message, match) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);

    const text = match || "👑 *ADMIN ATTENTION NEEDED*";
    let tagText = `${text}\n\n`;

    for (let i = 0; i < message.groupAdmins.length; i++) {
      tagText += `@${message.groupAdmins[i].split("@")[0]} `;
    }

    await message.send(tagText, { mentions: message.groupAdmins });
  } catch (error) {
    console.error("TagAdmins command error:", error);
    await message.send("❌ _Failed to tag admins_");
  }
});

Module({
  command: "totag",
  package: "group",
  description: "Tag users by replying to their message",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);
    if (!message.isAdmin && !message.isfromMe)
      return message.send(theme.isAdmin);

    if (!message.quoted) {
      return message.send("❌ _Reply to a message to use this command_");
    }

    const mentions = message.groupParticipants.map((p) => p.id);

    // Forward the quoted message with all tags
    await message.conn.sendMessage(message.from, {
      forward: message.quoted.raw,
      mentions: mentions,
    });
  } catch (error) {
    console.error("ToTag command error:", error);
    await message.send("❌ _Failed to tag with message_");
  }
});

/*Module({
  command: "groupdp",
  package: "group",
  aliases: ["gdp", "groupicon"],
  description: "Get group display picture",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);

    const ppUrl = await message.profilePictureUrl(message.from, "image");

    if (!ppUrl) {
      return message.send("❌ _This group has no display picture_");
    }

    await message.send({
      image: { url: ppUrl },
      caption: `*${message.groupMetadata.subject}*\n\n_Group Display Picture_`,
    });
  } catch (error) {
    console.error("GroupDP command error:", error);
    await message.send("❌ _Failed to fetch group display picture_");
  }
});*/

Module({
  command: "groupstats",
  package: "group",
  aliases: ["gstats"],
  description: "Get group statistics",
})(async (message) => {
  try {
    await message.loadGroupInfo();

    if (!message.isGroup) return message.send(theme.isGroup);

    const totalMembers = message.groupParticipants.length;
    const admins = message.groupAdmins.length;
    const regular = totalMembers - admins;
    const createdDate = new Date((message.groupMetadata.creation || 0) * 1000);
    const daysSinceCreation = Math.floor(
      (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const stats = `╭━━━「 *GROUP STATISTICS* 」━━━╮
┃
┃ 📊 *Member Distribution*
┃ • Total Members: ${totalMembers}
┃ • Admins: ${admins} (${((admins / totalMembers) * 100).toFixed(1)}%)
┃ • Regular: ${regular} (${((regular / totalMembers) * 100).toFixed(1)}%)
┃
┃ 📅 *Timeline*
┃ • Created: ${createdDate.toLocaleDateString()}
┃ • Age: ${daysSinceCreation} days
┃
┃ ⚙️ *Settings Status*
┃ • Messaging: ${message.announce ? "🔒 Restricted" : "🔓 Open"}
┃ • Info Edit: ${message.restrict ? "🔒 Locked" : "🔓 Unlocked"}
┃ • Join Mode: ${
      message.joinApprovalMode ? "✅ Approval Required" : "🔓 Direct Join"
    }
┃
╰━━━━━━━━━━━━━━━━━━╯`;

    await message.reply(stats);
  } catch (error) {
    console.error("GroupStats command error:", error);
    await message.send("❌ _Failed to get group statistics_");
  }
});

Module({
  command: "gmenu",
  package: "general",
  description: "Show all group management commands",
})(async (message) => {
  try {
    const help = `╭━━━「 *GROUP COMMANDS* 」━━━╮
┃
┃ *👥 MEMBER MANAGEMENT*
┃ • .add - Add member(s)
┃ • .kick - Remove member(s)
┃ • .promote - Make admin(s)
┃ • .demote - Remove admin(s)
┃ • .admins - List admins
┃
┃ *⚙️ GROUP SETTINGS*
┃ • .open - Allow all to message
┃ • .close - Admin only messages
┃ • .lock - Lock group info
┃ • .unlock - Unlock group info
┃ • .disappear - Disappearing msgs
┃
┃ *✏️ CUSTOMIZATION*
┃ • .subject - Change name
┃ • .desc - Change description
┃ • .setgpp - Set group icon
┃ • .groupdp - Get group icon
┃
┃ *📊 INFORMATION*
┃ • .groupinfo - Group details
┃ • .groupstats - Statistics
┃
┃ *🔗 INVITE & LINKS*
┃ • .invite - Get invite link
┃ • .revoke - Reset link
┃ • .inviteuser - Send invite DM
┃ • .requests - View join requests
┃ • .approve - Approve requests
┃ • .reject - Reject requests
┃
┃ *📢 MESSAGING*
┃ • .everyone - Tag all members
┃ • . - Hidden tag
┃ • .tagadmins - Tag admins only
┃ • .announce - DM announcement
┃ • .mention - Mention users
┃ • .totag - Tag with reply
┃ • .poll - Create poll
┃
┃ *🤖 BOT*
┃ • .leave - Bot leaves group
┃
╰━━━━━━━━━━━━━━━━━━╯

_Use .command to see usage details_`;

    await message.reply(help);
  } catch (error) {
    console.error("GroupHelp command error:", error);
    await message.send("❌ _Failed to show help_");
  }
});
