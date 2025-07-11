/**
 * Configuration options for SQLToJSONConverter
 */
export interface ConverterOptions {
  batchSize?: number;
  showMemory?: boolean;
  limit?: number | null;
  skipUnparsable?: boolean;
  outputMode?: 'combined' | 'separate';
  outputDir?: string;
}

/**
 * Column definition from CREATE TABLE statement
 */
export interface ColumnDefinition {
  name: string;
  type: string;
}

/**
 * Table information including columns and data
 */
export interface TableInfo {
  tableName: string;
  columns: ColumnDefinition[];
  data: Record<string, any>[];
}

/**
 * Tables collection indexed by table name
 */
export interface TablesCollection {
  [tableName: string]: TableInfo;
}

/**
 * Parsed INSERT INTO statement result
 */
export interface InsertInfo {
  tableName: string;
  records: any[][];
}

/**
 * Metadata for conversion results
 */
export interface ConversionMetadata {
  generatedAt: string;
  totalTables: number;
  totalRecords: number;
  outputDirectory?: string;
  sourceFile?: string;
  processingTime?: number;
}

/**
 * Combined JSON conversion result
 */
export interface ConversionResult {
  metadata: ConversionMetadata;
  tables: TablesCollection;
}

/**
 * Separate files conversion result
 */
export interface SeparateFilesResult {
  metadata: ConversionMetadata;
  tables: string[];
}

/**
 * Table data for individual JSON file
 */
export interface TableData {
  tableName: string;
  columns: ColumnDefinition[];
  recordCount: number;
  generatedAt: string;
  data: Record<string, any>[];
}

/**
 * Summary file content for separate files mode
 */
export interface SummaryData {
  generatedAt: string;
  totalTables: number;
  totalRecords: number;
  tables: Array<{
    name: string;
    recordCount: number;
    fileName: string;
  }>;
}

/**
 * CLI argument interface
 */
export interface CLIArgs {
  inputFile: string;
  outputFile?: string;
  outputDir: string;
  showMemory: boolean;
  skipUnparsable: boolean;
  isCombined: boolean;
  batchSize: number;
  limit: number | null;
} 