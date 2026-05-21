import { processPending } from '../src/worker/imageProcessor.js'

const start = Date.now()
const { processed, failed } = await processPending()
const ms = Date.now() - start
console.log(`processed: ${processed}, failed: ${failed}, took ${ms}ms`)
process.exit(failed > 0 ? 1 : 0)
