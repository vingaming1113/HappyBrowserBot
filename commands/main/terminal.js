const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle } = require("discord.js");
const path = require("node:path");
const { loadFromDB, saveToDB } = require("../../db/utils");

// Import functionality from split modules
const { systemCommands, installableCommands } = require("./terminal/commands");
const { pkgCommand, isPackageAvailable, packageDefinitions, getDownloadStatus, processDownload } = require("./terminal/pkg");
const { resolvePath, getObjectAtPath, createFilesystem, MAX_CONTENT_LENGTH } = require("./terminal/filesystem");

// ===== CONSTANTS =====
const MAX_HISTORY_SIZE = 10;

// ===== COMMAND HANDLING =====

/**
 * Process a terminal command
 * @param {string} userId - User ID
 * @param {string} commandStr - Command string to process
 * @param {Object} interaction - Discord interaction object
 * @returns {string} - Command output
 */
async function handleCommand(userId, commandStr, interaction = null) {
  const parts = commandStr.match(/(".*?"|'.*?'|\S+)/g) || [];
  const command = parts[0]?.toLowerCase() || "";
  const args = parts.slice(1).map((arg) => arg.replace(/^[\"']|[\"']$/g, ""));

  const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
  const sysDir = userFS.fs["/"].children.sys;

  let output;

  // Special case for edit command
  if (command === "edit") {
    output = 'edit: Use the "edit-file" action (with the arg0 field specifying the filename) to use the edit command!';
  }
  // Special case for pkg command
  else if (command === "pkg") {
    output = await pkgCommand(userId, args);
  }
  // Check if it's a built-in system command
  else if (systemCommands[command]) {
    output = await systemCommands[command].execute(userId, args);
  }
  // Otherwise check for installable commands
  else {
    const pkgDir = sysDir.children.pkgs.children;
    const pkgFile = pkgDir[`${command}.pkg`];

    if (pkgFile && installableCommands[command]) {
      output = await installableCommands[command].execute(interaction, userId, args);
    } else {
      const currentVersion = sysDir.children.os_version?.content || "1.0.0";
      const currentBranch = sysDir.children.os_branch?.content || "stable";

      // Check if the package exists but isn't installed
      if (packageDefinitions[command]) {
        if (isPackageAvailable(command, currentVersion, currentBranch)) {
          output = `Command '${command}' is available but not installed. Run 'pkg install ${command}' first.`;
        } else if (packageDefinitions[command][currentBranch]) {
          output = `Command '${command}' requires ${currentBranch} version ${packageDefinitions[command][currentBranch].minVersion} or later.`;
        } else {
          output = `Command '${command}' is not available on the ${currentBranch} branch.`;
        }
      } else {
        output = `Command not found: ${command}`;
      }
    }
  }

  // After any command, check if there are downloads in progress and update them
  if (command === "pkg" && args[0] === "install") {
    // For pkg install commands, we already handled the download state
    return output;
  }

  return output;
}

// ===== COMMAND EXECUTION & MODAL HANDLING =====

module.exports = {
  data: new SlashCommandBuilder()
    .setName("terminal")
    .setDescription("Simulates a Terminal using modals for command input")
    .setContexts(0, 1, 2)
    .addStringOption((option) =>
      option
        .setName("action")
        .setDescription("Select an action")
        .addChoices(
          { name: "clear-history", value: "clear-history" },
          { name: "view-history", value: "view-history" },
          { name: "edit-file", value: "edit-file" }
        )
    )
    .addStringOption((option) =>
      option.setName("arg0").setDescription("Optional argument (filename for edit-file - note: the arg0 field is used as the filename!)").setRequired(false)
    ),

  async execute(interaction) {
    const action = interaction.options.getString("action");
    const arg0 = interaction.options.getString("arg0");
    const userId = interaction.user.id;

    if (action === "clear-history") {
      await saveToDB("user_histories", userId, []);
      await interaction.reply({ content: "History cleared" });
      return;
    }

    if (action === "view-history") {
      const histories = await loadFromDB("user_histories", userId, []);
      await interaction.reply({ content: `\`\`\`\n${histories.join("\n")}\n\`\`\`` });
      return;
    }

    if (action === "edit-file") {
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const pkgDir = userFS.fs["/"].children.sys.children.pkgs.children;

      if (!pkgDir["edit.pkg"]) {
        await interaction.reply({ content: 'Error: The "edit" package is not installed. Please install it via pkg install edit.' });
        return;
      }

      if (!arg0) {
        await interaction.reply({ content: "edit: No filename provided! The arg0 field is required to specify the filename." });
        return;
      }

      const fullPath = resolvePath(userFS.currentDir, arg0);
      let existingContent = "";

      try {
        const { target, found } = getObjectAtPath(userFS, fullPath);
        if (found && target.type === "file") {
          existingContent = target.content || "";
        }
      } catch {}

      if (existingContent.length > MAX_CONTENT_LENGTH) {
        existingContent = existingContent.substring(0, MAX_CONTENT_LENGTH);
      }

      const modal = new ModalBuilder().setCustomId("terminal:editfile").setTitle("Edit File Command");

      const fileInput = new TextInputBuilder()
        .setCustomId("fileName")
        .setLabel("Filename (arg0 is used as the filename)")
        .setStyle(TextInputStyle.Short)
        .setValue(arg0)
        .setRequired(true);

      const contentInput = new TextInputBuilder()
        .setCustomId("content")
        .setLabel("New File Content")
        .setStyle(TextInputStyle.Paragraph)
        .setValue(existingContent)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(fileInput), new ActionRowBuilder().addComponents(contentInput));

      await interaction.showModal(modal);
      return;
    }

    // Default case: show command input modal
    const modal = new ModalBuilder().setCustomId("terminal:input").setTitle("Terminal Command Input");

    const commandInput = new TextInputBuilder().setCustomId("command").setLabel("Command").setStyle(TextInputStyle.Short).setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(commandInput));
    await interaction.showModal(modal);
  },

  async handleModal(interaction) {
    if (!interaction.isModalSubmit()) return;
    await interaction.deferReply();

    const userId = interaction.user.id;

    try {
      if (interaction.customId === "terminal:input") {
        // Process terminal command input
        await handleTerminalInput(interaction, userId);
      } else if (interaction.customId === "terminal:editfile") {
        // Handle file editing
        await handleFileEdit(interaction, userId);
      } else if (interaction.customId.startsWith("edit:")) {
        // Handle external file edit
        await handleExternalFileEdit(interaction);
      }
    } catch (error) {
      console.error("Modal handling error:", error);
      await interaction.editReply({ content: "An error occurred while processing your command" });
    }
  },
};

/**
 * Process terminal command input from modal
 * @param {Object} interaction - Discord interaction
 * @param {string} userId - User ID
 */
async function handleTerminalInput(interaction, userId) {
  let commandField = interaction.fields.getTextInputValue("command").trim();
  const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());

  // Process environment variables
  const sysDir = userFS.fs["/"].children.sys;
  if (sysDir.children.os?.children[".def-vars"]) {
    const defVars = sysDir.children.os.children[".def-vars"].content.split("\n").reduce((acc, line) => {
      line = line.trim();
      if (line.startsWith("$") && line.includes("=")) {
        const [key, value] = line.split("=");
        acc[key] = value;
      }
      return acc;
    }, {});

    Object.keys(defVars).forEach((varName) => {
      const regex = new RegExp(`\\${varName}\\b`, "g");
      commandField = commandField.replace(regex, defVars[varName]);
    });
  }

  let histories = await loadFromDB("user_histories", userId, []);
  const currentDir = userFS.currentDir;
  const username = interaction.user.username;

  // Add main command prompt to history
  let promptLine = `${username}@happyphone:${currentDir}$ ${commandField}`;
  histories.push(promptLine);

  // Handle command chaining with &&
  const chainedCommands = commandField.split(/\s*&&\s*/);
  let success = true;
  let outputs = [];

  for (let i = 0; i < chainedCommands.length && success; i++) {
    const cmd = chainedCommands[i].trim();
    if (!cmd) continue;

    const output = await handleCommand(userId, cmd, interaction);

    if (output) {
      outputs.push(output);
    }

    // Check if command failed and should break the chain
    success = !isCommandFailed(output);
  }

  // Add all outputs as a single combined entry
  if (outputs.length > 0) {
    histories.push(outputs.join("\n"));
  }

  // Limit history size
  histories = histories.slice(-MAX_HISTORY_SIZE);
  await saveToDB("user_histories", userId, histories);
  await interaction.editReply({ content: `\`\`\`\n${histories.join("\n")}\n\`\`\`` });

  // Start checking for downloads (in the background)
  setTimeout(() => checkActiveDownloads(userId, interaction, histories), 500);
}

