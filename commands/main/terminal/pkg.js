const { loadFromDB, saveToDB } = require("../../../db/utils");
const { createFilesystem } = require("./filesystem");
const { createDownloadSteps, PACKAGE_SIZES, formatSize } = require("./network");

// OS and package versioning
const latestOSVersion = "1.0.0.1";
const osBranches = {
  stable: latestOSVersion,
  unstable: "1.0.0.2",
};

// Package definitions with version requirements
const packageDefinitions = {
  echo: {
    stable: { minVersion: "1.0.0" },
    unstable: { minVersion: "1.0.0" },
  },
  edit: {
    stable: { minVersion: "1.0.0" },
    unstable: { minVersion: "1.0.0" },
  },
  test: {
    stable: { minVersion: "1.0.0" },
    unstable: { minVersion: "1.0.0" },
  },
  "edit-file": {
    stable: { minVersion: "1.0.0" },
    unstable: { minVersion: "1.0.0" },
  },
  happyphone: {
    stable: { minVersion: "1.0.0" },
    unstable: { minVersion: "1.0.0" },
  },
};

// Active downloads tracking
const activeDownloads = new Map();

/**
 * Compare two semantic version strings
 * @param {string} version1 - First version to compare
 * @param {string} version2 - Second version to compare
 * @returns {number} -1 if v1<v2, 0 if equal, 1 if v1>v2
 */
