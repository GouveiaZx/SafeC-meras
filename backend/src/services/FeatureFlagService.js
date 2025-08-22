/**
 * FeatureFlagService - Runtime feature flag management
 * Provides centralized feature toggle control without restarts
 */

import { createModuleLogger } from '../config/logger.js';

const logger = createModuleLogger('FeatureFlagService');

class FeatureFlagService {
  constructor() {
    this.flags = new Map();
    this.loadFromEnvironment();
    
    logger.info('FeatureFlagService initialized', {
      flags_loaded: this.flags.size
    });
  }

  /**
   * Load feature flags from environment variables
   */
  loadFromEnvironment() {
    const featureFlags = {
      // S3 Upload Features
      's3_upload_enabled': process.env.S3_UPLOAD_ENABLED === 'true',
      'prefer_s3_streaming': process.env.PREFER_S3_STREAMING === 'true',
      'enable_upload_queue': process.env.ENABLE_UPLOAD_QUEUE === 'true',
      'delete_local_after_upload': process.env.DELETE_LOCAL_AFTER_UPLOAD === 'true',
      
      // Recording Features
      'recording_enabled': process.env.RECORDING_ENABLED === 'true',
      'auto_delete_recordings': process.env.AUTO_DELETE_RECORDINGS === 'true',
      
      // Monitoring Features
      'monitoring_enabled': process.env.MONITORING_ENABLED === 'true',
      'notifications_enabled': process.env.NOTIFICATIONS_ENABLED === 'true',
      
      // AI/ML Features
      'ai_enabled': process.env.AI_ENABLED === 'true',
      'motion_detection_enabled': process.env.MOTION_DETECTION_ENABLED === 'true',
      'object_detection_enabled': process.env.OBJECT_DETECTION_ENABLED === 'true',
      'face_recognition_enabled': process.env.FACE_RECOGNITION_ENABLED === 'true',
      
      // Backup Features
      'backup_enabled': process.env.BACKUP_ENABLED === 'true'
    };

    // Load into flags map
    Object.entries(featureFlags).forEach(([key, value]) => {
      this.flags.set(key, value);
    });

    logger.debug('Feature flags loaded from environment:', featureFlags);
  }

  /**
   * Check if a feature flag is enabled
   * @param {string} flagName - Feature flag name
   * @param {boolean} defaultValue - Default value if flag not found
   * @returns {boolean} - Flag status
   */
  isEnabled(flagName, defaultValue = false) {
    if (!this.flags.has(flagName)) {
      logger.warn(`Feature flag not found: ${flagName}, using default: ${defaultValue}`);
      return defaultValue;
    }
    
    return this.flags.get(flagName);
  }

  /**
   * Set a feature flag value (runtime override)
   * @param {string} flagName - Feature flag name
   * @param {boolean} value - Flag value
   */
  setFlag(flagName, value) {
    const oldValue = this.flags.get(flagName);
    this.flags.set(flagName, value);
    
    logger.info(`Feature flag updated: ${flagName}`, {
      old_value: oldValue,
      new_value: value
    });
  }

  /**
   * Get all feature flags
   * @returns {Object} - All feature flags
   */
  getAllFlags() {
    const flags = {};
    this.flags.forEach((value, key) => {
      flags[key] = value;
    });
    return flags;
  }

  /**
   * Check multiple flags at once
   * @param {Array<string>} flagNames - Array of flag names
   * @returns {Object} - Object with flag statuses
   */
  checkFlags(flagNames) {
    const result = {};
    flagNames.forEach(flagName => {
      result[flagName] = this.isEnabled(flagName);
    });
    return result;
  }

  /**
   * Enable a feature flag
   * @param {string} flagName - Feature flag name
   */
  enable(flagName) {
    this.setFlag(flagName, true);
  }

  /**
   * Disable a feature flag
   * @param {string} flagName - Feature flag name
   */
  disable(flagName) {
    this.setFlag(flagName, false);
  }

  /**
   * Toggle a feature flag
   * @param {string} flagName - Feature flag name
   */
  toggle(flagName) {
    const currentValue = this.isEnabled(flagName);
    this.setFlag(flagName, !currentValue);
  }

  /**
   * Reset flags to environment defaults
   */
  resetToDefaults() {
    logger.info('Resetting feature flags to environment defaults');
    this.flags.clear();
    this.loadFromEnvironment();
  }

  /**
   * Get feature flag statistics
   * @returns {Object} - Statistics about feature flags
   */
  getStats() {
    const flags = this.getAllFlags();
    const enabled = Object.values(flags).filter(Boolean).length;
    const disabled = Object.values(flags).filter(v => !v).length;
    
    return {
      total: this.flags.size,
      enabled,
      disabled,
      flags
    };
  }

  /**
   * Validate feature flag dependencies
   * @returns {Object} - Validation results
   */
  validateDependencies() {
    const issues = [];
    const warnings = [];

    // S3 upload dependencies
    if (this.isEnabled('s3_upload_enabled') && !this.isEnabled('enable_upload_queue')) {
      issues.push('S3 upload enabled but upload queue disabled');
    }

    // Streaming preferences
    if (this.isEnabled('prefer_s3_streaming') && !this.isEnabled('s3_upload_enabled')) {
      warnings.push('S3 streaming preferred but S3 upload disabled');
    }

    // Recording dependencies
    if (this.isEnabled('auto_delete_recordings') && !this.isEnabled('recording_enabled')) {
      issues.push('Auto delete recordings enabled but recording disabled');
    }

    // AI dependencies
    if (this.isEnabled('object_detection_enabled') && !this.isEnabled('ai_enabled')) {
      issues.push('Object detection enabled but AI disabled');
    }

    if (this.isEnabled('face_recognition_enabled') && !this.isEnabled('ai_enabled')) {
      issues.push('Face recognition enabled but AI disabled');
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings
    };
  }

  /**
   * Create a feature gate function for specific feature
   * @param {string} flagName - Feature flag name
   * @returns {Function} - Gate function
   */
  createGate(flagName) {
    return (callback, fallback = null) => {
      if (this.isEnabled(flagName)) {
        return callback();
      } else if (fallback) {
        return fallback();
      }
      return null;
    };
  }

  /**
   * Create middleware for Express routes
   * @param {string} flagName - Feature flag name
   * @returns {Function} - Express middleware
   */
  createMiddleware(flagName) {
    return (req, res, next) => {
      if (this.isEnabled(flagName)) {
        next();
      } else {
        res.status(404).json({
          error: 'Feature not available',
          feature: flagName
        });
      }
    };
  }
}

// Export singleton instance
export default new FeatureFlagService();