/**
 * Check for active downloads and update terminal output if needed
 * @param {string} userId - User ID
 * @param {Object} interaction - Discord interaction
 * @param {Array} histories - Current terminal history
 * @returns {Promise<boolean>} - Whether any downloads were updated
 */
async function checkActiveDownloads(userId, interaction, histories) {
  try {
    // Use packageDefinitions from pkg.js
    const pkgModule = require("./terminal/pkg");
    const pkgNames = Object.keys(pkgModule.packageDefinitions);

    let hasUpdates = false;

    for (const pkgName of pkgNames) {
      const downloadState = pkgModule.getDownloadStatus(userId, pkgName);
      if (downloadState && downloadState.currentStep < downloadState.steps.length) {
        // Get fresh filesystem for updating
        const fs = await loadFromDB("user_filesystems", userId, createFilesystem());

        // Update the download progress (this will install the package if complete)
        const updateMsg = await pkgModule.processDownload(userId, fs, pkgName, false);

        if (updateMsg) {
          // Check if this is the same message as the last one
          const lastMessage = histories[histories.length - 1];
          if (lastMessage !== updateMsg) {
            histories.push(updateMsg);
            hasUpdates = true;
          }
        }
      }
    }

    // If any downloads were updated, update the history display
    if (hasUpdates) {
      histories = histories.slice(-MAX_HISTORY_SIZE);
      await saveToDB("user_histories", userId, histories);
      await interaction.editReply({ content: `\`\`\`\n${histories.join("\n")}\n\`\`\`` });

      // Continue checking if there are active downloads
      const hasActiveDownloads = pkgNames.some((pkgName) => {
        const state = pkgModule.getDownloadStatus(userId, pkgName);
        return state && state.currentStep < state.steps.length;
      });

      if (hasActiveDownloads) {
        // Set up next check in 0.5 seconds for more frequent updates
        setTimeout(() => checkActiveDownloads(userId, interaction, histories), 500);
      }

      return true;
    }

    return false;
  } catch (err) {
    console.error("Error checking downloads:", err);
    return false;
  }
}