function compareVersions(version1, version2) {
  const v1Parts = version1.split(".").map(Number);
  const v2Parts = version2.split(".").map(Number);

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
 * Check if a package is currently being downloaded
 * @param {string} userId - User ID
 * @param {string} packageName - Package name
 * @returns {Object|null} - Current download state or null
 */
function getDownloadStatus(userId, packageName) {
  const key = `${userId}:${packageName}`;
  return activeDownloads.get(key) || null;
}

/**
 * Set active download for a package
 * @param {string} userId - User ID
 * @param {string} packageName - Package name
 * @param {Object} downloadState - Download state
 */
function setDownloadStatus(userId, packageName, downloadState) {
  const key = `${userId}:${packageName}`;
  if (!downloadState) {
    activeDownloads.delete(key);
  } else {
    activeDownloads.set(key, downloadState);
  }
}

/**
 * Process the next step in a download
 * @param {string} userId - User ID
 * @param {Object} userFS - User filesystem
 * @param {string} packageName - Package being downloaded
 * @param {boolean} initialRequest - Whether this is the initial download request
 * @returns {string} - Message to display
 */
async function processDownload(userId, userFS, packageName, initialRequest = false) {
  const downloadState = getDownloadStatus(userId, packageName);

  // If a download is already in progress
  if (downloadState) {
    // If we haven't completed all steps
    if (downloadState.currentStep < downloadState.steps.length) {
      const step = downloadState.steps[downloadState.currentStep];

      // If this is a repeat check, check if enough time has passed for next step
      if (!initialRequest) {
        const now = Date.now();
        const elapsed = now - downloadState.lastUpdate;

        if (elapsed >= step.wait) {
          // Move to next step
          downloadState.currentStep++;
          downloadState.lastUpdate = now;

          // If we have a next step, return its message
          if (downloadState.currentStep < downloadState.steps.length) {
            return downloadState.steps[downloadState.currentStep].message;
          }

          // Otherwise, this is the final step - install the package
          const pkgDir = userFS.fs["/"].children.sys.children.pkgs.children;
          const currentVersion = userFS.fs["/"].children.sys.children.os_version?.content || "1.0.0";
          const currentBranch = userFS.fs["/"].children.sys.children.os_branch?.content || "stable";

          // Create package entry
          pkgDir[`${packageName}.pkg`] = {
            type: "file",
            content: `Package: ${packageName}\nVersion: ${currentVersion}\nBranch: ${currentBranch}`,
          };

          await saveToDB("user_filesystems", userId, userFS);
          setDownloadStatus(userId, packageName, null); // Clear download
          return `Package ${packageName} installed successfully`;
        } else {
          // Not enough time has passed, return current step message
          return step.message;
        }
      } else {
        // Initial request, just show current step
        return step.message;
      }
    } else {
      // Download is complete, remove tracking
      setDownloadStatus(userId, packageName, null);
      return `Package ${packageName} installed successfully`;
    }
  } else if (initialRequest) {
    // Start new download
    const steps = await createDownloadSteps(userId, packageName);

    // If we have instant download
    if (steps.length === 1 && steps[0].wait === 0) {
      const pkgDir = userFS.fs["/"].children.sys.children.pkgs.children;
      const currentVersion = userFS.fs["/"].children.sys.children.os_version?.content || "1.0.0";
      const currentBranch = userFS.fs["/"].children.os_branch?.content || "stable";

      // Create package entry immediately
      pkgDir[`${packageName}.pkg`] = {
        type: "file",
        content: `Package: ${packageName}\nVersion: ${currentVersion}\nBranch: ${currentBranch}`,
      };

      await saveToDB("user_filesystems", userId, userFS);
      return `Installed package: ${packageName}`;
    }

    // Set up new download state with initial step
    setDownloadStatus(userId, packageName, {
      steps,
      currentStep: 0,
      lastUpdate: Date.now() - 2000, // Start 2 seconds in the past to make first step advance quickly
    });

    // Return first step message
    return `Started downloading ${packageName}...\n${steps[0].message}`;
  } else {
    // No download in progress and not an initial request
    return null;
  }
}

/**
 * Package manager command
 * @param {string} userId - User ID
 * @param {Array} args - Command arguments
 * @returns {string} - Command output
 */
async function pkgCommand(userId, args) {
  const subcommand = args[0];
  if (!subcommand) {
    return 'pkg: Missing subcommand. Use "install", "remove", "list", "search", "branches", "status", or "upgrade".';
  }

  const userFS = await loadFromDB("user_filesystems", userId, createFilesystem());
  const sysDir = userFS.fs["/"].children.sys;

  // Make sure os_branch exists
  if (!sysDir.children.os_branch) {
    sysDir.children.os_branch = { type: "file", content: "stable" };
  }

  if (subcommand === "upgrade") {
    // Check for branch option
    const branchIndex = args.findIndex((arg) => arg.startsWith("--"));
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
    const isDowngrade = currentBranch === "unstable" && targetBranch === "stable" && compareVersions(currentVersion, targetVersion) > 0;

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
      return `System ${currentVersion === targetVersion ? "switched" : "upgraded"} successfully to version ${targetVersion} (${targetBranch} branch).`;
    }
  }

  const pkgDir = sysDir.children.pkgs.children;
  const currentVersion = sysDir.children.os_version?.content || "1.0.0";
  const currentBranch = sysDir.children.os_branch?.content || "stable";

  switch (subcommand) {
    case "install": {
      const pkgName = args[1];
      if (!pkgName) return "Usage: pkg install <package>";

      // Check if the package is already installed
      if (pkgDir[`${pkgName}.pkg`]) {
        return `pkg: Package '${pkgName}' is already installed.`;
      }

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

      // Cancel any existing download for this package
      setDownloadStatus(userId, pkgName, null);

      // Check if there's an existing download or start a new one
      return await processDownload(userId, userFS, pkgName, true);
    }

    case "remove": {
      const pkgName = args[1];
      if (!pkgName) return "Usage: pkg remove <package>";

      // Cancel any ongoing download
      setDownloadStatus(userId, pkgName, null);

      if (!pkgDir[`${pkgName}.pkg`]) return `pkg: Package not found: ${pkgName}`;

      delete pkgDir[`${pkgName}.pkg`];
      await saveToDB("user_filesystems", userId, userFS);
      return `Removed package: ${pkgName}`;
    }

    case "list": {
      const pageArgIndex = args.indexOf("--page");
      const pageNumber = pageArgIndex !== -1 ? parseInt(args[pageArgIndex + 1], 10) || 1 : 1;
      const pageSize = 5;
      const installedPackages = Object.keys(pkgDir).map((pkg) => pkg.replace(".pkg", ""));
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

      // Add package sizes to the listing
      const packagesWithSizes = pagePackages.map((pkg) => {
        const size = PACKAGE_SIZES[pkg] || 0;
        return `${pkg} (${formatSize(size)})`;
      });

      return `Installed Packages (Page ${pageNumber}/${totalPages}):\n${packagesWithSizes.join("\n")}`;
    }

    case "search": {
      const query = args[1]?.toLowerCase();
      const pageSize = 6;

      // Filter available packages based on current OS version and branch
      const allPackages = Object.keys(packageDefinitions).filter((pkg) => isPackageAvailable(pkg, currentVersion, currentBranch));

      const filteredPackages = query ? allPackages.filter((pkg) => pkg.toLowerCase().includes(query)) : allPackages;

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

      // Add package sizes to the listing
      const packagesWithSizes = pagePackages.map((pkg) => {
        const size = PACKAGE_SIZES[pkg] || 0;
        return `${pkg} (${formatSize(size)})`;
      });

      return `Search Results for "${
        query || "all"
      }" (${currentBranch} branch, v${currentVersion}) (Page ${pageNumber}/${totalPages}):\n${packagesWithSizes.join("\n")}`;
    }

    case "branches": {
      // Show available branches and their versions
      const branches = Object.entries(osBranches)
        .map(([branch, version]) => `${branch}: ${version}${branch === currentBranch ? " (current)" : ""}`)
        .join("\n");

      return `Available branches:\n${branches}`;
    }

    case "status": {
      // Check if a specific package download is in progress
      const pkgName = args[1];

      if (pkgName) {
        const downloadState = getDownloadStatus(userId, pkgName);
        if (downloadState) {
          const step = downloadState.steps[downloadState.currentStep];
          return step.message;
        } else {
          return `No download in progress for ${pkgName}`;
        }
      } else {
        // Check all downloads for this user
        const activeUserDownloads = Array.from(activeDownloads.keys())
          .filter((key) => key.startsWith(`${userId}:`))
          .map((key) => key.split(":")[1]);

        if (activeUserDownloads.length === 0) {
          return "No package downloads in progress";
        } else {
          return `Active downloads: ${activeUserDownloads.join(", ")}`;
        }
      }
    }

    default:
      return 'pkg: Invalid subcommand. Use "install", "remove", "list", "search", "branches", "status", or "upgrade".';
  }
}

module.exports = {
  pkgCommand,
  isPackageAvailable,
  packageDefinitions,
  latestOSVersion,
  osBranches,
  processDownload,
  getDownloadStatus,
};
