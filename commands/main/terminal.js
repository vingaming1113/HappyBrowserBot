const { SlashCommandBuilder, ModalBuilder, TextInputBuilder, ActionRowBuilder, TextInputStyle } = require("discord.js");
const path = require("node:path");
const { loadFromDB, saveToDB } = require("../../db/utils");

const latestOSVersion = "1.0.0.1";

const osBranches = {
  "stable": latestOSVersion,
  "unstable": "1.0.0.2"
};

const packageDefinitions = {
  "echo": { 
    stable: { minVersion: "1.0.0" },
    unstable: { minVersion: "1.0.0" }
  },
  "edit": { 
    stable: { minVersion: "1.0.0" },
    unstable: { minVersion: "1.0.0" }
  },
  "test": { 
    stable: { minVersion: "1.0.0" },
    unstable: { minVersion: "1.0.0" }
  },
  "edit-file": { 
    stable: { minVersion: "1.0.0" },
    unstable: { minVersion: "1.0.0" }
  }
};

// Compare version strings (returns -1, 0, or 1)
function compareVersions(version1, version2) {
  const v1Parts = version1.split('.').map(Number);
  const v2Parts = version2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
    const v1Part = v1Parts[i] || 0;
    const v2Part = v2Parts[i] || 0;
    
    if (v1Part > v2Part) return 1;
    if (v1Part < v2Part) return -1;
  }
  
  return 0;
}

// Check if a package is available for the current OS version and branch
function isPackageAvailable(packageName, osVersion, osBranch) {
  // If package doesn't exist in definitions
  if (!packageDefinitions[packageName]) return false;
  
  // If package doesn't support this branch
  if (!packageDefinitions[packageName][osBranch]) return false;
  
  // Check version compatibility
  const minVersion = packageDefinitions[packageName][osBranch].minVersion;
  return compareVersions(osVersion, minVersion) >= 0;
}

function createFilesystem() {
  return {
    fs: {
      "/": {
        type: "directory",
        children: {
          sys: {
            type: "directory",
            children: {
              os_version: { type: "file", content: "1.0.0" },
              os_branch: { type: "file", content: "stable" },
              os: {
                type: "directory",
                children: {
                  "happy phone.bin": { type: "file", content: "", readOnly: true, hidden: true },
                  "ssh.bin": { type: "file", content: "", readOnly: true, hidden: true },
                  "handler.hpo": { type: "file", content: "", readOnly: true, hidden: true },
                  "peform.hpo": { type: "file", content: "", readOnly: true, hidden: true },
                  "programs.hpo": { type: "file", content: "", readOnly: true, hidden: true },
                },
              },
              pkgs: { type: "directory", children: {} },
            },
          },
        },
      },
    },
    currentDir: "/",
  };
}

function resolvePath(currentDir, targetPath) {
  const isAbsolute = targetPath.startsWith("/");
  const segments = targetPath.split("/").filter(p => p);
  let parts = isAbsolute ? segments : [...currentDir.split("/").filter(p => p), ...segments];
  const resolved = [];
  for (const part of parts) {
    part === ".." ? resolved.pop() : part !== "." && resolved.push(part);
  }
  return `/${resolved.join("/")}`;
}

const MAX_CONTENT_LENGTH = 10000;

