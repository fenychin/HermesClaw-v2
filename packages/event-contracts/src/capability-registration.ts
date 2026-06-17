import { z } from "zod"

/** CapabilityRegistration 独立契约版本。 */
export const CAPABILITY_REGISTRATION_VERSION = "1.0.0"

export const CapabilityTypeSchema = z.enum(['skill', 'connector', 'workflow', 'tool', 'channel', 'device'])
export type CapabilityType = z.infer<typeof CapabilityTypeSchema>

export const CapabilityStatusSchema = z.enum(['draft', 'active', 'deprecated', 'yanked', 'available', 'degraded', 'unavailable', 'unregistered'])
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>

export const HealthStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy', 'unknown'])
export type HealthStatus = z.infer<typeof HealthStatusSchema>

export const CapabilityRegistrationSchema = z.object({
  capabilityId: z.string(),
  runtimeId: z.string().optional(),
  type: CapabilityTypeSchema.optional(),
  capabilityType: CapabilityTypeSchema.optional(),
  version: z.string(),
  workspaceId: z.string(),
  name: z.string().optional(),
  supportedActionTypes: z.array(z.unknown()).optional(),
  automationLevelCeiling: z.unknown().optional(),
  riskLevelCeiling: z.unknown().optional(),
  registeredAt: z.coerce.date().optional(),
  lastHeartbeatAt: z.coerce.date().optional(),
  displayName: z.string().optional(),
  description: z.string().optional(),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
  outputSchema: z.record(z.string(), z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
  status: CapabilityStatusSchema.optional(),
  healthStatus: HealthStatusSchema.optional(),
  successCount: z.number().optional(),
  failureCount: z.number().optional(),
  avgLatencyMs: z.number().optional(),
  lastHealthCheckAt: z.coerce.date().optional(),
  changelog: z.string().optional(),
  publishedAt: z.coerce.date().optional(),
  publishedBy: z.string().optional(),
  deprecatedAt: z.coerce.date().optional(),
  deprecatedBy: z.string().optional(),
  deprecationReason: z.string().optional(),
})

export type CapabilityRegistration = z.infer<typeof CapabilityRegistrationSchema>

export const CapabilityDescriptorSchema = z.object({
  capabilityId: z.string(),
  capabilityType: CapabilityTypeSchema,
  version: z.string().optional(),
  workspaceId: z.string(),
})
export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>

export const ResolvedCapabilitySchema = z.object({
  registration: CapabilityRegistrationSchema,
  endpoint: z.string().optional(),
  skillHandler: z.string().optional(),
})
export type ResolvedCapability = z.infer<typeof ResolvedCapabilitySchema>

