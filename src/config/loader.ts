/**
 * Configuration loader with environment variable substitution.
 * Loads configuration from file and merges with defaults.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { DEFAULT_CONFIG, getPreset } from "./default.js";
import type { Config } from "./schema.js";

/**
 * Configuration loader class.
 */
export class ConfigLoader {
  private configPath: string;
  private config: Config;

  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = DEFAULT_CONFIG;
  }

  /**
   * Get default configuration path.
   */
  private getDefaultConfigPath(): string {
    // Try SEMANTICA_CONFIG_PATH environment variable
    if (process.env.SEMANTICA_CONFIG_PATH) {
      return process.env.SEMANTICA_CONFIG_PATH;
    }

    // Default to .semantica/config.json in current directory
    return join(process.cwd(), ".semantica", "config.json");
  }

  /**
   * Load configuration from file.
   * Merges with defaults and supports environment variable substitution.
   */
  load(): Config {
    // Start with default config
    let config = { ...DEFAULT_CONFIG };

    // If config file exists, load and merge
    if (existsSync(this.configPath)) {
      try {
        const fileContent = readFileSync(this.configPath, "utf-8");
        const userConfig = JSON.parse(fileContent);

        // Substitute environment variables
        const processedConfig = this.substituteEnvVars(userConfig);

        // Deep merge with defaults
        config = this.deepMerge(config, processedConfig);
      } catch (error) {
        throw new Error(
          `Failed to load configuration from ${this.configPath}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    this.config = config;
    return config;
  }

  /**
   * Load configuration with a preset applied.
   */
  loadWithPreset(presetName: string): Config {
    // Load base config
    let config = this.load();

    // Get preset
    const preset = getPreset(presetName);
    if (!preset) {
      throw new Error(`Unknown preset: ${presetName}`);
    }

    // Merge preset with config
    config = this.deepMerge(config, preset);

    this.config = config;
    return config;
  }

  /**
   * Get current configuration.
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * Substitute environment variables in configuration.
   * Supports ${VAR_NAME} syntax.
   */
  private substituteEnvVars(obj: any): any {
    if (typeof obj === "string") {
      // Match ${VAR_NAME} pattern
      return obj.replace(/\$\{([^}]+)\}/g, (_, varName) => {
        const value = process.env[varName];
        if (value === undefined) {
          throw new Error(`Environment variable ${varName} is not defined`);
        }
        return value;
      });
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.substituteEnvVars(item));
    }

    if (typeof obj === "object" && obj !== null) {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteEnvVars(value);
      }
      return result;
    }

    return obj;
  }

  /**
   * Deep merge two objects.
   * Later object takes precedence.
   */
  private deepMerge(target: any, source: any): any {
    if (!source) return target;
    if (!target) return source;

    const result = { ...target };

    for (const key of Object.keys(source)) {
      // Arrays should be replaced, not merged
      if (Array.isArray(source[key])) {
        result[key] = source[key];
      } else if (
        source[key] instanceof Object &&
        key in target &&
        !Array.isArray(target[key])
      ) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Save configuration to file.
   */
  save(config: Config, path?: string): void {
    const savePath = path || this.configPath;

    try {
      const content = JSON.stringify(config, null, 2);
      const fs = require("fs");
      const pathModule = require("path");

      // Create directory if it doesn't exist
      const dir = pathModule.dirname(savePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(savePath, content, "utf-8");
    } catch (error) {
      throw new Error(
        `Failed to save configuration to ${savePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}

/**
 * Load configuration from default path or specified path.
 */
export function loadConfig(configPath?: string): Config {
  const loader = new ConfigLoader(configPath);
  return loader.load();
}

/**
 * Load configuration with a preset.
 */
export function loadConfigWithPreset(
  presetName: string,
  configPath?: string,
): Config {
  const loader = new ConfigLoader(configPath);
  return loader.loadWithPreset(presetName);
}
