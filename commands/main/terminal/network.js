/**
 * Network simulation system for terminal operations
 */
const { loadFromDB, saveToDB } = require("../../../db/utils");

// Default network configuration
const DEFAULT_CONFIG = {
  speed: 500, // Mbps
  latency: 20, // ms
  packetLoss: 0, // percentage
  jitter: 0, // ms
  enabled: true,
};

// Package sizes in KB
const PACKAGE_SIZES = {
  echo: 472,
  edit: 8400,
  test: 407,
  "edit-file": 8400,
  happyphone: 413,
};

// In-memory cache of network configurations
let networkConfigsCache = new Map();

/**
 * Initialize or get network configuration for a user
 * @param {string} userId - User ID
 * @returns {Object} - User's network configuration
 */
async function getUserNetworkConfig(userId) {
  // Check cache first
  if (!networkConfigsCache.has(userId)) {
    // Load from database or use default
    const networkConfig = await loadFromDB("user_network_configs", userId, { ...DEFAULT_CONFIG });
    networkConfigsCache.set(userId, networkConfig);
  }
  return networkConfigsCache.get(userId);
}

/**
 * Save network configuration for a user
 * @param {string} userId - User ID
 * @param {Object} config - Network configuration
 */
async function saveUserNetworkConfig(userId, config) {
  // Update cache
  networkConfigsCache.set(userId, config);
  // Save to database
  await saveToDB("user_network_configs", userId, config);
}

/**
 * Calculate download time for a package based on network speed
 * @param {string} userId - User ID
 * @param {string} packageName - Package name
 * @returns {Object} - Download time details
 */
async function calculateDownloadTime(userId, packageName) {
  const config = await getUserNetworkConfig(userId);
  const packageSize = PACKAGE_SIZES[packageName] || 1024; // Default to 1MB if not specified

  if (!config.enabled) {
    return { time: 0, size: packageSize };
  }

  // Calculate base download time in milliseconds
  // Formula: Size in KB * 8 (to bits) / speed in Mbps / 1000
  const sizeBits = packageSize * 8; // KB to Kb
  const speedKbps = config.speed * 1000; // Mbps to Kbps

  // Time in milliseconds = (size in Kbits / speed in Kbps) * 1000
  let downloadTime = (sizeBits / speedKbps) * 1000;

  // Add network conditions
  downloadTime += config.latency;

  // Add random jitter
  if (config.jitter > 0) {
    const jitterAmount = Math.random() * config.jitter;
    downloadTime += jitterAmount;
  }

  // Account for packet loss by increasing time
  if (config.packetLoss > 0) {
    const packetLossFactor = 1 + config.packetLoss / 100;
    downloadTime *= packetLossFactor;
  }

  // Round to whole number of ms for display
  return {
    time: Math.round(downloadTime),
    size: packageSize,
  };
}

/**
 * Format size in human-readable format
 * @param {number} sizeKB - Size in KB
 * @returns {string} - Formatted size string
 */
function formatSize(sizeKB) {
  if (sizeKB < 1024) {
    return `${sizeKB} KB`;
  } else {
    return `${(sizeKB / 1024).toFixed(2)} MB`;
  }
}

/**
 * Format time in appropriate units
 * @param {number} timeMs - Time in milliseconds
 * @returns {string} - Formatted time string
 */
function formatTime(timeMs) {
  if (timeMs < 1000) {
    return `${timeMs} ms`;
  } else {
    return `${(timeMs / 1000).toFixed(2)} seconds`;
  }
}

/**
 * Create all steps for a download simulation
 * @param {string} userId - User ID
 * @param {string} packageName - Package name
 * @returns {Array} - Array of progress steps
 */
