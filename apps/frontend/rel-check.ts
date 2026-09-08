import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  normalizeRelation,
  type TablesRelationalConfig,
} from 'drizzle-orm/relations'
import * as schema from './src/db/schema'
const cfg = extractTablesRelationalConfig(schema, createTableRelationsHelpers)
for (const [t, tc] of Object.entries(cfg.tables as TablesRelationalConfig)) {
  for (const [name, rel] of Object.entries((tc as any).relations)) {
    try {
      normalizeRelation(cfg.tables as any, cfg.tableNamesMap, rel as any)
    } catch (e: any) {
      console.log('FAIL', t, name, '->', e.message)
    }
  }
}
console.log('done')
