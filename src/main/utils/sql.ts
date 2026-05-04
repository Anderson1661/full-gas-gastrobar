function formatDateToSql(value: Date): string {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  const hours = String(value.getHours()).padStart(2, '0')
  const minutes = String(value.getMinutes()).padStart(2, '0')
  const seconds = String(value.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

export function toSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (value instanceof Date) return `'${escapeSqlString(formatDateToSql(value))}'`
  if (Buffer.isBuffer(value)) return `X'${value.toString('hex')}'`
  if (typeof value === 'object') return `'${escapeSqlString(JSON.stringify(value))}'`
  return `'${escapeSqlString(String(value))}'`
}

export function escapeSqlIdentifier(identifier: string): string {
  return `\`${String(identifier).replace(/`/g, '``')}\``
}

function escapeSqlString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\u0000/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\u0008/g, '\\b')
    .replace(/\t/g, '\\t')
    .replace(/\u001a/g, '\\Z')
    .replace(/'/g, "\\'")
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let inBacktick = false
  let inLineComment = false
  let inBlockComment = false

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index]
    const next = sql[index + 1] ?? ''
    const prev = sql[index - 1] ?? ''

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      const startsMysqlLineComment = char === '-' && next === '-' && /\s/.test(sql[index + 2] ?? ' ')
      if (startsMysqlLineComment || char === '#') {
        inLineComment = true
        if (startsMysqlLineComment) index += 1
        continue
      }

      if (char === '/' && next === '*') {
        inBlockComment = true
        index += 1
        continue
      }
    }

    if (char === "'" && !inDoubleQuote && !inBacktick && prev !== '\\') {
      inSingleQuote = !inSingleQuote
      current += char
      continue
    }

    if (char === '"' && !inSingleQuote && !inBacktick && prev !== '\\') {
      inDoubleQuote = !inDoubleQuote
      current += char
      continue
    }

    if (char === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick
      current += char
      continue
    }

    if (char === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      const normalized = current.trim()
      if (normalized) statements.push(normalized)
      current = ''
      continue
    }

    current += char
  }

  const tail = current.trim()
  if (tail) statements.push(tail)
  return statements
}
