# SQL to JSON Converter

🔄 Powerful SQL to JSON converter với hỗ trợ file lớn và nhiều định dạng output. Chuyển đổi SQL database dumps thành các file JSON có cấu trúc.

## ✨ Tính năng nổi bật

- 🚀 **Xử lý file lớn**: Stream processing cho file SQL lên đến GB
- 📁 **Multiple output modes**: 
  - Separate files: Mỗi table thành 1 file JSON riêng (mặc định)
  - Combined file: Tất cả tables trong 1 file JSON
- 💾 **Smart output**: Tự động tạo thư mục `json-output` với summary file
- ⚡ **High performance**: Batch processing và memory optimization
- 🛡️ **Error resilient**: Skip unparsable statements và tiếp tục xử lý
- 📊 **Progress tracking**: Real-time progress và memory usage
- 🎯 **CLI & Library**: Sử dụng được cả CLI và JavaScript library

## 📦 Cài đặt

### Sử dụng với npx (khuyến nghị)
```bash
npx sql-to-json-converter database.sql
```

### Cài đặt global
```bash
npm install -g sql-to-json-converter
sql-to-json database.sql
```

### Cài đặt local  
```bash
npm install sql-to-json-converter
```

## 🚀 Sử dụng CLI

### Separate files mode (mặc định)
```bash
# Xuất mỗi table thành file riêng trong thư mục json-output/
npx sql-to-json-converter database.sql

# Chỉ định thư mục output khác
npx sql-to-json-converter database.sql --output-dir my-tables

# Với các options khác
npx sql-to-json-converter database.sql --memory --batch-size 1000
```

### Combined file mode
```bash
# Xuất tất cả vào 1 file JSON
npx sql-to-json-converter database.sql --combined --output result.json

# Xuất ra stdout
npx sql-to-json-converter database.sql --combined
```

### Advanced options
```bash
# Xử lý file lớn với memory monitoring
npx sql-to-json-converter large-db.sql --memory --limit 100000

# Skip các statements không parse được (xử lý nhanh hơn)
npx sql-to-json-converter database.sql --skip-unparsable

# Custom batch size cho performance tuning
npx sql-to-json-converter database.sql --batch-size 2000
```

## 📚 Sử dụng như Library

### Basic usage
```javascript
const { convertSQLToJSONFiles, convertSQLToJSON } = require('sql-to-json-converter');

// Đọc SQL file và chuyển đổi thành separate files
const sqlContent = fs.readFileSync('database.sql', 'utf8');
const result = convertSQLToJSONFiles(sqlContent, 'output-folder');
console.log(`Converted ${result.metadata.totalTables} tables`);

// Hoặc chuyển đổi thành combined JSON
const combined = convertSQLToJSON(sqlContent);
console.log(combined.tables);
```

### Advanced usage
```javascript
const { SQLToJSONConverter } = require('sql-to-json-converter');

const converter = new SQLToJSONConverter({
  batchSize: 1000,
  showMemory: true,
  outputMode: 'separate',
  outputDir: 'my-json-data'
});

// Process large file with streaming
converter.processLargeSQL('huge-database.sql').then(() => {
  console.log('Conversion completed!');
});
```

### API Reference

```javascript
// High-level functions
convertSQLToJSON(content, options)           // -> Combined JSON object
convertSQLToJSONFiles(content, outputDir)    // -> Separate files + summary  
processLargeSQLFile(inputFile, outputFile)   // -> Stream processing

// Advanced usage
createConverter(options)                     // -> SQLToJSONConverter instance
```

## 📝 Output Examples

### Input SQL
```sql
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE
);

INSERT INTO users VALUES (1, 'John Doe', 'john@example.com');
INSERT INTO users VALUES (2, 'Jane Smith', 'jane@example.com');

CREATE TABLE products (
    id INT PRIMARY KEY,
    name VARCHAR(100),
    price DECIMAL(10,2)
);

INSERT INTO products VALUES (1, 'Laptop', 999.99);
INSERT INTO products VALUES (2, 'Mouse', 25.50);
```

### Separate Files Output (default)
```
json-output/
├── _summary.json       # Overview của tất cả tables
├── users.json          # User table data
└── products.json       # Product table data
```

