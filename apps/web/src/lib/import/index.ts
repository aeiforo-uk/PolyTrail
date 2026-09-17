/**
 * Bulk import.
 *
 * Deliberately excludes `./run`, which is server-only: a client component that
 * imports the mapping helpers should not drag the database client in with them.
 * Import `@/lib/import/run` directly where the import is actually executed.
 */
export { parseCsv, parseCsvMatrix, sniffDelimiter } from './csv';
export type { CsvRow, ParsedCsv } from './csv';
export { inferMapping, toMapping } from './infer';
export type { InferredColumn, Mapping, MappingConfidence } from './infer';
export { deepMerge, getAtPath, prune, setAtPath } from './paths';
export { IMPORT_TARGETS, TEMPLATE_PATHS, isImportable, targetFor, targetsBySection } from './targets';
export type { ImportTarget } from './targets';
export { coerceCell } from './coerce';
export { matchVocabulary, VOCABULARIES } from './vocabulary';
export { ROW_KEY, matchKeyOf, reverseMapping, validateRow, validateRows } from './validate';
export type { MatchKey, SourceRow, ValidatedRow, ValidationSummary } from './validate';
export {
  collectFailures,
  failuresToCsv,
  formatForCsv,
  passportsToCsv,
  templateCsv,
} from './export';
export type { FailureRow } from './export';
