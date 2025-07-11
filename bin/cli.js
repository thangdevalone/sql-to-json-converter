#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

class SQLToJSONConverter {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 500;
    this.showMemory = options.showMemory || false;
    this.limit = options.limit || null;
    this.skipUnparsable = options.skipUnparsable || false;
    this.outputMode = options.outputMode || 'combined'; // 'combined' or 'separate'
    this.outputDir = options.outputDir || 'json-output';
    this.processedStatements = 0;
    this.tables = {};
    this.currentTable = null;
    this.currentCreateTable = '';
    this.insideTransaction = false;
  }

  logMemoryUsage() {
    if (this.showMemory) {
      const used = process.memoryUsage();
      console.error(`Memory: RSS ${Math.round(used.rss / 1024 / 1024 * 100) / 100} MB, Heap ${Math.round(used.heapUsed / 1024 / 1024 * 100) / 100} MB`);
    }
  }

  parseCreateTable(sql) {
    try {
      // Extract table name
      const tableMatch = sql.match(/CREATE TABLE\s+`?([^`\s(]+)`?\s*\(/i);
      if (!tableMatch) return null;

      const tableName = tableMatch[1].replace(/^SERVMASK_PREFIX_/, '');
      
      // Extract columns from CREATE TABLE statement
      const columns = [];
      
      // Find the content between the first ( and the last )
      const startParen = sql.indexOf('(');
      const endParen = sql.lastIndexOf(')');
      
      if (startParen === -1 || endParen === -1) return null;
      
      const columnsPart = sql.substring(startParen + 1, endParen);
      
      // Split by lines and process each line
      const lines = columnsPart.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // Skip empty lines, comments, PRIMARY KEY, KEY definitions, and ENGINE
        if (!trimmed || 
            trimmed.startsWith('--') || 
            trimmed.toUpperCase().startsWith('PRIMARY KEY') || 
            trimmed.toUpperCase().startsWith('KEY ') ||
            trimmed.toUpperCase().startsWith('UNIQUE KEY') ||
            trimmed.toUpperCase().startsWith('FOREIGN KEY') ||
            trimmed.toUpperCase().includes('ENGINE=')) {
          continue;
        }
        
        // Look for column definitions that start with backtick
        const columnMatch = trimmed.match(/^`([^`]+)`\s+(.+?)(?:,\s*)?$/);
        if (columnMatch) {
          const columnName = columnMatch[1];
          let columnType = columnMatch[2].trim();
          
          // Remove trailing comma
          columnType = columnType.replace(/,$/, '');
          
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
        console.error(`Error parsing CREATE TABLE: ${error.message}`);
      }
      return null;
    }
  }

  parseInsertInto(sql) {
    try {
      // Extract table name
      const tableMatch = sql.match(/INSERT INTO\s+`?([^`\s(]+)`?\s*(?:\([^)]+\))?\s*VALUES/i);
      if (!tableMatch) return null;

      const tableName = tableMatch[1].replace(/^SERVMASK_PREFIX_/, '');
      
      // Extract values - handle multiple value sets
      const valuesMatch = sql.match(/VALUES\s*(.*)/is);
      if (!valuesMatch) return null;

      const valuesString = valuesMatch[1];
      const records = [];
      
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
        console.error(`Error parsing INSERT INTO: ${error.message}`);
      }
      return null;
    }
  }

  parseValues(valueString) {
    const values = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let depth = 0;
    
    for (let i = 0; i < valueString.length; i++) {
      const char = valueString[i];
      const nextChar = valueString[i + 1];
      
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

  cleanValue(value) {
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
      return parseInt(value);
    }
    
    if (/^-?\d+\.\d+$/.test(value)) {
      return parseFloat(value);
    }
    
    return value;
  }

  processStatement(sql) {
    sql = sql.trim();
    if (!sql) return;

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
          const obj = {};
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

  async processLargeSQL(inputFile, outputFile) {
    console.error('🚀 Starting SQL to JSON conversion...');
    console.error(`📁 Input: ${inputFile}`);
    
    if (this.outputMode === 'separate') {
      console.error(`📁 Output directory: ${this.outputDir}/`);
      this.ensureOutputDirectory();
    } else {
      console.error(`📄 Output: ${outputFile || 'stdout'}`);
    }
    
    console.error(`⚙️  Batch size: ${this.batchSize}`);
    if (this.limit) console.error(`🔢 Limit: ${this.limit} statements`);
    
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
        console.error(`📊 Processed ${lineCount} lines, ${this.processedStatements} statements, ${Object.keys(this.tables).length} tables`);
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
          console.error('🛑 Reached processing limit');
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

    console.error(`✅ Conversion completed in ${duration.toFixed(2)}s`);
    console.error(`📊 Final stats:`);
    console.error(`   - Lines processed: ${lineCount}`);
    console.error(`   - Statements processed: ${this.processedStatements}`);
    console.error(`   - Tables found: ${Object.keys(this.tables).length}`);
    
    Object.keys(this.tables).forEach(tableName => {
      console.error(`   - ${tableName}: ${this.tables[tableName].data.length} records`);
    });

    this.logMemoryUsage();

    // Generate output based on mode
    if (this.outputMode === 'separate') {
      this.writeSeparateJSONFiles();
    } else {
      this.writeCombinedJSON(outputFile);
    }
  }

  ensureOutputDirectory() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
      console.error(`📁 Created output directory: ${this.outputDir}`);
    }
  }

  writeSeparateJSONFiles() {
    this.ensureOutputDirectory();
    
    let filesWritten = 0;
    for (const [tableName, table] of Object.entries(this.tables)) {
      const fileName = `${tableName}.json`;
      const filePath = path.join(this.outputDir, fileName);
      
      const tableData = {
        tableName,
        columns: table.columns,
        recordCount: table.data.length,
        generatedAt: new Date().toISOString(),
        data: table.data
      };
      
      fs.writeFileSync(filePath, JSON.stringify(tableData, null, 2), 'utf-8');
      console.error(`✅ Wrote ${filePath} (${table.data.length} records)`);
      filesWritten++;
    }
    
    // Create summary file
    const summary = {
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
    console.error(`✅ Wrote summary file: ${summaryPath}`);
    
    console.error(`🎉 Successfully wrote ${filesWritten} table files + 1 summary file`);
  }

  writeCombinedJSON(outputFile) {
    const result = {
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
      console.error(`💾 Output written to ${outputFile}`);
    } else {
      console.log(json);
    }
  }

  sqlToJson(content) {
    const statements = content.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      const shouldContinue = this.processStatement(statement);
      if (!shouldContinue) break;
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

  // New method for separate files output from string content
  sqlToJsonFiles(content, outputDir = 'json-output') {
    this.outputDir = outputDir;
    this.outputMode = 'separate';
    
    const statements = content.split(';').filter(s => s.trim());
    
    for (const statement of statements) {
      const shouldContinue = this.processStatement(statement);
      if (!shouldContinue) break;
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

function showHelp() {
  console.log(`
🔄 SQL to JSON Converter
Chuyển đổi file SQL sang JSON một cách hiệu quả

Cách sử dụng:
  npx sql-to-json-converter [input.sql] [options]
  sql-to-json [input.sql] [options]

Tùy chọn:
  --help, -h                Hiển thị hướng dẫn này
  --version, -v             Hiển thị phiên bản
  --output [file]           File đầu ra (cho chế độ combined)
  --separate                Xuất từng bảng thành file riêng (mặc định)
  --combined                Xuất tất cả vào 1 file JSON
  --output-dir [dir]        Thư mục đầu ra (mặc định: json-output)
  --memory, -m              Hiển thị thông tin bộ nhớ
  --batch-size [số]         Batch size (mặc định: 500)
  --limit [số]              Giới hạn số lượng SQL statements
  --skip-unparsable         Bỏ qua statements không parse được

Ví dụ:
  npx sql-to-json-converter database.sql
  npx sql-to-json-converter database.sql --output-dir my-json-files
  npx sql-to-json-converter database.sql --combined --output result.json
  sql-to-json database.sql --memory --batch-size 1000
  `);
}

function showVersion() {
  const pkg = require('../package.json');
  console.log(pkg.version);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    return showHelp();
  }

  if (args.includes('--version') || args.includes('-v')) {
    return showVersion();
  }

  if (args.length === 0) {
    console.error('❌ Lỗi: Vui lòng cung cấp đường dẫn file SQL');
    showHelp();
    process.exit(1);
  }

  const inputFile = args[0];

  // Parse options
  const showMemory = args.includes('--memory') || args.includes('-m');
  const skipUnparsable = args.includes('--skip-unparsable');
  const isCombined = args.includes('--combined');
  const isSeparate = args.includes('--separate') || !isCombined; // default to separate
  
  let outputFile = null;
  if (args.includes('--output')) {
    const outputIndex = args.indexOf('--output');
    outputFile = args[outputIndex + 1];
  }
  
  let outputDir = 'json-output';
  if (args.includes('--output-dir')) {
    const dirIndex = args.indexOf('--output-dir');
    outputDir = args[dirIndex + 1] || 'json-output';
  }
  
  let batchSize = 500;
  if (args.includes('--batch-size')) {
    const batchIndex = args.indexOf('--batch-size');
    batchSize = parseInt(args[batchIndex + 1]) || 500;
  }
  
  let limit = null;
  if (args.includes('--limit')) {
    const limitIndex = args.indexOf('--limit');
    limit = parseInt(args[limitIndex + 1]) || null;
  }

  if (!fs.existsSync(inputFile)) {
    console.error(`❌ Không tìm thấy file: ${inputFile}`);
    process.exit(1);
  }

  const stats = fs.statSync(inputFile);
  const sizeMB = stats.size / (1024 * 1024);

  console.error(`📊 File size: ${sizeMB.toFixed(2)} MB`);

  try {
    const converter = new SQLToJSONConverter({
      batchSize,
      showMemory,
      limit,
      skipUnparsable,
      outputMode: isCombined ? 'combined' : 'separate',
      outputDir
    });

    if (sizeMB > 10 || showMemory || limit) {
      console.error('📦 File lớn được phát hiện. Sử dụng stream processing...');
      await converter.processLargeSQL(inputFile, outputFile);
    } else {
      console.error('📦 File nhỏ được phát hiện. Sử dụng in-memory parsing...');
      const content = fs.readFileSync(inputFile, 'utf8');
      
      if (isCombined) {
        const result = converter.sqlToJson(content);
        const json = JSON.stringify(result, null, 2);

        if (outputFile) {
          fs.writeFileSync(outputFile, json);
          console.error(`✅ Đã ghi kết quả vào ${outputFile}`);
        } else {
          console.log(json);
        }
      } else {
        converter.sqlToJsonFiles(content, outputDir);
      }
    }
  } catch (err) {
    console.error(`❌ Lỗi: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

// Export functions for use as library
module.exports = {
  SQLToJSONConverter,
  sqlToJson: (content, options = {}) => {
    const converter = new SQLToJSONConverter(options);
    return converter.sqlToJson(content);
  },
  sqlToJsonFiles: (content, outputDir = 'json-output', options = {}) => {
    const converter = new SQLToJSONConverter({ ...options, outputDir, outputMode: 'separate' });
    return converter.sqlToJsonFiles(content, outputDir);
  },
  processLargeSQL: async (inputFile, outputFile, options = {}) => {
    const converter = new SQLToJSONConverter(options);
    return converter.processLargeSQL(inputFile, outputFile);
  }
};

if (require.main === module) {
  main();
}