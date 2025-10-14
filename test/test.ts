import { SQLToJSONConverter } from '../src/cli';
import { expect } from 'chai';
import 'mocha';

describe('SQLToJSONConverter', () => {
  it('should handle semicolons in string literals', () => {
    const converter = new SQLToJSONConverter();
    const sql = `
      CREATE TABLE users (
        id INT,
        data VARCHAR(255)
      );
      INSERT INTO users (id, data) VALUES (1, 'Here is some data; with a semicolon');
    `;
    const result = converter.sqlToJson(sql);
    expect(result.tables.users.data[0].data).to.equal('Here is some data; with a semicolon');
  });
});