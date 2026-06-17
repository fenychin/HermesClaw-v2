import { describe, it, expect } from 'vitest'
import * as hermesKernel from '../index'

describe('hermes-kernel smoke', () => {
  it('can be imported and exports expected symbols', () => {
    expect(hermesKernel).toBeDefined()
    expect(typeof hermesKernel.createTaskEnvelope).toBe('function')
    expect(typeof hermesKernel.orchestrate).toBe('function')
    expect(typeof hermesKernel.memoryRead).toBe('function')
    expect(typeof hermesKernel.memoryWrite).toBe('function')
    expect(typeof hermesKernel.runHarnessEvaluation).toBe('function')
    expect(typeof hermesKernel.checkPolicy).toBe('function')
  })
})
