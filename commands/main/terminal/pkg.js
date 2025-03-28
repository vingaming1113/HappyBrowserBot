const { loadFromDB, saveToDB } = require("../../../db/utils");
const { createFilesystem } = require("./filesystem");

// OS and package versioning
const latestOSVersion = "1.0.0.1";
const osBranches = {
  "stable": latestOSVersion,
  "unstable": "1.0.0.2"
};

// Package definitions with version requirements
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
  },
  "happyphone": {
    stable: { minVersion: "1.0.0" },
    unstable: { minVersion: "1.0.0" }
  },
  "happybrowser": {
    stable: { minVersion: "1.0.0" },
    unstable: { minVersion: "1.0.0" }
  }
};

/**
 * Compare two semantic version strings
 * @param {string} version1 - First version to compare
 * @param {string} version2 - Second version to compare
 * @returns {number} -1 if v1<v2, 0 if equal, 1 if v1>v2
 */
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

/**
 * Check if a package is available for the current OS version and branch
 * @param {string} packageName - Package to check availability
 * @param {string} osVersion - OS version
 * @param {string} osBranch - OS branch (stable/unstable)
 * @returns {boolean} - Whether package is available
 */
function isPackageAvailable(packageName, osVersion, osBranch) {
  // If package doesn't exist in definitions
  if (!packageDefinitions[packageName]) return false;
  
  // If package doesn't support this branch
  if (!packageDefinitions[packageName][osBranch]) return false;
  
  // Check version compatibility
  const minVersion = packageDefinitions[packageName][osBranch].minVersion;
  return compareVersions(osVersion, minVersion) >= 0;
}

/**
 * Package manager command 
 */
async function pkgCommand(userId, args) {
  const subcommand = args[0];
  if (!subcommand) {
    return 'pkg: Missing subcommand. Use "install", "remove", "list", "search", "branches", or "upgrade".';
  }
  
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
    
    // Ensure OS directory exists with required files
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
  
  switch (subcommand) {
    case "install": {
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
    }
    
    case "remove": {
      const pkgName = args[1];
      if (!pkgName) return "Usage: pkg remove <package>";
      if (!pkgDir[`${pkgName}.pkg`]) return `pkg: Package not found: ${pkgName}`;
      
      delete pkgDir[`${pkgName}.pkg`];
      await saveToDB("user_filesystems", userId, userFS);
      return `Removed package: ${pkgName}`;
    }
    
    case "list": {
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
    }
    
    case "search": {
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
    }
    
    case "branches": {
      // Show available branches and their versions
      const branches = Object.entries(osBranches)
        .map(([branch, version]) => `${branch}: ${version}${branch === currentBranch ? " (current)" : ""}`)
        .join("\n");
        
      return `Available branches:\n${branches}`;
    }
    
    default:
      return 'pkg: Invalid subcommand. Use "install", "remove", "list", "search", "branches", or "upgrade".';
  }
}

module.exports = {
  pkgCommand,
  isPackageAvailable,
  packageDefinitions,
  latestOSVersion,
  osBranches
};