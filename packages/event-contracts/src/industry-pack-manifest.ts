/* eslint-disable @typescript-eslint/no-explicit-any */
export const MANIFEST_SCHEMA_VERSION = '1.0'

export type PackCapabilityType = 'skill' | 'workflow' | 'connector'

export interface PackCapabilityEntry {
  id: string                    // 在 Pack 内的唯一标识
  type: PackCapabilityType
  displayName: string
  description: string
  version: string               // semver
  inputSchema: Record<string, unknown>
  outputSchema: Record<string, unknown>
  tags: string[]
  changelog: string
  // 对于 skill：指向实现文件或外部端点
  handler?: string
  // 对于 connector：SMTP/REST 等配置模板
  configTemplate?: Record<string, unknown>
  // 对于 workflow：nodes/edges 定义
  workflowDefinition?: Record<string, unknown>
}

export interface PackDependency {
  packId: string
  version: string               // semver range，如 '>=1.0.0 <2.0.0'
  required: boolean             // false = optional
}

export interface IndustryPackManifest {
  manifestVersion: string       // MANIFEST_SCHEMA_VERSION
  packId: string
  packName: string
  packVersion: string           // semver
  description: string
  author: string
  license: string
  tags: string[]
  targetIndustry: string        // 'general' | 'finance' | 'healthcare' | 'retail' | etc.
  capabilities: PackCapabilityEntry[]
  dependencies: PackDependency[]
  minHarnessCoreVersion: string // 要求的最低核心版本
  changelog: string
}

// Manifest 校验结果
export interface ManifestValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

function isValidSemver(v: string): boolean {
  // 匹配常见的简单 X.Y.Z 格式或带有后缀的 semver
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/.test(v)
}

/**
 * 校验 Manifest 格式合法性
 */
export function validateManifest(manifest: unknown): ManifestValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!manifest || typeof manifest !== 'object') {
    errors.push('Manifest must be a non-null object')
    return { valid: false, errors, warnings }
  }

  const m = manifest as Record<string, any>

  // 1. 检查 manifestVersion === MANIFEST_SCHEMA_VERSION
  if (m.manifestVersion !== MANIFEST_SCHEMA_VERSION) {
    errors.push(`manifestVersion must be '${MANIFEST_SCHEMA_VERSION}'`)
  }

  // 2. 检查 packId / packVersion / capabilities 存在且非空
  if (!m.packId || typeof m.packId !== 'string' || m.packId.trim() === '') {
    errors.push('packId is required and must be a non-empty string')
  }

  if (!m.packVersion || typeof m.packVersion !== 'string' || !isValidSemver(m.packVersion)) {
    errors.push('packVersion is required and must be a valid semver string')
  }

  if (!Array.isArray(m.capabilities) || m.capabilities.length === 0) {
    errors.push('capabilities must be a non-empty array')
  } else {
    // 3. 检查所有 capability.version 为合法 semver，且存在 id
    const capIds = new Set<string>()
    m.capabilities.forEach((cap: any, idx: number) => {
      if (!cap || typeof cap !== 'object') {
        errors.push(`capabilities[${idx}] must be an object`)
        return
      }

      if (!cap.id || typeof cap.id !== 'string' || cap.id.trim() === '') {
        errors.push(`capabilities[${idx}].id is required`)
      } else {
        // 4. 检查是否存在重复的 capability.id
        if (capIds.has(cap.id)) {
          errors.push(`Duplicate capability id: ${cap.id}`)
        } else {
          capIds.add(cap.id)
        }
      }

      if (!cap.version || typeof cap.version !== 'string' || !isValidSemver(cap.version)) {
        errors.push(`capabilities[${idx}] (${cap.id || 'unknown'}): version is required and must be a valid semver string`)
      }

      if (!cap.type || !['skill', 'workflow', 'connector'].includes(cap.type)) {
        errors.push(`capabilities[${idx}] (${cap.id || 'unknown'}): type must be 'skill', 'workflow' or 'connector'`)
      }
    })
  }

  // 5. 检查 dependencies 中的 packId 不循环引用 packId 自身
  if (m.dependencies) {
    if (!Array.isArray(m.dependencies)) {
      errors.push('dependencies must be an array')
    } else {
      m.dependencies.forEach((dep: any, idx: number) => {
        if (!dep || typeof dep !== 'object') {
          errors.push(`dependencies[${idx}] must be an object`)
          return
        }

        if (!dep.packId || typeof dep.packId !== 'string' || dep.packId.trim() === '') {
          errors.push(`dependencies[${idx}].packId is required`)
        } else if (dep.packId === m.packId) {
          errors.push(`Dependency cannot self-reference packId: ${dep.packId}`)
        }

        if (dep.required === undefined) {
          warnings.push(`dependencies[${idx}] (${dep.packId || 'unknown'}): 'required' field is missing, defaulting to true`)
        }
      })
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}
