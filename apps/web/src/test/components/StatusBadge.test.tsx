/**
 * StatusBadge 组件渲染测试
 * —— 确保各状态标签显示正确中文文本
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusBadge } from '@/components/common/status-badge'

describe('StatusBadge', () => {
  it('running 状态应该显示"运行中"', () => {
    render(<StatusBadge status="running" />)
    expect(screen.getByText('运行中')).toBeInTheDocument()
  })

  it('error 状态应该显示"异常"', () => {
    render(<StatusBadge status="error" />)
    expect(screen.getByText('异常')).toBeInTheDocument()
  })

  it('pending 状态应该显示"待审批"', () => {
    render(<StatusBadge status="pending" />)
    expect(screen.getByText('待审批')).toBeInTheDocument()
  })

  it('idle 状态应该显示"空闲"', () => {
    render(<StatusBadge status="idle" />)
    expect(screen.getByText('空闲')).toBeInTheDocument()
  })

  it('paused 状态应该显示"已暂停"', () => {
    render(<StatusBadge status="paused" />)
    expect(screen.getByText('已暂停')).toBeInTheDocument()
  })

  it('connected 状态应该显示"已连接"', () => {
    render(<StatusBadge status="connected" />)
    expect(screen.getByText('已连接')).toBeInTheDocument()
  })

  it('approved 状态应该显示"已通过"', () => {
    render(<StatusBadge status="approved" />)
    expect(screen.getByText('已通过')).toBeInTheDocument()
  })

  it('rejected 状态应该显示"已驳回"', () => {
    render(<StatusBadge status="rejected" />)
    expect(screen.getByText('已驳回')).toBeInTheDocument()
  })

  it('upgrade 状态应该显示"可升级"', () => {
    render(<StatusBadge status="upgrade" />)
    expect(screen.getByText('可升级')).toBeInTheDocument()
  })
})
