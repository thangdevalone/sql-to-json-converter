import { SQLToJSONConverter, sqlToJson, sqlToJsonFiles, processLargeSQL } from './cli';
import { ConverterOptions, ConversionResult, SeparateFilesResult } from './types';

/**
 * Convert SQL content to JSON format (combined output)
 * @param content - SQL content as string
 * @param options - Conversion options
 * @returns JSON result with metadata and tables
 */
export function convertSQLToJSON(content: string, options: ConverterOptions = {}): ConversionResult {
  return sqlToJson(content, options);
}

/**
 * Convert SQL content to separate JSON files
 * @param content - SQL content as string  
 * @param outputDir - Output directory (default: 'json-output')
 * @param options - Conversion options
 * @returns Conversion result with metadata
 */
export function convertSQLToJSONFiles(content: string, outputDir = 'json-output', options: ConverterOptions = {}): SeparateFilesResult {
  return sqlToJsonFiles(content, outputDir, options);
}

/**
 * Process large SQL files with streaming
 * @param inputFile - Path to input SQL file
 * @param outputFile - Path to output JSON file (optional)
 * @param options - Processing options
 * @returns Processing result
 */
export async function processLargeSQLFile(inputFile: string, outputFile?: string, options: ConverterOptions = {}): Promise<void> {
  return processLargeSQL(inputFile, outputFile, options);
}

/**
 * Create a new SQL to JSON converter instance
 * @param options - Converter options
 * @returns Converter instance
 */
export function createConverter(options: ConverterOptions = {}): SQLToJSONConverter {
  return new SQLToJSONConverter(options);
}

// Export main converter class
export { SQLToJSONConverter };

// Export types
export * from './types';

// Export low-level functions (backward compatibility)
export { sqlToJson, sqlToJsonFiles, processLargeSQL };

// Default export
export default {
  SQLToJSONConverter,
  convertSQLToJSON,
  convertSQLToJSONFiles,
  processLargeSQLFile,
  createConverter,
  sqlToJson,
  sqlToJsonFiles,
  processLargeSQL
}; 