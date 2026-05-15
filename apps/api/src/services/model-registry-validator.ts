/**
 * Model Registry Validator - Startup Consistency Check
 * Validates that ALL model references in DEFAULT_CASCADE, DecisionEngine,
 * MODEL_ROTATION_POOLS exist in MODEL_REGISTRY with proper name properties.
 * @version 1.0.0
 */

import { MODEL_REGISTRY, MODEL_ROTATION_POOLS } from '../services/ai-failover.js';
import { logger } from '../config/logger.js';

interface ValidationError {
  source: string;
  modelId: string;
  issue: string;
}

export function validateModelRegistry(): { valid: boolean; errors: ValidationError[]; warnings: string[] } {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];

  // 1. Check MODEL_REGISTRY entries have required fields
  for (const [key, model] of Object.entries(MODEL_REGISTRY)) {
    if (!model.name) {
      errors.push({ source: 'MODEL_REGISTRY', modelId: key, issue: 'Missing name property' });
    }
    if (!model.provider) {
      errors.push({ source: 'MODEL_REGISTRY', modelId: key, issue: 'Missing provider property' });
    }
    if (!model.tier) {
      warnings.push('MODEL_REGISTRY[' + key + ']: Missing tier property');
    }
    if (!model.costPer1kTokens || !model.costPer1kTokens.input || !model.costPer1kTokens.output) {
      warnings.push('MODEL_REGISTRY[' + key + ']: Missing or incomplete costPer1kTokens');
    }
  }

  // 2. Check DEFAULT_CASCADE models
  const cascadeModels = ['qwen-turbo', 'qwen-plus', 'qwen-coder-plus', 'qwen3-coder-plus', 'qwen3.6-plus', 'qwen-max'];
  for (const modelId of cascadeModels) {
    if (!MODEL_REGISTRY[modelId]) {
      errors.push({ source: 'DEFAULT_CASCADE', modelId, issue: 'Model key not found in MODEL_REGISTRY' });
    } else if (!MODEL_REGISTRY[modelId].name) {
      errors.push({ source: 'DEFAULT_CASCADE', modelId, issue: 'Model exists but missing name property' });
    }
  }

  // 3. Check MODEL_ROTATION_POOLS
  for (const [tier, models] of Object.entries(MODEL_ROTATION_POOLS)) {
    for (const modelId of models) {
      if (!MODEL_REGISTRY[modelId]) {
        errors.push({ source: 'MODEL_ROTATION_POOLS[' + tier + ']', modelId, issue: 'Model key not found in MODEL_REGISTRY' });
      }
    }
  }

  // 4. Check DecisionEngine role models
  const roleModels = ['qwen-turbo', 'qwen3.6-plus', 'qwen3-coder-480b', 'qwen3.6-flash', 'qwen3-32b', 'qwen-vl-max', 'qwen3-max', 'qwen3-coder-plus'];
  for (const modelId of roleModels) {
    if (!MODEL_REGISTRY[modelId]) {
      errors.push({ source: 'DecisionEngine.roles', modelId, issue: 'Model key not found in MODEL_REGISTRY' });
    }
  }

  if (errors.length > 0) {
    logger.error('MODEL REGISTRY VALIDATION FAILED');
    for (const error of errors) {
      logger.error('  [' + error.source + '] ' + error.modelId + ': ' + error.issue);
    }
  }

  if (warnings.length > 0) {
    logger.warn('Model Registry Warnings:');
    for (const w of warnings) { logger.warn('  ' + w); }
  }

  if (errors.length === 0) {
    logger.info('Model Registry Validation PASSED - all models consistent');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function validateModelRegistryOrExit(): void {
  const result = validateModelRegistry();
  if (!result.valid) {
    logger.error('FATAL: Model Registry validation failed. Service cannot start safely.');
    process.exit(1);
  }
}

