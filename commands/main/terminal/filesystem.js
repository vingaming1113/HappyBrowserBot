const path = require("node:path");

// Max content length for files
const MAX_CONTENT_LENGTH = 10000;

/**
 * Resolves a relative or absolute path
 * @param {string} currentDir - Current directory path
 * @param {string} targetPath - Target path to resolve
 * @returns {string} - Resolved absolute path
 */
function resolvePath(currentDir, targetPath) {
  const isAbsolute = targetPath.startsWith("/");
  const segments = targetPath.split("/").filter(p => p);
  let parts = isAbsolute ? segments : [...currentDir.split("/").filter(p => p), ...segments];
  const resolved = [];
  
  for (const part of parts) {
    if (part === "..") {
      resolved.pop();
    } else if (part !== ".") {
      resolved.push(part);
    }
  }
  
  return `/${resolved.join("/")}`;
}

/**
 * Retrieves an object at a specified path in the filesystem
 * @param {Object} filesystem - User's filesystem
 * @param {string} path - Path to navigate to
 * @param {boolean} createDirs - Whether to create missing directories
 * @returns {Object} - Object containing result and parent information
 */
function getObjectAtPath(filesystem, path, createDirs = false) {
  const parts = path.split("/").filter(p => p);
  const fileName = parts.pop();
  let current = filesystem.fs["/"];
  let parent = null;
  
  // Navigate through the path
  for (const part of parts) {
    parent = current;
    if (!current.children[part]) {
      if (createDirs) {
        current.children[part] = { type: "directory", children: {} };
      } else {
        return { found: false, error: `Path not found: /${parts.join("/")}` };
      }
    }
    current = current.children[part];
    if (current.type !== "directory") {
      return { found: false, error: `Not a directory: /${parts.join("/")}` };
    }
  }
  
  return { 
    found: current.children && fileName in current.children, 
    target: current.children?.[fileName],
    parent: current,
    fileName
  };
}

/**
 * Creates default filesystem structure for new users
 * @returns {Object} - Default filesystem object
 */
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

module.exports = {
  resolvePath,
  getObjectAtPath,
  createFilesystem,
  MAX_CONTENT_LENGTH
};