/**
 * Check if a command output indicates failure
 * @param {string} output - Command output text
 * @returns {boolean} - Whether command failed
 */
function isCommandFailed(output) {
  return (
    output &&
    (output.startsWith("Command not found:") ||
      (output.startsWith("Command '") && output.includes("' is available but not installed")) ||
      output.startsWith("pkg: Unknown") ||
      output.includes(": No such"))
  );
}

/**
 * Handle file edit from the main terminal:editfile modal
 * @param {Object} interaction - Discord interaction
 * @param {string} userId - User ID
 */
async function handleFileEdit(interaction, userId) {
  const fileNameField = interaction.fields.getTextInputValue("fileName").trim();
  const contentField = interaction.fields.getTextInputValue("content").trim();

  if (!fileNameField) {
    await interaction.editReply({ content: "Filename is required." });
    return;
  }

  if (contentField.length > MAX_CONTENT_LENGTH) {
    await interaction.editReply({ content: `Error: File content exceeds the limit of ${MAX_CONTENT_LENGTH} characters.` });
    return;
  }

  const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
  const fullPath = resolvePath(userFS.currentDir, fileNameField);
  let histories = await loadFromDB("user_histories", userId, []);
  const username = interaction.user.username;
  let promptLine = `${username}@happyphone:${userFS.currentDir}$ edit-file ${fileNameField}`;
  histories.push(promptLine);

  const { parent, fileName, target, found, error } = getObjectAtPath(userFS, fullPath, true);
  if (error) {
    await interaction.editReply({ content: `Error: ${error}` });
    return;
  }

  if (found && target.readOnly) {
    await interaction.editReply({ content: "Error: This file is read-only and cannot be edited." });
    return;
  }

  parent.children[fileName] = { type: "file", content: contentField };
  const output = `Updated file: ${fullPath}`;
  histories.push(output);

  histories = histories.slice(-MAX_HISTORY_SIZE);
  await saveToDB("user_filesystems", userId, userFS);
  await saveToDB("user_histories", userId, histories);
  await interaction.editReply({ content: `\`\`\`\n${histories.join("\n")}\n\`\`\`` });
}

/**
 * Handle file edit from an external edit modal
 * @param {Object} interaction - Discord interaction
 */
async function handleExternalFileEdit(interaction) {
  const [, originalUserId, fullPath] = interaction.customId.split(":");
  const content = interaction.fields.getTextInputValue("content");

  const userFS = await loadFromDB("user_filesystems", originalUserId, createFilesystem());
  const { parent, fileName, target, found, error } = getObjectAtPath(userFS, fullPath);

  if (error || !found) {
    await interaction.editReply({ content: `Error: File not found: ${fullPath}` });
    return;
  }

  if (target.readOnly) {
    await interaction.editReply({ content: "Error: This file is read-only and cannot be edited." });
    return;
  }

  parent.children[fileName] = { type: "file", content };
  await saveToDB("user_filesystems", originalUserId, userFS);

  const histories = await loadFromDB("user_histories", originalUserId, []);
  const newHistory = [...histories, `Updated file: ${fullPath}`].slice(-MAX_HISTORY_SIZE);
  await saveToDB("user_histories", originalUserId, newHistory);
  await interaction.editReply({ content: `\`\`\`\n${newHistory.join("\n")}\n\`\`\`` });
}
