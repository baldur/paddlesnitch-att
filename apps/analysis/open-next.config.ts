import type { OpenNextConfig } from '@opennextjs/aws/types/open-next'

const config: OpenNextConfig = {
  default: {
    override: {
      // We don't use ISR/revalidation — disable the SQS/DynamoDB dependencies
      incrementalCache: 'dummy',
      tagCache: 'dummy',
      queue: 'dummy',
    },
    install: {
      // pnpm symlinks prevent OpenNext from copying transitive deps; force install them.
      // @aws-sdk/client-s3 brings in all @smithy/* deps automatically.
      // client-bedrock-runtime is the analysis app's LLM backend (llm.ts).
      packages: ['@aws-sdk/client-s3@3.1048.0', '@aws-sdk/client-bedrock-runtime@3.1086.0', '@next/env', '@swc/helpers', 'styled-jsx', 'postcss', 'caniuse-lite', 'baseline-browser-mapping'],
    },
  },
}

export default config
