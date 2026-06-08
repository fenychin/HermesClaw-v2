/**
 * 外贸（Foreign Trade）领域类型
 * —— 对应 PRD 10.1 外贸入口 / 10.3 动态大盘，覆盖询盘、情报、报价
 */

export type InquiryPriority = 'high' | 'mid' | 'low'
export type IntelligenceType = 'currency' | 'tariff' | 'competitor' | 'market' | 'logistics'
export type ImpactLevel = 'high' | 'mid' | 'low'

export interface Inquiry {
  id: string
  fromCountry: string
  countryFlag: string
  companyName: string
  summary: string
  priority: InquiryPriority
  channel: string
  receivedAt: string
  replied: boolean
}

export interface MarketIntelligence {
  id: string
  type: IntelligenceType
  title: string
  summary: string
  source: string
  credibility: number
  impactLevel: ImpactLevel
  suggestedAction: string
  publishedAt: string
}

export interface Quotation {
  id: string
  projectId: string
  version: number
  totalAmount: string
  currency: string
  status: 'draft' | 'sent' | 'accepted' | 'rejected'
  createdAt: string
}