async function createDownloadSteps(userId, packageName) {
  const { time, size } = await calculateDownloadTime(userId, packageName);
  const config = await getUserNetworkConfig(userId);

  if (time === 0 || !config.enabled) {
    return [
      {
        progress: 100,
        message: `Downloaded ${formatSize(size)} instantly`,
        wait: 0,
        complete: true,
      },
    ];
  }

  // Create more granular steps (20 steps for more detailed progress)
  const stepCount = 20;
  const stepSize = 100 / stepCount; // 5% increments
  const baseStepTime = Math.max(500, Math.round(time / stepCount)); // ms per step, minimum 0.5 second
  const steps = [];

  // Generate steps with consistent timing but random small variations
  for (let i = 0; i < stepCount; i++) {
    // Calculate exact percentage for this step (5%, 10%, 15%, etc.)
    const progress = (i + 1) * stepSize;
    const isComplete = i === stepCount - 1;

    // Calculate exact download amount for this percentage
    const downloadedAmount = (size * progress) / 100;

    // Small speed variation for each step (±10%)
    const speedVariation = 1 + (Math.random() * 0.2 - 0.1);
    // Ensure minimum wait time of 500ms (0.5s) but keep total time roughly the same
    const waitTime = Math.max(500, Math.round(baseStepTime * speedVariation));

    // Format the progress to one decimal place
    const formattedProgress = progress.toFixed(1);

    steps.push({
      progress,
      message: isComplete
        ? `Downloaded ${formatSize(size)} in ${formatTime(time)}`
        : `Downloading ${packageName}... ${formattedProgress}% (${formatSize(downloadedAmount.toFixed(1))}/${formatSize(size)})`,
      wait: waitTime,
      complete: isComplete,
    });
  }

  return steps;
}

/**
 * Recalculate download steps based on new network settings
 * @param {string} userId - User ID
 * @param {string} packageName - Package name
 * @param {Object} downloadState - Current download state
 * @returns {Object} - Updated download state with recalculated timings
 */
async function recalculateDownloadSteps(userId, packageName, downloadState) {
  // If download is complete or not started, no need to recalculate
  if (!downloadState || downloadState.currentStep >= downloadState.steps.length) {
    return downloadState;
  }

  const { time, size } = await calculateDownloadTime(userId, packageName);
  const config = await getUserNetworkConfig(userId);

  if (time === 0 || !config.enabled) {
    // Instant download, complete it immediately
    downloadState.currentStep = downloadState.steps.length - 1;
    return downloadState;
  }

  // Calculate how much has been downloaded so far
  const currentProgress = downloadState.steps[downloadState.currentStep].progress;
  const downloadedAmount = (size * currentProgress) / 100;
  const remainingSize = size - downloadedAmount;

  // Calculate time for remaining download based on new speed
  const remainingSizeBits = remainingSize * 8; // KB to Kb
  const speedKbps = config.speed * 1000; // Mbps to Kbps
  const remainingTime = (remainingSizeBits / speedKbps) * 1000;

  // Calculate how many steps remain
  const totalSteps = 20; // Same as in createDownloadSteps
  const stepsRemaining = Math.ceil((100 - currentProgress) / 5); // 5% per step

  if (stepsRemaining <= 0) {
    // Almost done, don't change anything
    return downloadState;
  }

  // Calculate new timing for remaining steps
  const stepSize = (100 - currentProgress) / stepsRemaining;
  const baseStepTime = Math.max(200, Math.round(remainingTime / stepsRemaining));

  // Create new steps starting from current progress
  const newSteps = [];
  for (let i = 0; i < stepsRemaining; i++) {
    const progress = currentProgress + (i + 1) * stepSize;
    const isComplete = i === stepsRemaining - 1 || progress >= 100;
    const actualProgress = Math.min(progress, 100);

    // Calculate download amount for this step
    const stepDownloadedAmount = (size * actualProgress) / 100;

    // Add variation for more realism
    const speedVariation = 1 + (Math.random() * 0.2 - 0.1); // ±10% variation
    const waitTime = Math.max(200, Math.round(baseStepTime * speedVariation));

    newSteps.push({
      progress: actualProgress,
      message: isComplete
        ? `Downloaded ${formatSize(size)} in ${formatTime(remainingTime + (currentProgress / 100) * time)}`
        : `Downloading ${packageName}... ${actualProgress.toFixed(1)}% (${formatSize(stepDownloadedAmount)}/${formatSize(size)})`,
      wait: waitTime,
      complete: isComplete,
    });
  }

  // Keep completed steps, replace remaining ones
  downloadState.steps = [...downloadState.steps.slice(0, downloadState.currentStep + 1), ...newSteps];

  return downloadState;
}

module.exports = {
  calculateDownloadTime,
  createDownloadSteps,
  formatSize,
  formatTime,
  PACKAGE_SIZES,
  getUserNetworkConfig,
  saveUserNetworkConfig,
  recalculateDownloadSteps,
};
