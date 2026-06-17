import tsParser from '@typescript-eslint/parser'

export default [
  // 共享基础解析选项：让 ESLint 认识 TypeScript
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    }
  },
  // ===== Hermes Kernel 包的边界规则 =====
  {
    files: ['packages/hermes-kernel/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['react', 'react-dom', 'next'],
            message: '❌ 三域原则违规：hermes-kernel 是纯服务端控制域，禁止导入前端框架'
          },
          {
            group: ['@hermesclaw/openclaw-adapter/internal/*'],
            message: '❌ 三域原则违规：禁止直接访问 OpenClaw 内部，使用 event-contracts 契约通信'
          },
          {
            group: ['@/contracts*', '*/src/contracts*'],
            message: '❌ 契约规范违规：packages 下的代码严禁引用 apps/web 本地 contracts，请统一引用 @hermesclaw/event-contracts'
          }
        ]
      }]
    }
  },
  // ===== OpenClaw Adapter 包的边界规则 =====
  {
    files: ['packages/openclaw-adapter/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['react', 'react-dom', 'next'],
            message: '❌ 三域原则违规：openclaw-adapter 是纯执行域，禁止导入前端框架'
          },
          {
            group: ['@hermesclaw/hermes-kernel/internal/*'],
            message: '❌ 执行域禁止反向调用控制域内部实现'
          },
          {
            group: ['@/contracts*', '*/src/contracts*'],
            message: '❌ 契约规范违规：packages 下的代码严禁引用 apps/web 本地 contracts，请统一引用 @hermesclaw/event-contracts'
          }
        ]
      }]
    }
  },
  // ===== Industry Pack SDK 的边界规则 =====
  {
    files: ['packages/industry-pack-sdk/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@hermesclaw/hermes-kernel', '@hermesclaw/openclaw-adapter'],
            message: '❌ 三域原则违规：Industry Pack 只能依赖 event-contracts，禁止依赖两个核心域'
          },
          {
            group: ['@/contracts*', '*/src/contracts*'],
            message: '❌ 契约规范违规：packages 下的代码严禁引用 apps/web 本地 contracts，请统一引用 @hermesclaw/event-contracts'
          },
          {
            group: ['@/lib/*', '@/app/*', '@/components/*', '@/services/*', '@/config/*', '@/hooks/*', '@/utils/*', '@/types/*'],
            message: '❌ 三域原则违规：Industry Pack SDK 禁止通过 @/ 别名引用主应用任何模块。如需审计/日志等能力，请通过 configureIndustryPackLoader() 的 onAuditLog 回调注入。'
          },
          {
            group: ['apps/web/*', '*/apps/web/*'],
            message: '❌ 三域原则违规：Industry Pack SDK 禁止引用 apps/web 任何文件。'
          }
        ]
      }]
    }
  },
  // ===== 前端 apps/web 的调用规则 =====
  {
    files: ['apps/web/src/**/*.ts', 'apps/web/src/**/*.tsx'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@hermesclaw/hermes-kernel/*/internal'],
            message: '❌ 前端禁止直接访问 Hermes Kernel 内部实现，通过 API Routes 调用'
          },
          {
            group: ['@hermesclaw/openclaw-adapter/*/internal'],
            message: '❌ 前端禁止直接访问 OpenClaw Adapter 内部实现，通过 API Routes 调用'
          }
        ]
      }]
    }
  },
  // ===== event-contracts 包的边界规则 =====
  {
    files: ['packages/event-contracts/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@/contracts*', '*/src/contracts*'],
            message: '❌ 契约规范违规：packages 下的代码严禁引用 apps/web 本地 contracts，请统一引用 @hermesclaw/event-contracts'
          }
        ]
      }]
    }
  },
  // ===== API Route 薄门卫规则（FIX-FINAL-02 / ROUTE_CONVENTION.md） =====
  // 每个 route.ts 只做：1) 鉴权 2) zod 解析 3) 调用 service 4) 返回响应
  // 业务逻辑必须下沉至 packages/hermes-kernel/ 或 apps/web/src/lib/server/
  {
    files: ['apps/web/src/app/api/**/route.ts'],
    rules: {
      'max-lines': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
      'no-restricted-syntax': [
        'error',
        {
          // 禁止在 route.ts 中直接调用 prisma.xxx.findMany / create / update / delete / count / groupBy / upsert / findFirst / findUnique
          selector: "CallExpression[callee.type='MemberExpression'][callee.object.type='MemberExpression'][callee.object.object.name='prisma'][callee.property.name=/^(findMany|create|update|delete|deleteMany|updateMany|count|groupBy|upsert|findFirst|findUnique|aggregate)$/]",
          message: '❌ API Route 禁止直接调用 prisma.xxx.<op>，请将逻辑迁移至 packages/hermes-kernel 或 apps/web/src/lib/server/* 服务中'
        },
        {
          // 禁止 LLM prompt 拼装：模板字符串中含有 system/user/assistant 等角色字面量
          selector: "TemplateLiteral > TemplateElement[value.raw=/system|user|assistant|你是一个|请直接输出/]",
          message: '❌ API Route 禁止拼装 LLM prompt，请迁移至 hermes-kernel handler / lib/server service'
        },
        {
          // 禁止 fetch() 外部调用（应在 adapter / connector 层）
          selector: "CallExpression[callee.name='fetch'][arguments.0.type='Literal'][arguments.0.value=/^https?:/]",
          message: '❌ API Route 禁止 fetch() 外部 URL，请迁移至 adapter / connector 层'
        }
      ]
    }
  }
]
