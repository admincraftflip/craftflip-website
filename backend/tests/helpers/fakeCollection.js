import { setImmediate as nextTick } from 'node:timers/promises'

// A tiny in-memory stand-in for the Mongoose model calls used by utils/publishing.js. Each call
// is atomic, like a single MongoDB operation, but yields to the event loop first, so concurrent
// requests interleave between operations exactly where real ones could. Use string IDs.

function getPath(document, path) {
  return path.split('.').reduce((value, key) => (value == null ? undefined : value[key]), document)
}

function setPath(document, path, value) {
  const keys = path.split('.')
  const last = keys.pop()
  const target = keys.reduce((value, key) => (value[key] ??= {}), document)
  target[last] = value
}

function sameValue(actual, expected) {
  if (expected === null) return actual === null || actual === undefined
  if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime()
  return String(actual) === String(expected)
}

function isOperatorObject(condition) {
  return condition !== null && typeof condition === 'object' && !(condition instanceof Date)
}

function matchesCondition(actual, condition) {
  if (!isOperatorObject(condition)) return sameValue(actual, condition)
  return Object.entries(condition).every(([operator, operand]) => {
    if (operator === '$in') return operand.some((value) => sameValue(actual, value))
    if (operator === '$ne') return !sameValue(actual, operand)
    if (operator === '$lte') return actual != null && actual <= operand
    if (operator === '$lt') return actual != null && actual < operand
    throw new Error(`Unsupported operator ${operator}`)
  })
}

function matches(document, filter) {
  return Object.entries(filter).every(([key, condition]) => {
    if (key === '$or') return condition.some((branch) => matches(document, branch))
    return matchesCondition(getPath(document, key), condition)
  })
}

function applyUpdate(document, update, inserting) {
  for (const [path, value] of Object.entries(update.$set ?? {})) setPath(document, path, value)
  if (inserting) for (const [path, value] of Object.entries(update.$setOnInsert ?? {})) setPath(document, path, value)
}

function equalityFields(filter) {
  return Object.fromEntries(Object.entries(filter).filter(([key, value]) => !key.startsWith('$') && !isOperatorObject(value)))
}

class FakeQuery {
  constructor(run) {
    this.run = run
  }

  select() {
    return this
  }

  then(resolve, reject) {
    return this.run().then(resolve, reject)
  }
}

export function createFakeCollection({ uniqueFields = [] } = {}) {
  const documents = []
  const copy = (document) => (document ? structuredClone(document) : null)

  function checkUnique(candidate, replacing) {
    for (const field of uniqueFields) {
      const taken = documents.some((document) => document !== replacing && sameValue(getPath(document, field), getPath(candidate, field)))
      if (taken) throw Object.assign(new Error(`E11000 duplicate key: ${field}`), { code: 11000 })
    }
  }

  return {
    documents,
    async create(document) {
      await nextTick()
      checkUnique(document, null)
      documents.push(document)
      return copy(document)
    },
    insert(document) {
      checkUnique(document, null)
      documents.push(document)
      return document
    },
    findOne(filter) {
      return new FakeQuery(async () => {
        await nextTick()
        return copy(documents.find((document) => matches(document, filter)))
      })
    },
    async exists(filter) {
      await nextTick()
      return documents.some((document) => matches(document, filter)) ? { _id: 'exists' } : null
    },
    async countDocuments(filter) {
      await nextTick()
      return documents.filter((document) => matches(document, filter)).length
    },
    async findOneAndUpdate(filter, update, options = {}) {
      await nextTick()
      const document = documents.find((candidate) => matches(candidate, filter))
      if (!document && !options.upsert) return null
      const before = copy(document)
      const target = document ? structuredClone(document) : equalityFields(filter)
      applyUpdate(target, update, !document)
      checkUnique(target, document)
      if (document) Object.assign(document, target)
      else documents.push(target)
      // Like Mongoose, the document before the update unless returnDocument is 'after'.
      return options.returnDocument === 'after' ? copy(document ?? target) : before
    },
    async updateOne(filter, update) {
      await nextTick()
      const document = documents.find((candidate) => matches(candidate, filter))
      if (document) applyUpdate(document, update, false)
      return { matchedCount: document ? 1 : 0 }
    },
    async deleteOne(filter) {
      await nextTick()
      const index = documents.findIndex((candidate) => matches(candidate, filter))
      if (index >= 0) documents.splice(index, 1)
      return { deletedCount: index >= 0 ? 1 : 0 }
    },
  }
}
