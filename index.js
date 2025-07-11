const { SQLToJSONConverter, sqlToJson, sqlToJsonFiles, processLargeSQL } = require('./bin/cli');

/**
 * Convert SQL content to JSON format (combined output)
 * @param {string} content - SQL content as string
 * @param {object} options - Conversion options
 * @returns {object} JSON result with metadata and tables
 */
function convertSQLToJSON(content, options = {}) {
  return sqlToJson(content, options);
}

/**
 * Convert SQL content to separate JSON files
 * @param {string} content - SQL content as string  
 * @param {string} outputDir - Output directory (default: 'json-output')
 * @param {object} options - Conversion options
 * @returns {object} Conversion result with metadata
 */
function convertSQLToJSONFiles(content, outputDir = 'json-output', options = {}) {
  return sqlToJsonFiles(content, outputDir, options);
}

/**
 * Process large SQL files with streaming
 * @param {string} inputFile - Path to input SQL file
 * @param {string} outputFile - Path to output JSON file (optional)
 * @param {object} options - Processing options
 * @returns {Promise} Processing result
 */
async function processLargeSQLFile(inputFile, outputFile, options = {}) {
  return processLargeSQL(inputFile, outputFile, options);
}

/**
 * Create a new SQL to JSON converter instance
 * @param {object} options - Converter options
 * @returns {SQLToJSONConverter} Converter instance
 */
function createConverter(options = {}) {
  return new SQLToJSONConverter(options);
}

module.exports = {
  // Main converter class
  SQLToJSONConverter,
  
  // High-level API functions
  convertSQLToJSON,
  convertSQLToJSONFiles,
  processLargeSQLFile,
  createConverter,
  
  // Low-level functions (backward compatibility)
  sqlToJson,
  sqlToJsonFiles,
  processLargeSQL
}; 