#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  ConverterOptions,
  ColumnDefinition,
  TableInfo,
  TablesCollection,
  InsertInfo,
  ConversionResult,
  SeparateFilesResult,
  TableData,
  SummaryData,
  CLIArgs
} from './types';

/**
 * SQL to JSON Converter class with full TypeScript support
 */
export class SQLToJSONConverter {
  private readonly batchSize: number;
  private readonly showMemory: boolean;
  private readonly limit: number | null;
  private readonly skipUnparsable: boolean;
  private readonly outputMode: 'combined' | 'separate';
  private readonly outputDir: string;
  private processedStatements: number = 0;
  private readonly tables: TablesCollection = {};
  private currentTable: string | null = null;
  private insideTransaction: boolean = false;

  constructor(options: ConverterOptions = {}) {
    this.batchSize = options.batchSize || 500;
    this.showMemory = options.showMemory || false;
    this.limit = options.limit || null;
    this.skipUnparsable = options.skipUnparsable || false;
    this.outputMode = options.outputMode || 'combined';
    this.outputDir = options.outputDir || 'json-output';
  }

  /**
   * Log current memory usage if enabled
   */
  private logMemoryUsage(): void {
    if (this.showMemory) {
      const used = process.memoryUsage();
      const rss = Math.round(used.rss / 1024 / 1024 * 100) / 100;
      const heap = Math.round(used.heapUsed / 1024 / 1024 * 100) / 100;
      console.log(`Memory: RSS ${rss} MB, Heap ${heap} MB`);
    }
  }

  /**
   * Parse CREATE TABLE statement
   */
  private parseCreateTable(sql: string): TableInfo | null {
    try {
      // Extract table name - support both with and without backticks
      const tableMatch = sql.match(/CREATE TABLE\s+`?([^`\s(]+)`?\s*\(/i);
      if (!tableMatch) return null;

      const tableName = tableMatch[1].replace(/^SERVMASK_PREFIX_/, '');
      
      // Extract columns from CREATE TABLE statement
      const columns: ColumnDefinition[] = [];
      
      // Find the content between the first ( and the last )
      const startParen = sql.indexOf('(');
      const endParen = sql.lastIndexOf(')');
      
      if (startParen === -1 || endParen === -1) return null;
      
      const columnsPart = sql.substring(startParen + 1, endParen);
      
      // Split by comma but handle commas within parentheses (e.g., DECIMAL(10,2))
      const columnDefs: string[] = [];
      let current = '';
      let parenDepth = 0;
      
      for (let i = 0; i < columnsPart.length; i++) {
        const char = columnsPart[i];
        
        if (char === '(') {
          parenDepth++;
          current += char;
        } else if (char === ')') {
          parenDepth--;
          current += char;
        } else if (char === ',' && parenDepth === 0) {
          // This is a column separator comma, not a comma within a type
          columnDefs.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      
      // Add the last column definition
      if (current.trim()) {
        columnDefs.push(current.trim());
      }
      
      for (const colDef of columnDefs) {
        const trimmed = colDef.trim();
        
        // Skip empty definitions, comments, PRIMARY KEY, KEY definitions, and ENGINE
        if (!trimmed || 
            trimmed.startsWith('--') || 
            trimmed.toUpperCase().startsWith('PRIMARY KEY') || 
            trimmed.toUpperCase().startsWith('KEY ') ||
            trimmed.toUpperCase().startsWith('UNIQUE KEY') ||
            trimmed.toUpperCase().startsWith('FOREIGN KEY') ||
            trimmed.toUpperCase().includes('ENGINE=')) {
          continue;
        }
        
        // Look for column definitions - support both with and without backticks
        // Match: `column_name` TYPE or column_name TYPE
        const columnMatch = trimmed.match(/^`?([^`\s]+)`?\s+(.+)$/);
        if (columnMatch) {
          const columnName = columnMatch[1];
          const columnType = columnMatch[2].trim();
          
          columns.push({
            name: columnName,
            type: columnType
          });
        }
      }

      return {
        tableName,
        columns,
        data: []
      };
    } catch (error) {
      if (!this.skipUnparsable) {
        console.error(`Error parsing CREATE TABLE: ${(error as Error).message}`);
      }
      return null;
    }
  }