**users.json:**
```json
{
  "tableName": "users",
  "columns": [
    {"name": "id", "type": "INT PRIMARY KEY AUTO_INCREMENT"},
    {"name": "name", "type": "VARCHAR(255) NOT NULL"},
    {"name": "email", "type": "VARCHAR(255) UNIQUE"}
  ],
  "recordCount": 2,
  "generatedAt": "2024-01-20T10:30:00.000Z",
  "data": [
    {"id": 1, "name": "John Doe", "email": "john@example.com"},
    {"id": 2, "name": "Jane Smith", "email": "jane@example.com"}
  ]
}
```

**_summary.json:**
```json
{
  "generatedAt": "2024-01-20T10:30:00.000Z",
  "totalTables": 2,
  "totalRecords": 4,
  "tables": [
    {"name": "users", "recordCount": 2, "fileName": "users.json"},
    {"name": "products", "recordCount": 2, "fileName": "products.json"}
  ]
}
```

## 🎯 CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--help, -h` | Hiển thị hướng dẫn | |
| `--version, -v` | Hiển thị version | |
| `--separate` | Xuất separate files (mặc định) | ✅ |
| `--combined` | Xuất combined file | |
| `--output [file]` | File output cho combined mode | |
| `--output-dir [dir]` | Thư mục output cho separate mode | `json-output` |
| `--memory, -m` | Hiển thị memory usage | |
| `--batch-size [num]` | Batch size cho processing | `500` |
| `--limit [num]` | Giới hạn số statements | |
| `--skip-unparsable` | Skip statements không parse được | |

## 🚀 Performance

### File Size Guidelines
- **< 10MB**: In-memory processing
- **> 10MB**: Automatic stream processing  
- **> 100MB**: Khuyến nghị dùng `--memory` flag
- **> 1GB**: Khuyến nghị tăng `--batch-size` lên 2000+

### Memory Optimization
```bash
# Cho file rất lớn (> 1GB)
npx sql-to-json-converter huge-db.sql \
  --memory \
  --batch-size 5000 \
  --skip-unparsable \
  --output-dir large-output
```

## 📊 Supported SQL Statements

| Statement | Support | Description |
|-----------|---------|-------------|
| CREATE TABLE | ✅ Full | Table structure, columns, constraints |
| INSERT INTO | ✅ Full | Single và multiple value sets |
| VALUES | ✅ Full | Quoted strings, numbers, NULL |
| DROP TABLE | ✅ Skip | Ignored during processing |
| Comments | ✅ Full | `--` line comments |
| Transactions | ✅ Basic | START TRANSACTION, COMMIT |

## 🛠 Development

### Setup
```bash
git clone <repo-url>
cd sql-to-json-converter
npm install
```

### Testing
```bash
# Create test SQL file
echo "CREATE TABLE test (id INT); INSERT INTO test VALUES (1);" > test.sql

# Test CLI
npm start test.sql

# Test library
node -e "
const {convertSQLToJSONFiles} = require('./index');
const fs = require('fs');
const sql = fs.readFileSync('test.sql', 'utf8');
console.log(convertSQLToJSONFiles(sql));
"
```

### Publishing
```bash
# Update version
npm version patch|minor|major

# Publish to npm
npm publish
```

## ⚙️ Configuration Options

```javascript
const options = {
  batchSize: 1000,        // Processing batch size
  showMemory: true,       // Show memory usage
  limit: 50000,          // Max statements to process
  skipUnparsable: true,   // Skip invalid statements
  outputMode: 'separate', // 'separate' or 'combined'
  outputDir: 'my-output'  // Output directory name
};
```

## 🐛 Troubleshooting

### Common Issues

**1. Memory errors với file lớn**
```bash
# Giảm batch size và enable memory monitoring
npx sql-to-json-converter large-file.sql --batch-size 200 --memory
```

**2. Statements không parse được**
```bash
# Skip invalid statements
npx sql-to-json-converter problematic.sql --skip-unparsable
```

**3. Quá chậm với file rất lớn**
```bash
# Tăng batch size và skip unparsable
npx sql-to-json-converter huge.sql --batch-size 2000 --skip-unparsable
```

## 📄 License

MIT License

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)  
5. Open Pull Request

## 📞 Support

- 🐛 **Bug reports**: [GitHub Issues](https://github.com/your-username/sql-to-json-converter/issues)
- 💡 **Feature requests**: [GitHub Discussions](https://github.com/your-username/sql-to-json-converter/discussions)
- 📚 **Documentation**: [GitHub Wiki](https://github.com/your-username/sql-to-json-converter/wiki)
- 📧 **Email**: support@sql-to-json.com 