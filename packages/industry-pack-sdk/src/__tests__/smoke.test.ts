import { describe, it, expect } from 'vitest'
import * as industryPackSdk from '../index'
import { z } from 'zod'

describe('industry-pack-sdk smoke', () => {
  it('can be imported and exports expected loader symbols', () => {
    expect(industryPackSdk).toBeDefined()
    expect(typeof industryPackSdk.loadIndustryManifest).toBe('function')
    expect(typeof industryPackSdk.getCachedManifest).toBe('function')
    expect(typeof industryPackSdk.listIndustryWorkflows).toBe('function')
    expect(typeof industryPackSdk.loadIndustryPrompt).toBe('function')
    expect(typeof industryPackSdk.loadIndustryAgents).toBe('function')
    expect(typeof industryPackSdk.clearCache).toBe('function')
  })

  it('exports configureIndustryPackLoader for DI', () => {
    expect(typeof industryPackSdk.configureIndustryPackLoader).toBe('function')
    // configureIndustryPackLoader 不抛异常（无副作用调用）
    expect(() => industryPackSdk.configureIndustryPackLoader({})).not.toThrow()
  })

  it('exports IndustryPackManifestSchema for validation', () => {
    expect(industryPackSdk.IndustryPackManifestSchema).toBeDefined()
    expect(industryPackSdk.IndustryPackManifestSchema).toBeInstanceOf(z.ZodObject)
  })

  it('exports IndustryPackLoader class', () => {
    expect(typeof industryPackSdk.IndustryPackLoader).toBe('function')
    const loader = new industryPackSdk.IndustryPackLoader()
    expect(loader).toBeDefined()
    expect(typeof loader.load).toBe('function')
  })
})
