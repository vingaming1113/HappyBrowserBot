const path = require("node:path");
const { loadFromDB, saveToDB } = require("../../../db/utils");
const { resolvePath, getObjectAtPath, createFilesystem, MAX_CONTENT_LENGTH } = require("./filesystem");

// System commands that are always available
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
      if (!args.length) return "touch: Missing filename";
      
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const fullPath = resolvePath(userFS.currentDir, args.join(" "));
      
      const { parent, fileName, found, error } = getObjectAtPath(userFS, fullPath, true);
      if (error) return `touch: ${error}`;
      
      // Create/update the file
      parent.children[fileName] = { type: "file", content: "" };
      
      await saveToDB("user_filesystems", userId, userFS);
      return `Created file: ${fullPath}`;
    },
  },
  
  test: {
    execute: async (userId, args) => `Test command executed with args: ${args.join(" ")}`,
  },
  
  mkdir: {
    execute: async (userId, args) => {
      if (!args.length) return "mkdir: Missing directory name";
      
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const fullPath = resolvePath(userFS.currentDir, args.join(" "));
      
      const { parent, fileName, error } = getObjectAtPath(userFS, fullPath, true);
      if (error) return `mkdir: ${error}`;
      
      if (parent.children[fileName] && parent.children[fileName].type !== "directory") {
        return `mkdir: Cannot create directory '${fileName}': File exists`;
      }
      
      parent.children[fileName] = { type: "directory", children: {} };
      await saveToDB("user_filesystems", userId, userFS);
      return `Created directory: ${fullPath}`;
    },
  },
  
  rm: {
    execute: async (userId, args) => {
      if (!args.length) return "rm: Missing filename";
      
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const fullPath = resolvePath(userFS.currentDir, args.join(" "));
      
      const { parent, fileName, found, error } = getObjectAtPath(userFS, fullPath);
      if (error) return `rm: ${error}`;
      if (!found) return `rm: ${fullPath}: No such file or directory`;
      
      delete parent.children[fileName];
      await saveToDB("user_filesystems", userId, userFS);
      return `Removed: ${fullPath}`;
    },
  },
  
  cat: {
    execute: async (userId, args) => {
      if (!args.length) return "cat: Missing filename";
      
      const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
      const fullPath = resolvePath(userFS.currentDir, args.join(" "));
      
      const { target, found, error } = getObjectAtPath(userFS, fullPath);
      if (error) return `cat: ${error}`;
      if (!found) return `cat: ${fullPath}: No such file`;
      
      if (target.type === "directory") return `cat: ${fullPath}: Is a directory`;
      if (target.readOnly && target.hidden) return `cat: ${fullPath}: Permission denied`;
      
      return target.content || "(empty file)";
    },
  },
};

// Commands that need to be installed via pkg manager
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
      
      if (content.length > MAX_CONTENT_LENGTH) {
        return `Error: File content exceeds the limit of ${MAX_CONTENT_LENGTH} characters.`;
      }
      
      if (splitIndex !== -1) {
        const filePath = resolvePath(userFS.currentDir, args.slice(splitIndex + 1).join(" "));
        const { parent, fileName, error } = getObjectAtPath(userFS, filePath, true);
        
        if (error) return `echo: ${error}`;
        
        parent.children[fileName] = { type: "file", content };
        await saveToDB("user_filesystems", userId, userFS);
        return `Written to ${filePath}`;
      }
      
      return content;
    },
  },
  
  edit: {
    execute: async () => 'edit: Use the "edit-file" action (with the arg0 field specifying the filename) to use the edit command!',
  },

  happyphone: {
    execute: async () => 'Make it happy RN',
  },
};

module.exports = {
  systemCommands,
  installableCommands
};