async function handleCommand(userId, commandStr, interaction = null) {
  const parts = commandStr.match(/(".*?"|'.*?'|\S+)/g) || [];
  const command = parts[0]?.toLowerCase() || "";
  const args = parts.slice(1).map(arg => arg.replace(/^[\"']|[\"']$/g, ""));
  
  const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
  const sysDir = userFS.fs["/"].children.sys;
  
  if (command === "edit") {
    return 'edit: Use the "edit-file" action (with the arg0 field specifying the filename) to use the edit command!';
  } else if (systemCommands[command]) {
    return await systemCommands[command].execute(userId, args);
  } else {
    const pkgFile = userFS.fs["/"].children.sys.children.pkgs.children[`${command}.pkg`];
    if (pkgFile && installableCommands[command]) {
      return await installableCommands[command].execute(interaction, userId, args);
    } else {
      const currentVersion = sysDir.children.os_version?.content || "1.0.0";
      const currentBranch = sysDir.children.os_branch?.content || "stable";
      
      // Check if the package exists but isn't installed
      if (packageDefinitions[command]) {
        if (isPackageAvailable(command, currentVersion, currentBranch)) {
          return `Command '${command}' is available but not installed. Run 'pkg install ${command}' first.`;
        } else if (packageDefinitions[command][currentBranch]) {
          return `Command '${command}' requires ${currentBranch} version ${packageDefinitions[command][currentBranch].minVersion} or later.`;
        } else {
          return `Command '${command}' is not available on the ${currentBranch} branch.`;
        }
      } else {
        return `Command not found: ${command}`;
      }
    }
  }
}

const systemCommands = {
  cd: {
    execute: async (userId, args) => {
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      let target = args[0] || "/";
      if (target === "...") target = "/";
      const newPath = resolvePath(userFS.currentDir, target);
      let current = userFS.fs["/"];
      for (const part of newPath.split("/").filter(p => p)) {
        if (!current.children?.[part] || current.children[part].type !== "directory") {
          return `cd: ${newPath}: No such directory`;
        }
        current = current.children[part];
      }
      userFS.currentDir = newPath;
      await saveToDB("user_filesystems", userId, userFS);
      return newPath;
    },
  },
  ls: {
    execute: async (userId, args) => {
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const targetPath = resolvePath(userFS.currentDir, args[0] || userFS.currentDir);
      let current = userFS.fs["/"];
      for (const part of targetPath.split("/").filter(p => p)) {
        if (!current.children?.[part]) return `ls: ${targetPath}: No such directory`;
        current = current.children[part];
      }
      return Object.keys(current.children)
        .map(name => `${current.children[name].type === "directory" ? "📁 " : "📄 "}${name}`)
        .join("\n") || "Empty directory";
    },
  },
  touch: {
    execute: async (userId, args) => {
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const fullPath = resolvePath(userFS.currentDir, args.join(" "));
      const pathParts = fullPath.split("/").filter(p => p);
      const fileName = pathParts.pop();
      let current = userFS.fs["/"];
      for (const part of pathParts) {
        if (!current.children[part]) current.children[part] = { type: "directory", children: {} };
        current = current.children[part];
      }
      current.children[fileName] = { type: "file", content: "" };
      await saveToDB("user_filesystems", userId, userFS);
      return `Created file: ${fullPath}`;
    },
  },
  pkg: {
    execute: async (userId, args) => {
      const subcommand = args[0];
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const sysDir = userFS.fs["/"].children.sys;
      
      // Make sure os_branch exists
      if (!sysDir.children.os_branch) {
        sysDir.children.os_branch = { type: "file", content: "stable" };
      }
      
      if (subcommand === "upgrade") {
        // Check for branch option
        const branchIndex = args.findIndex(arg => arg.startsWith("--"));
        let targetBranch = "stable"; // Default to stable
        
        if (branchIndex !== -1) {
          const branchArg = args[branchIndex].substring(2);
          if (!osBranches[branchArg]) {
            return `pkg: Unknown branch '${branchArg}'. Available branches: ${Object.keys(osBranches).join(", ")}`;
          }
          targetBranch = branchArg;
        }
        
        if (!sysDir.children.os_version) {
          sysDir.children.os_version = { type: "file", content: "1.0.0" };
        }
        
        const currentVersion = sysDir.children.os_version.content;
        const currentBranch = sysDir.children.os_branch.content;
        const targetVersion = osBranches[targetBranch];
        
        if (currentVersion === targetVersion && currentBranch === targetBranch) {
          return `Your system is already up to date on branch '${targetBranch}'.`;
        }
        
        // Handle downgrade scenario - detect if going from unstable to stable
        const isDowngrade = currentBranch === 'unstable' && targetBranch === 'stable' && 
                           compareVersions(currentVersion, targetVersion) > 0;
        
        // Update OS version and branch
        sysDir.children.os_version.content = targetVersion;
        sysDir.children.os_branch.content = targetBranch;
        
        if (!sysDir.children.os) {
          sysDir.children.os = {
            type: "directory",
            children: {
              ".def-vars": { type: "file", content: "$SYS=/sys", readOnly: true, hidden: true },
              "happy phone.bin": { type: "file", content: "", readOnly: true, hidden: true },
              "ssh.bin": { type: "file", content: "", readOnly: true, hidden: true },
              "handler.hpo": { type: "file", content: "", readOnly: true, hidden: true },
              "peform.hpo": { type: "file", content: "", readOnly: true, hidden: true },
              "programs.hpo": { type: "file", content: "", readOnly: true, hidden: true },
            },
          };
        } else {
          const requiredFiles = ["happy phone.bin", "ssh.bin", "handler.hpo", "peform.hpo", "programs.hpo"];
          for (const file of requiredFiles) {
            if (!sysDir.children.os.children[file]) {
              sysDir.children.os.children[file] = { type: "file", content: "", readOnly: true, hidden: true };
            }
          }
          if (!sysDir.children.os.children[".def-vars"]) {
            sysDir.children.os.children[".def-vars"] = { type: "file", content: "$SYS=/sys", readOnly: true, hidden: true };
          }
        }
        
        await saveToDB("user_filesystems", userId, userFS);
        
        if (isDowngrade) {
          return `System downgraded from ${currentBranch} (${currentVersion}) to ${targetBranch} (${targetVersion}). Note: Some features may no longer be available.`;
        } else {
          return `System ${currentVersion === targetVersion ? 'switched' : 'upgraded'} successfully to version ${targetVersion} (${targetBranch} branch).`;
        }
      }
      
      const pkgDir = sysDir.children.pkgs.children;
      const currentVersion = sysDir.children.os_version?.content || "1.0.0";
      const currentBranch = sysDir.children.os_branch?.content || "stable";
      
      if (subcommand === "install") {
        const pkgName = args[1];
        if (!pkgName) return "Usage: pkg install <package>";
        
        // Check if package is available for the current version and branch
        if (!isPackageAvailable(pkgName, currentVersion, currentBranch)) {
          // If package exists but isn't available in this branch/version
          if (packageDefinitions[pkgName]) {
            if (packageDefinitions[pkgName][currentBranch]) {
              return `pkg: Package '${pkgName}' requires ${currentBranch} version ${packageDefinitions[pkgName][currentBranch].minVersion} or later.`;
            } else {
              return `pkg: Package '${pkgName}' is not available on the ${currentBranch} branch.`;
            }
          }
          return `pkg: Package '${pkgName}' not found.`;
        }
        
        pkgDir[`${pkgName}.pkg`] = { 
          type: "file", 
          content: `Package: ${pkgName}\nVersion: ${currentVersion}\nBranch: ${currentBranch}` 
        };
        
        await saveToDB("user_filesystems", userId, userFS);
        return `Installed package: ${pkgName}`;
      } else if (subcommand === "remove") {
        const pkgName = args[1];
        if (!pkgName) return "Usage: pkg remove <package>";
        if (!pkgDir[`${pkgName}.pkg`]) return `pkg: Package not found: ${pkgName}`;
        delete pkgDir[`${pkgName}.pkg`];
        await saveToDB("user_filesystems", userId, userFS);
        return `Removed package: ${pkgName}`;
      } else if (subcommand === "list") {
        const pageArgIndex = args.indexOf("--page");
        const pageNumber = pageArgIndex !== -1 ? parseInt(args[pageArgIndex + 1], 10) || 1 : 1;
        const pageSize = 5;
        const installedPackages = Object.keys(pkgDir).map(pkg => pkg.replace(".pkg", ""));
        const totalPages = Math.max(1, Math.ceil(installedPackages.length / pageSize));
        
        if (pageNumber < 1 || pageNumber > totalPages) {
          return `pkg: Invalid page number. Valid range: 1-${totalPages}`;
        }
        
        const start = (pageNumber - 1) * pageSize;
        const end = start + pageSize;
        const pagePackages = installedPackages.slice(start, end);
        
        if (pagePackages.length === 0) {
          return `pkg: No installed packages on page ${pageNumber}`;
        }
        
        return `Installed Packages (Page ${pageNumber}/${totalPages}):\n${pagePackages.join("\n")}`;
      } else if (subcommand === "search") {
        const query = args[1]?.toLowerCase();
        const pageSize = 6;
        
        // Filter available packages based on current OS version and branch
        const allPackages = Object.keys(packageDefinitions).filter(pkg => 
          isPackageAvailable(pkg, currentVersion, currentBranch)
        );
        
        const filteredPackages = query ? 
          allPackages.filter(pkg => pkg.toLowerCase().includes(query)) : 
          allPackages;
          
        const pageArgIndex = args.indexOf("--page");
        const pageNumber = pageArgIndex !== -1 ? parseInt(args[pageArgIndex + 1], 10) || 1 : 1;
        const totalPages = Math.max(1, Math.ceil(filteredPackages.length / pageSize));
        
        if (pageNumber < 1 || pageNumber > totalPages) {
          return `pkg: Invalid page number. Valid range: 1-${totalPages || 1}`;
        }
        
        const start = (pageNumber - 1) * pageSize;
        const end = start + pageSize;
        const pagePackages = filteredPackages.slice(start, end);
        
        if (pagePackages.length === 0) {
          return `pkg: No matching packages found for "${query || "all"}" on page ${pageNumber}`;
        }
        
        return `Search Results for "${query || "all"}" (${currentBranch} branch, v${currentVersion}) (Page ${pageNumber}/${totalPages}):\n${pagePackages.join("\n")}`;
      } else if (subcommand === "branches") {
        // Show available branches and their versions
        const branches = Object.entries(osBranches)
          .map(([branch, version]) => `${branch}: ${version}${branch === currentBranch ? " (current)" : ""}`)
          .join("\n");
          
        return `Available branches:\n${branches}`;
      } else {
        return 'pkg: Invalid subcommand. Use "install", "remove", "list", "search", "branches", or "upgrade".';
      }
    },
  },
  test: {
    execute: async (userId, args) => `Test command executed with args: ${args.join(" ")}`,
  },
  mkdir: {
    execute: async (userId, args) => {
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const fullPath = resolvePath(userFS.currentDir, args.join(" "));
      const pathParts = fullPath.split("/").filter(p => p);
      let current = userFS.fs["/"];
      for (const part of pathParts) {
        if (!current.children[part]) current.children[part] = { type: "directory", children: {} };
        current = current.children[part];
      }
      await saveToDB("user_filesystems", userId, userFS);
      return `Created directory: ${fullPath}`;
    },
  },
  rm: {
    execute: async (userId, args) => {
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const fullPath = resolvePath(userFS.currentDir, args.join(" "));
      const pathParts = fullPath.split("/").filter(p => p);
      const target = pathParts.pop();
      let current = userFS.fs["/"];
      for (const part of pathParts) {
        if (!current.children[part]) return `rm: ${fullPath}: No such file/directory`;
        current = current.children[part];
      }
      if (!current.children[target]) return `rm: ${fullPath}: Not found`;
      delete current.children[target];
      await saveToDB("user_filesystems", userId, userFS);
      return `Removed: ${fullPath}`;
    },
  },
  cat: {
    execute: async (userId, args) => {
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const fullPath = resolvePath(userFS.currentDir, args.join(" "));
      const pathParts = fullPath.split("/").filter(p => p);
      let current = userFS.fs["/"];
      for (const part of pathParts) {
        if (!current.children[part]) return `cat: ${fullPath}: No such file`;
        current = current.children[part];
      }
      if (current.readOnly && current.hidden) return `cat: ${fullPath}: Permission denied`;
      return current.type === "file" ? current.content || "(empty file)" : `cat: ${fullPath}: Is a directory`;
    },
  },
};

const installableCommands = {
  echo: {
    execute: async (interaction, userId, args) => {
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const splitIndex = args.indexOf(">>");
      let content = "";
      if (splitIndex === -1) {
        content = args.join(" ");
      } else {
        content = args.slice(0, splitIndex).join(" ");
      }
      if (content.length > MAX_CONTENT_LENGTH) return `Error: File content exceeds the limit of ${MAX_CONTENT_LENGTH} characters.`;
      if (splitIndex !== -1) {
        const filePath = resolvePath(userFS.currentDir, args.slice(splitIndex + 1).join(" "));
        const pathParts = filePath.split("/").filter(p => p);
        const fileName = pathParts.pop();
        let current = userFS.fs["/"];
        for (const part of pathParts) {
          if (!current.children[part]) current.children[part] = { type: "directory", children: {} };
          current = current.children[part];
        }
        current.children[fileName] = { type: "file", content };
        await saveToDB("user_filesystems", userId, userFS);
        return `Written to ${filePath}`;
      }
      return content;
    },
  },
  edit: {
    execute: async () => 'edit: Use the "edit-file" action (with the arg0 field specifying the filename) to use the edit command!',
  },
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName("terminal")
    .setDescription("Simulates a Terminal using modals for command input")
    .setContexts(0, 1, 2)
    .addStringOption(option =>
      option
        .setName("action")
        .setDescription("Select an action")
        .addChoices(
          { name: "clear-history", value: "clear-history" },
          { name: "view-history", value: "view-history" },
          { name: "edit-file", value: "edit-file" }
        )
    )
    .addStringOption(option =>
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
    } else if (action === "view-history") {
      const histories = await loadFromDB("user_histories", userId, []);
      await interaction.reply({ content: `\`\`\`\n${histories.join("\n")}\n\`\`\`` });
      return;
    } else if (action === "edit-file") {
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
        let current = userFS.fs["/"];
        const pathParts = fullPath.split("/").filter(p => p);
        for (const part of pathParts) {
          current = current.children[part];
          if (!current) break;
        }
        if (current && current.type === "file") existingContent = current.content || "";
      } catch {}
      if (existingContent.length > MAX_CONTENT_LENGTH) existingContent = existingContent.substring(0, MAX_CONTENT_LENGTH);
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
    } else {
      const modal = new ModalBuilder().setCustomId("terminal:input").setTitle("Terminal Command Input");
      const commandInput = new TextInputBuilder().setCustomId("command").setLabel("Command").setStyle(TextInputStyle.Short).setRequired(true);
      modal.addComponents(new ActionRowBuilder().addComponents(commandInput));
      await interaction.showModal(modal);
    }
  },
  async handleModal(interaction) {
    if (!interaction.isModalSubmit()) return;
    await interaction.deferReply();
    const userId = interaction.user.id;
    try {
      if (interaction.customId === "terminal:input") {
        let commandField = interaction.fields.getTextInputValue("command").trim();
        const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
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
          Object.keys(defVars).forEach(varName => {
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
        
        for (let i = 0; i < chainedCommands.length; i++) {
          const cmd = chainedCommands[i].trim();
          if (!cmd) continue;
          
          // Only execute next command if previous succeeded
          if (success) {
            const parts = cmd.match(/(".*?"|'.*?'|\S+)/g) || [];
            const command = parts[0]?.toLowerCase() || "";
            const args = parts.slice(1).map(arg => arg.replace(/^[\"']|[\"']$/g, ""));
            let output = "";
            
            if (command === "edit") {
              output = 'edit: Use the "edit-file" action (with the arg0 field specifying the filename) to use the edit command!';
            } else if (systemCommands[command]) {
              output = await systemCommands[command].execute(userId, args);
            } else {
              const pkgFile = userFS.fs["/"].children.sys.children.pkgs.children[`${command}.pkg`];
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
            
            if (output) {
              outputs.push(output);
            }
            
            // Check if command failed and should break the chain
            if (output && (
                output.startsWith("Command not found:") || 
                output.startsWith("Command '") && output.includes("' is available but not installed") ||
                output.startsWith("pkg: Unknown") ||
                output.includes(": No such")
            )) {
              success = false;
            }
          } else {
            // Command chain broken, don't execute further commands
            break;
          }
        }
        
        // Add all outputs as a single combined entry in history
        if (outputs.length > 0) {
          histories.push(outputs.join('\n'));
        }
        
        histories = histories.slice(-16); // Limit history size
        await saveToDB("user_histories", userId, histories);
        await interaction.editReply({ content: `\`\`\`\n${histories.join("\n")}\n\`\`\`` });
      } else if (interaction.customId === "terminal:editfile") {
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
        const pathParts = fullPath.split("/").filter(p => p);
        const justFileName = pathParts.pop();
        let current = userFS.fs["/"];
        for (const part of pathParts) {
          if (!current.children[part]) current.children[part] = { type: "directory", children: {} };
          current = current.children[part];
        }
        if (current.children[justFileName]?.readOnly) {
          await interaction.editReply({ content: "Error: This file is read-only and cannot be edited." });
          return;
        }
        current.children[justFileName] = { type: "file", content: contentField };
        const output = `Updated file: ${fullPath}`;
        histories.push(output);
        histories = histories.slice(-16);
        await saveToDB("user_filesystems", userId, userFS);
        await saveToDB("user_histories", userId, histories);
        await interaction.editReply({ content: `\`\`\`\n${histories.join("\n")}\n\`\`\`` });
      } else if (interaction.customId.startsWith("edit:")) {
        const [, originalUserId, fullPath] = interaction.customId.split(":");
        const content = interaction.fields.getTextInputValue("content");
        const userFS = await loadFromDB("user_filesystems", originalUserId, createFilesystem());
        const pathParts = fullPath.split("/").filter(p => p);
        const fileName = pathParts.pop();
        let current = userFS.fs["/"];
        for (const part of pathParts) {
          if (!current.children[part]) current.children[part] = { type: "directory", children: {} };
          current = current.children[part];
        }
        if (current.children[fileName]?.readOnly) {
          await interaction.editReply({ content: "Error: This file is read-only and cannot be edited." });
          return;
        }
        current.children[fileName] = { type: "file", content };
        await saveToDB("user_filesystems", originalUserId, userFS);
        const histories = await loadFromDB("user_histories", originalUserId, []);
        const newHistory = [...histories, `Updated file: ${fullPath}`].slice(-16);
        await saveToDB("user_histories", originalUserId, newHistory);
        await interaction.editReply({ content: `\`\`\`\n${newHistory.join("\n")}\n\`\`\`` });
      }
    } catch (error) {
      console.error("Modal handling error:", error);
      await interaction.editReply({ content: "An error occurred while processing your command" });
    }
  },
};