  /**
   * Parse INSERT INTO statement
   */
  private parseInsertInto(sql: string): InsertInfo | null {
    try {
      // Extract table name - support both with and without backticks
      const tableMatch = sql.match(/INSERT INTO\s+`?([^`\s(]+)`?\s*(?:\([^)]+\))?\s*VALUES/i);
      if (!tableMatch) return null;

      const tableName = tableMatch[1].replace(/^SERVMASK_PREFIX_/, '');
      
      // Extract values - handle multiple value sets
      const valuesMatch = sql.match(/VALUES\s*(.*)/is);
      if (!valuesMatch) return null;

      const valuesString = valuesMatch[1];
      const records: any[][] = [];
      
      // Split by ),( to handle multiple records
      const valueGroups = valuesString.split(/\),\s*\(/);
      
      for (let i = 0; i < valueGroups.length; i++) {
        let valueGroup = valueGroups[i];
        
        // Clean up the value group
        valueGroup = valueGroup.replace(/^\(/, '').replace(/\);?\s*$/, '');
        
        // Parse individual values
        const values = this.parseValues(valueGroup);
        if (values) {
          records.push(values);
        }
      }

      return {
        tableName,
        records
      };
    } catch (error) {
      if (!this.skipUnparsable) {
        console.error(`Error parsing INSERT INTO: ${(error as Error).message}`);
      }
      return null;
    }
  }

  /**
   * Parse individual values from VALUES clause
   */
  private parseValues(valueString: string): any[] {
    const values: any[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let depth = 0;
    
    for (let i = 0; i < valueString.length; i++) {
      const char = valueString[i];
      
      if (!inString) {
        if (char === "'" || char === '"') {
          inString = true;
          stringChar = char;
          current += char;
        } else if (char === '(' || char === '{') {
          depth++;
          current += char;
        } else if (char === ')' || char === '}') {
          depth--;
          current += char;
        } else if (char === ',' && depth === 0) {
          values.push(this.cleanValue(current.trim()));
          current = '';
        } else {
          current += char;
        }
      } else {
        current += char;
        if (char === stringChar && valueString[i - 1] !== '\\') {
          inString = false;
        }
      }
    }
    
    if (current.trim()) {
      values.push(this.cleanValue(current.trim()));
    }
    
    return values;
  }

  /**
   * Clean and convert SQL values to proper JavaScript types
   */
  private cleanValue(value: string): any {
    value = value.trim();
    
    // Handle NULL
    if (value.toUpperCase() === 'NULL') {
      return null;
    }
    
    // Handle quoted strings
    if ((value.startsWith("'") && value.endsWith("'")) || 
        (value.startsWith('"') && value.endsWith('"'))) {
      return value.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"');
    }
    
    // Handle numbers
    if (/^-?\d+$/.test(value)) {
      return parseInt(value, 10);
    }
    
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }
    
    return value;
  }

  /**
   * Process a single SQL statement
   */
  private processStatement(sql: string): boolean {
    sql = sql.trim();
    if (!sql) return true;

    this.processedStatements++;
    
    if (this.limit && this.processedStatements > this.limit) {
      return false; // Stop processing
    }

    if (sql.startsWith('START TRANSACTION')) {
      this.insideTransaction = true;
      return true;
    }

    if (sql.startsWith('COMMIT')) {
      this.insideTransaction = false;
      return true;
    }

    if (sql.toUpperCase().startsWith('DROP TABLE')) {
      return true; // Skip DROP statements
    }

    if (sql.toUpperCase().startsWith('CREATE TABLE')) {
      const tableInfo = this.parseCreateTable(sql);
      if (tableInfo) {
        this.tables[tableInfo.tableName] = tableInfo;
        this.currentTable = tableInfo.tableName;
      }
      return true;
    }

    if (sql.toUpperCase().startsWith('INSERT INTO')) {
      const insertInfo = this.parseInsertInto(sql);
      if (insertInfo && this.tables[insertInfo.tableName]) {
        const table = this.tables[insertInfo.tableName];
        
        // Convert records to objects using column names
        for (const record of insertInfo.records) {
          const obj: Record<string, any> = {};
          table.columns.forEach((col, index) => {
            if (index < record.length) {
              obj[col.name] = record[index];
            }
          });
          table.data.push(obj);
        }
      }
      return true;
    }

    return true;
  }

  /**
   * Process large SQL files with streaming
   */
  public async processLargeSQL(inputFile: string, outputFile?: string): Promise<void> {
    console.log('🚀 Starting SQL to JSON conversion...');
    console.log(`📁 Input: ${inputFile}`);
    
    if (this.outputMode === 'separate') {
      console.log(`📁 Output directory: ${this.outputDir}/`);
      this.ensureOutputDirectory();
    } else {
      console.log(`📄 Output: ${outputFile || 'stdout'}`);
    }
    
    console.log(`⚙️  Batch size: ${this.batchSize}`);
    if (this.limit) console.log(`🔢 Limit: ${this.limit} statements`);
    
    const fileStream = fs.createReadStream(inputFile);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    let currentStatement = '';
    let lineCount = 0;
    const startTime = Date.now();

    for await (const line of rl) {
      lineCount++;
      
      if (lineCount % 1000 === 0) {
        console.log(`📊 Processed ${lineCount} lines, ${this.processedStatements} statements, ${Object.keys(this.tables).length} tables`);
        this.logMemoryUsage();
      }

      // Skip comments and empty lines
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('--')) {
        continue;
      }

      currentStatement += ' ' + line;

      // Check if statement is complete (ends with semicolon)
      if (trimmedLine.endsWith(';')) {
        const shouldContinue = this.processStatement(currentStatement.trim());
        currentStatement = '';
        
        if (!shouldContinue) {
          console.log('🛑 Reached processing limit');
          break;
        }
      }
    }

    // Process any remaining statement
    if (currentStatement.trim()) {
      this.processStatement(currentStatement.trim());
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log(`✅ Conversion completed in ${duration.toFixed(2)}s`);
    console.log(`📊 Final stats:`);
    console.log(`   - Lines processed: ${lineCount}`);
    console.log(`   - Statements processed: ${this.processedStatements}`);
    console.log(`   - Tables found: ${Object.keys(this.tables).length}`);
    
    Object.keys(this.tables).forEach(tableName => {
      console.log(`   - ${tableName}: ${this.tables[tableName].data.length} records`);
    });

    this.logMemoryUsage();

    // Generate output based on mode
    if (this.outputMode === 'separate') {
      this.writeSeparateJSONFiles();
    } else {
      this.writeCombinedJSON(outputFile);
    }
  }

  /**
   * Ensure output directory exists
   */
  private ensureOutputDirectory(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.log(`📁 Created output directory: ${this.outputDir}`);
    }
  }

  /**
   * Write separate JSON files for each table
   */
  private writeSeparateJSONFiles(): void {
    this.ensureOutputDirectory();
    
    let filesWritten = 0;
    for (const [tableName, table] of Object.entries(this.tables)) {
      const fileName = `${tableName}.json`;
      const filePath = path.join(this.outputDir, fileName);
      
      const tableData: TableData = {
        tableName,
        columns: table.columns,
        recordCount: table.data.length,
        generatedAt: new Date().toISOString(),
        data: table.data
      };
      
      fs.writeFileSync(filePath, JSON.stringify(tableData, null, 2), 'utf-8');
      console.log(`✅ Wrote ${filePath} (${table.data.length} records)`);
      filesWritten++;
    }
    
    // Create summary file
    const summary: SummaryData = {
      generatedAt: new Date().toISOString(),
      totalTables: Object.keys(this.tables).length,
      totalRecords: Object.values(this.tables).reduce((sum, table) => sum + table.data.length, 0),
      tables: Object.keys(this.tables).map(tableName => ({
        name: tableName,
        recordCount: this.tables[tableName].data.length,
        fileName: `${tableName}.json`
      }))
    };
    
    const summaryPath = path.join(this.outputDir, '_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
    console.log(`✅ Wrote summary file: ${summaryPath}`);
    
    console.log(`🎉 Successfully wrote ${filesWritten} table files + 1 summary file`);
  }

  /**
   * Write combined JSON file
   */
  private writeCombinedJSON(outputFile?: string): void {
    const result: ConversionResult = {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalTables: Object.keys(this.tables).length,
        totalRecords: Object.values(this.tables).reduce((sum, table) => sum + table.data.length, 0)
      },
      tables: this.tables
    };

    const json = JSON.stringify(result, null, 2);

    if (outputFile) {
      fs.writeFileSync(outputFile, json);
      console.log(`💾 Output written to ${outputFile}`);
    } else {
      console.log(json);
    }
  }

  /**
   * Convert SQL content to JSON (in-memory processing)
   */
  public sqlToJson(content: string): ConversionResult {
    // Remove BOM if present
    content = content.replace(/^\uFEFF/, '');
    
    const statements = content
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.length > 0) {
        const shouldContinue = this.processStatement(statement);
        if (!shouldContinue) break;
      }
    }

    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalTables: Object.keys(this.tables).length,
        totalRecords: Object.values(this.tables).reduce((sum, table) => sum + table.data.length, 0)
      },
      tables: this.tables
    };
  }

  /**
   * Convert SQL content to separate JSON files
   */
  public sqlToJsonFiles(content: string, outputDir = 'json-output'): SeparateFilesResult {
    // Remove BOM if present
    content = content.replace(/^\uFEFF/, '');
    
    // Split by semicolon and newline patterns, then clean up
    const statements = content
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--')); // Remove empty and comment-only statements
    
    for (const statement of statements) {
      if (statement.length > 0) {
        const shouldContinue = this.processStatement(statement);
        if (!shouldContinue) break;
      }
    }

    this.writeSeparateJSONFiles();
    
    return {
      metadata: {
        generatedAt: new Date().toISOString(),
        totalTables: Object.keys(this.tables).length,
        totalRecords: Object.values(this.tables).reduce((sum, table) => sum + table.data.length, 0),
        outputDirectory: this.outputDir
      },
      tables: Object.keys(this.tables)
    };
  }
}

/**
 * Show CLI help information
 */
function showHelp(): void {
  console.log(`
🔄 SQL to JSON Converter
Powerful SQL to JSON converter with efficient processing

Usage:
  npx sql-to-json-converter [input.sql] [options]
  sql-to-json [input.sql] [options]

Options:
  --help, -h                Show help
  --version, -v             Show version
  --output [file]           Output file for combined mode
  --separate                Export separate files (default)
  --combined                Export combined file
  --output-dir [dir]        Output directory (default: json-output)
  --memory, -m              Show memory usage
  --batch-size [num]        Batch size (default: 500)
  --limit [num]             Limit number of statements
  --skip-unparsable         Skip unparsable statements

Examples:
  npx sql-to-json-converter database.sql
  npx sql-to-json-converter database.sql --output-dir my-json-files
  npx sql-to-json-converter database.sql --combined --output result.json
  sql-to-json database.sql --memory --batch-size 1000
  `);
}

/**
 * Show version information
 */
function showVersion(): void {
  const pkg = require('../package.json');
  console.log(pkg.version);
}

/**
 * Parse CLI arguments
 */
function parseArgs(args: string[]): CLIArgs {
  const result: CLIArgs = {
    inputFile: args[0] || '',
    outputDir: 'json-output',
    showMemory: false,
    skipUnparsable: false,
    isCombined: false,
    batchSize: 500,
    limit: null
  };

  // Parse flags
  result.showMemory = args.includes('--memory') || args.includes('-m');
  result.skipUnparsable = args.includes('--skip-unparsable');
  result.isCombined = args.includes('--combined');

  // Parse options with values
  if (args.includes('--output')) {
    const outputIndex = args.indexOf('--output');
    result.outputFile = args[outputIndex + 1];
  }

  if (args.includes('--output-dir')) {
    const dirIndex = args.indexOf('--output-dir');
    result.outputDir = args[dirIndex + 1] || 'json-output';
  }

  if (args.includes('--batch-size')) {
    const batchIndex = args.indexOf('--batch-size');
    result.batchSize = parseInt(args[batchIndex + 1]) || 500;
  }

  if (args.includes('--limit')) {
    const limitIndex = args.indexOf('--limit');
    result.limit = parseInt(args[limitIndex + 1]) || null;
  }

  return result;
}

/**
 * Main CLI function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    return showHelp();
  }

  if (args.includes('--version') || args.includes('-v')) {
    return showVersion();
  }

  if (args.length === 0) {
    console.error('❌ Error: Please provide SQL file path');
    showHelp();
    process.exit(1);
  }

  const parsedArgs = parseArgs(args);

  if (!fs.existsSync(parsedArgs.inputFile)) {
    console.error(`❌ File not found: ${parsedArgs.inputFile}`);
    process.exit(1);
  }

  const stats = fs.statSync(parsedArgs.inputFile);
  const sizeMB = stats.size / (1024 * 1024);

  console.log(`📊 File size: ${sizeMB.toFixed(2)} MB`);

  try {
    const converter = new SQLToJSONConverter({
      batchSize: parsedArgs.batchSize,
      showMemory: parsedArgs.showMemory,
      limit: parsedArgs.limit,
      skipUnparsable: parsedArgs.skipUnparsable,
      outputMode: parsedArgs.isCombined ? 'combined' : 'separate',
      outputDir: parsedArgs.outputDir
    });

    if (sizeMB > 10 || parsedArgs.showMemory || parsedArgs.limit) {
      console.log('📦 Large file detected. Using stream processing...');
      await converter.processLargeSQL(parsedArgs.inputFile, parsedArgs.outputFile);
    } else {
      console.log('📦 Small file detected. Using in-memory parsing...');
      const content = fs.readFileSync(parsedArgs.inputFile, 'utf8');
      
      if (parsedArgs.isCombined) {
        const result = converter.sqlToJson(content);
        const json = JSON.stringify(result, null, 2);

        if (parsedArgs.outputFile) {
          fs.writeFileSync(parsedArgs.outputFile, json);
          console.log(`✅ Result written to ${parsedArgs.outputFile}`);
        } else {
          console.log(json);
        }
      } else {
        converter.sqlToJsonFiles(content, parsedArgs.outputDir);
      }
    }
  } catch (err) {
    console.error(`❌ Error: ${(err as Error).message}`);
    console.error((err as Error).stack);
    process.exit(1);
  }
}

// Export functions for use as library
export const sqlToJson = (content: string, options: ConverterOptions = {}): ConversionResult => {
  const converter = new SQLToJSONConverter(options);
  return converter.sqlToJson(content);
};

export const sqlToJsonFiles = (content: string, outputDir = 'json-output', options: ConverterOptions = {}): SeparateFilesResult => {
  const converter = new SQLToJSONConverter({ ...options, outputDir, outputMode: 'separate' });
  return converter.sqlToJsonFiles(content, outputDir);
};

export const processLargeSQL = async (inputFile: string, outputFile?: string, options: ConverterOptions = {}): Promise<void> => {
  const converter = new SQLToJSONConverter(options);
  return converter.processLargeSQL(inputFile, outputFile);
};

if (require.main === module) {
  main().catch(console.error);
} 