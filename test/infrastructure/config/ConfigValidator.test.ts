import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateConfig, ConfigValidator, formatValidationErrors } from '../../../src/infrastructure/config/ConfigValidator';
import type { Config } from '../../../src/config';

const createMockConfig = (overrides: Partial<Config> = {}): unknown => ({
  servers: {
    test: {
      command: ['npx', 'test'],
      timeout: 60000,
      enabled: true,
      ...overrides,
    },
  },
  managementPort: 8080,
  gatewayPort: 8090,
  logLevel: 'info',
  compression: true,
  ...overrides,
});

describe('ConfigValidator', () => {
  describe('validateConfig', () => {
    it('should validate a correct config', () => {
      const config = createMockConfig();
      const result = validateConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing servers', () => {
      const config = {
        servers: {},
        managementPort: 8080,
        gatewayPort: 8090,
      };
      const result = validateConfig(config);

      expect(result.warnings).toContainEqual(
        expect.objectContaining({ path: 'servers', message: 'No servers configured' })
      );
    });

    it('should detect invalid port range', () => {
      const config = createMockConfig({
        servers: {
          test: {
            command: ['npx', 'test'],
            port: 99999,
          },
        },
      });
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'servers.test.port',
          message: expect.stringContaining('Invalid port'),
        })
      );
    });

    it('should detect invalid port range', () => {
      const config = createMockConfig({
        servers: {
          test: {
            command: ['npx', 'test'],
            port: 99999,
          },
        },
      });
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'servers.test.port',
          message: expect.stringContaining('Invalid port'),
        })
      );
    });

    it('should warn on low health check interval', () => {
      const config = createMockConfig({
        servers: {
          test: {
            command: ['npx', 'test'],
            healthCheck: {
              interval: 500,
              timeout: 5000,
              unhealthyThreshold: 3,
            },
          },
        },
      });
      const result = validateConfig(config);

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          path: 'servers.test.healthCheck.interval',
          message: expect.stringContaining('interval < 1000ms'),
        })
      );
    });

    it('should detect invalid unhealthyThreshold', () => {
      const config = createMockConfig({
        servers: {
          test: {
            command: ['npx', 'test'],
            healthCheck: {
              interval: 30000,
              timeout: 5000,
              unhealthyThreshold: 0,
            },
          },
        },
      });
      const result = validateConfig(config);

      expect(result.errors).toContainEqual(
        expect.objectContaining({
          path: 'servers.test.healthCheck.unhealthyThreshold',
          message: expect.stringContaining('unhealthyThreshold must be at least 1'),
        })
      );
    });

    it('should warn on missing command', () => {
      const config = {
        servers: {
          test: {
            timeout: 60000,
          },
        },
      };
      const result = validateConfig(config);

      expect(result.warnings).toContainEqual(
        expect.objectContaining({
          path: 'servers.test.command',
          message: expect.stringContaining('No command specified'),
        })
      );
    });

    it('should detect invalid top-level config', () => {
      const config = {
        servers: 'not an object',
        managementPort: 'invalid',
      };
      const result = validateConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('ConfigValidator class', () => {
    let validator: ConfigValidator;

    beforeEach(() => {
      validator = new ConfigValidator({
        validateBeforeApply: true,
        rollbackOnError: true,
      });
    });

    it('should apply config when validation passes', async () => {
      const config = createMockConfig();
      const applyFn = vi.fn().mockResolvedValue(undefined);

      const result = await validator.validateAndApply(config, applyFn);

      expect(result.success).toBe(true);
      expect(applyFn).toHaveBeenCalledWith(config);
    });

    it('should reject invalid config without rollback', async () => {
      const config = { invalid: 'config' };
      const applyFn = vi.fn().mockResolvedValue(undefined);

      const result = await validator.validateAndApply(config, applyFn);

      expect(result.success).toBe(false);
      expect(applyFn).not.toHaveBeenCalled();
    });

    it('should reject invalid config with rollback', async () => {
      const validConfig = createMockConfig();
      const invalidConfig = { invalid: 'config' };
      const applyFn = vi.fn().mockResolvedValue(undefined);

      validator.setLastValidConfig(validConfig as Config);

      const result = await validator.validateAndApply(invalidConfig, applyFn);

      expect(result.success).toBe(false);
      expect(result.usedFallback).toBe(true);
      expect(applyFn).toHaveBeenCalledWith(validConfig);
    });

    it('should skip validation when validateBeforeApply is false', async () => {
      const validatorNoValidate = new ConfigValidator({
        validateBeforeApply: false,
        rollbackOnError: true,
      });

      const config = { invalid: 'config' };
      const applyFn = vi.fn().mockResolvedValue(undefined);

      const result = await validatorNoValidate.validateAndApply(config, applyFn);

      expect(result.success).toBe(true);
      expect(applyFn).toHaveBeenCalled();
    });

    it('should store last valid config', () => {
      const config = createMockConfig() as Config;
      validator.setLastValidConfig(config);

      expect(validator.getLastValidConfig()).toBe(config);
    });

    it('should update options', () => {
      validator.updateOptions({ validateBeforeApply: false });

      expect(validator.getOptions().validateBeforeApply).toBe(false);
    });
  });

  describe('formatValidationErrors', () => {
    it('should format errors and warnings', () => {
      const result = {
        valid: false,
        errors: [
          { path: 'port', message: 'Invalid port' },
        ],
        warnings: [
          { path: 'interval', message: 'Too low' },
        ],
      };

      const formatted = formatValidationErrors(result);

      expect(formatted).toContain('Validation Errors');
      expect(formatted).toContain('[port] Invalid port');
      expect(formatted).toContain('Warnings');
      expect(formatted).toContain('[interval] Too low');
    });

    it('should return empty string for empty result', () => {
      const result = {
        valid: true,
        errors: [],
        warnings: [],
      };

      const formatted = formatValidationErrors(result);

      expect(formatted).toBe('');
    });
  });
});
