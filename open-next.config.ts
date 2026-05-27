import type { OpenNextConfig } from '@opennextjs/aws/types/open-next'

const config: OpenNextConfig = {
  default: {
    override: {
      // We don't use ISR/revalidation — disable the SQS/DynamoDB dependencies
      incrementalCache: 'dummy',
      tagCache: 'dummy',
      queue: 'dummy',
    },
  },
}

export default config
