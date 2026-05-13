/**
 * Universal Database MCP Tools Bundle
 * Covers: PostgreSQL, MySQL, SQLite, MongoDB, Redis, ClickHouse,
 * Elasticsearch, DuckDB, Neo4j, BigQuery, Snowflake, InfluxDB,
 * Firebase, Qdrant, and more.
 *
 * Each adapter reads its configuration from environment variables
 * by default and uses axios for HTTP-based backends.
 */

import axios from 'axios';
import { execSync } from 'child_process';

// ═══════════════════════════════════════════════════════════════════════════
// PostgreSQL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PostgreSQL adapter for executing SQL queries and introspecting schemas.
 * Uses POSTGRES_URL or individual POSTGRES_HOST / POSTGRES_PORT / etc.
 */
export class PostgreSQLAdapter {
  private config: { host: string; port: number; user: string; password: string; database: string };

  constructor(config?: { host?: string; port?: number; user?: string; password?: string; database?: string }) {
    const url = config || {};
    this.config = {
      host: url.host || process.env.POSTGRES_HOST || process.env.PGHOST || 'localhost',
      port: url.port || parseInt(process.env.POSTGRES_PORT || process.env.PGPORT || '5432', 10),
      user: url.user || process.env.POSTGRES_USER || process.env.PGUSER || 'postgres',
      password: url.password || process.env.POSTGRES_PASSWORD || process.env.PGPASSWORD || '',
      database: url.database || process.env.POSTGRES_DB || process.env.PGDATABASE || 'postgres',
    };
  }

  /** Execute a raw SQL query and return rows */
  async query(sql: string): Promise<any> {
    try {
      const result = this.execPsql(`-c "${sql.replace(/"/g, '\\"')}"`);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Retrieve full schema (tables, columns, types) for the connected database */
  async getSchema(): Promise<any> {
    return this.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `);
  }

  /** List all public tables in the database */
  async listTables(): Promise<string[]> {
    const res = await this.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
    );
    return res.success ? res.data.map((r: any) => r.table_name) : [];
  }

  /** Get column details and row count for a specific table */
  async getTableInfo(table: string): Promise<any> {
    const cols = await this.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns WHERE table_name = '${table}'
    `);
    const count = await this.query(`SELECT COUNT(*)::int AS cnt FROM "${table}"`);
    return { success: true, data: { columns: cols.data, count: count.data?.[0]?.cnt ?? 0 } };
  }

  /** Check if the PostgreSQL server is reachable */
  async ping(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /** Helper: execute psql command */
  private execPsql(flags: string): any {
    const envPassword = this.config.password;
    const cmd = `PGPASSWORD="${envPassword}" psql -h ${this.config.host} -p ${this.config.port} -U ${this.config.user} -d ${this.config.database} -t -A -F '|' ${flags}`;
    const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
    if (!out) return [];
    const headers = out.split('\n')[0].split('|');
    return out.split('\n').slice(1).map((line) => {
      const vals = line.split('|');
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim(); });
      return row;
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MySQL
// ═══════════════════════════════════════════════════════════════════════════

/**
 * MySQL adapter for executing SQL queries and introspecting schemas.
 * Uses MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE.
 */
export class MySQLAdapter {
  private config: { host: string; port: number; user: string; password: string; database: string };

  constructor(config?: { host?: string; port?: number; user?: string; password?: string; database?: string }) {
    const c = config || {};
    this.config = {
      host: c.host || process.env.MYSQL_HOST || 'localhost',
      port: c.port || parseInt(process.env.MYSQL_PORT || '3306', 10),
      user: c.user || process.env.MYSQL_USER || 'root',
      password: c.password || process.env.MYSQL_PASSWORD || '',
      database: c.database || process.env.MYSQL_DATABASE || 'mysql',
    };
  }

  /** Execute a raw SQL query */
  async query(sql: string): Promise<any> {
    try {
      const result = this.execMysql(`-e "${sql.replace(/"/g, '\\"')}"`);
      return { success: true, data: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Retrieve schema information for all tables */
  async getSchema(): Promise<any> {
    return this.query(`
      SELECT TABLE_NAME as table_name, COLUMN_NAME as column_name,
             DATA_TYPE as data_type, IS_NULLABLE as is_nullable, COLUMN_DEFAULT as column_default
      FROM information_schema.columns
      WHERE TABLE_SCHEMA = '${this.config.database}'
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);
  }

  /** List all tables in the database */
  async listTables(): Promise<string[]> {
    const res = await this.query(
      `SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = '${this.config.database}'`
    );
    return res.success ? res.data.map((r: any) => r.TABLE_NAME) : [];
  }

  /** Helper: execute mysql command */
  private execMysql(flags: string): any {
    const cmd = `mysql -h ${this.config.host} -P ${this.config.port} -u ${this.config.user} -p"${this.config.password}" ${this.config.database} ${flags}`;
    const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
    if (!out) return [];
    const lines = out.split('\n');
    const headers = lines[0].split('\t');
    return lines.slice(1).map((line) => {
      const vals = line.split('\t');
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim(); });
      return row;
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SQLite
// ═══════════════════════════════════════════════════════════════════════════

/**
 * SQLite adapter using the local sqlite3 CLI.
 * Uses SQLITE_DB_PATH or defaults to ':memory:'.
 */
export class SQLiteAdapter {
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.SQLITE_DB_PATH || ':memory:';
  }

  /** Execute a raw SQL query */
  async query(sql: string): Promise<any> {
    try {
      const cmd = `sqlite3 -json "${this.dbPath}" "${sql.replace(/"/g, '\\"')}"`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
      return { success: true, data: out ? JSON.parse(out) : [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Retrieve schema for all user tables */
  async getSchema(): Promise<any> {
    return this.query(`
      SELECT m.name as table_name, p.name as column_name, p.type as data_type,
             p.notnull as is_nullable, p.dflt_value as column_default
      FROM sqlite_master m
      JOIN pragma_table_info(m.name) p ON m.type = 'table'
      WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
    `);
  }

  /** List all user tables */
  async listTables(): Promise<string[]> {
    const res = await this.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    return res.success ? res.data.map((r: any) => r.name) : [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MongoDB
// ═══════════════════════════════════════════════════════════════════════════

/**
 * MongoDB adapter using mongosh CLI for operations.
 * Uses MONGODB_URI or MONGO_URL.
 */
export class MongoDBAdapter {
  private connectionString: string;

  constructor(connectionString?: string) {
    this.connectionString = connectionString || process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017';
  }

  /** List all databases on the server */
  async listDatabases(): Promise<string[]> {
    try {
      const cmd = `mongosh "${this.connectionString}" --quiet --eval "db.adminCommand('listDatabases').databases.map(d=>d.name)"`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
      const match = out.match(/\[[\s\S]*\]/);
      return match ? JSON.parse(match[0]) : [];
    } catch (error: any) {
      return [];
    }
  }

  /** List all collections in a database */
  async listCollections(db: string): Promise<string[]> {
    try {
      const cmd = `mongosh "${this.connectionString}/${db}" --quiet --eval "db.getCollectionNames()"`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
      const match = out.match(/\[[\s\S]*\]/);
      return match ? JSON.parse(match[0]) : [];
    } catch {
      return [];
    }
  }

  /** Find documents matching a filter */
  async find(db: string, collection: string, filter: any = {}): Promise<any> {
    try {
      const jsonFilter = JSON.stringify(filter).replace(/'/g, "'\\''");
      const cmd = `mongosh "${this.connectionString}/${db}" --quiet --eval "JSON.stringify(db.${collection}.find(${jsonFilter}).limit(100).toArray())"`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
      return { success: true, data: JSON.parse(out) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Execute an aggregation pipeline */
  async aggregate(db: string, collection: string, pipeline: any[]): Promise<any> {
    try {
      const jsonPipeline = JSON.stringify(pipeline);
      const cmd = `mongosh "${this.connectionString}/${db}" --quiet --eval "JSON.stringify(db.${collection}.aggregate(${jsonPipeline}).toArray())"`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
      return { success: true, data: JSON.parse(out) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Insert a single document */
  async insertOne(db: string, collection: string, doc: any): Promise<any> {
    try {
      const jsonDoc = JSON.stringify(doc);
      const cmd = `mongosh "${this.connectionString}/${db}" --quiet --eval "JSON.stringify(db.${collection}.insertOne(${jsonDoc}))"`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
      return { success: true, data: JSON.parse(out) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Insert multiple documents */
  async insertMany(db: string, collection: string, docs: any[]): Promise<any> {
    try {
      const jsonDocs = JSON.stringify(docs);
      const cmd = `mongosh "${this.connectionString}/${db}" --quiet --eval "JSON.stringify(db.${collection}.insertMany(${jsonDocs}))"`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
      return { success: true, data: JSON.parse(out) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Redis
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Redis adapter using the redis-cli for key-value operations.
 * Uses REDIS_URL or REDIS_HOST / REDIS_PORT.
 */
export class RedisAdapter {
  private url: string;

  constructor(url?: string) {
    this.url = url || process.env.REDIS_URL || 'redis://localhost:6379';
  }

  /** Get a value by key */
  async get(key: string): Promise<string | null> {
    try {
      const cmd = `redis-cli -u "${this.url}" GET "${key}"`;
      const out = execSync(cmd, { timeout: 10000, encoding: 'utf-8' }).trim();
      return out === '' ? null : out;
    } catch (error: any) {
      return null;
    }
  }

  /** Set a key-value pair with optional TTL in seconds */
  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      const ttlFlag = ttl ? ` EX ${ttl}` : '';
      execSync(`redis-cli -u "${this.url}" SET "${key}" "${value}"${ttlFlag}`, { timeout: 10000 });
    } catch (error: any) {
      throw new Error(`Redis SET failed: ${error.message}`);
    }
  }

  /** Delete a key */
  async del(key: string): Promise<boolean> {
    try {
      const out = execSync(`redis-cli -u "${this.url}" DEL "${key}"`, { timeout: 10000, encoding: 'utf-8' }).trim();
      return parseInt(out, 10) > 0;
    } catch {
      return false;
    }
  }

  /** List keys matching a glob pattern */
  async keys(pattern: string): Promise<string[]> {
    try {
      const out = execSync(`redis-cli -u "${this.url}" KEYS "${pattern}"`, { timeout: 10000, encoding: 'utf-8' }).trim();
      return out ? out.split('\n') : [];
    } catch {
      return [];
    }
  }

  /** Get all fields and values of a hash */
  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      const out = execSync(`redis-cli -u "${this.url}" HGETALL "${key}"`, { timeout: 10000, encoding: 'utf-8' }).trim();
      if (!out) return {};
      const lines = out.split('\n');
      const result: Record<string, string> = {};
      for (let i = 0; i < lines.length; i += 2) {
        result[lines[i]] = lines[i + 1] || '';
      }
      return result;
    } catch {
      return {};
    }
  }

  /** Get server info */
  async info(): Promise<string> {
    try {
      return execSync(`redis-cli -u "${this.url}" INFO`, { timeout: 10000, encoding: 'utf-8' });
    } catch (error: any) {
      throw new Error(`Redis INFO failed: ${error.message}`);
    }
  }

  /** Check if the Redis server is reachable */
  async ping(): Promise<boolean> {
    try {
      const out = execSync(`redis-cli -u "${this.url}" PING`, { timeout: 5000, encoding: 'utf-8' }).trim();
      return out === 'PONG';
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Elasticsearch
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Elasticsearch adapter for full-text search, indexing, and mapping operations.
 * Uses ELASTICSEARCH_URL or ES_URL. Supports ELASTICSEARCH_API_KEY or ES_API_KEY.
 */
export class ElasticsearchAdapter {
  private url: string;
  private headers: Record<string, string>;

  constructor(url?: string) {
    this.url = (url || process.env.ELASTICSEARCH_URL || process.env.ES_URL || 'http://localhost:9200').replace(/\/+$/, '');
    this.headers = { 'Content-Type': 'application/json' };
    const apiKey = process.env.ELASTICSEARCH_API_KEY || process.env.ES_API_KEY;
    if (apiKey) this.headers['Authorization'] = `ApiKey ${apiKey}`;
  }

  /** Execute a search query on an index */
  async search(index: string, body: any): Promise<any> {
    try {
      const response = await axios.post(`${this.url}/${index}/_search`, body, { headers: this.headers });
      return { success: true, data: { hits: response.data.hits?.hits || [], total: response.data.hits?.total } };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.reason || error.message };
    }
  }

  /** Index (create or replace) a document */
  async index(index: string, id: string, body: any): Promise<any> {
    try {
      const response = await axios.put(`${this.url}/${index}/_doc/${id}`, body, { headers: this.headers });
      return { success: true, data: { id: response.data._id, result: response.data.result } };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.reason || error.message };
    }
  }

  /** List all indices */
  async getIndices(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.url}/_cat/indices?h=index&s=index`, { headers: this.headers });
      return response.data.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }

  /** Get the mapping for a specific index */
  async getMapping(index: string): Promise<any> {
    try {
      const response = await axios.get(`${this.url}/${index}/_mapping`, { headers: this.headers });
      return { success: true, data: response.data[index]?.mappings || response.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.reason || error.message };
    }
  }

  /** Count documents in an index */
  async count(index: string): Promise<number> {
    try {
      const response = await axios.get(`${this.url}/${index}/_count`, { headers: this.headers });
      return response.data.count || 0;
    } catch {
      return 0;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ClickHouse
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ClickHouse adapter for OLAP queries via HTTP interface.
 * Uses CLICKHOUSE_URL or defaults to http://localhost:8123.
 */
export class ClickHouseAdapter {
  private url: string;

  constructor(url?: string) {
    this.url = (url || process.env.CLICKHOUSE_URL || 'http://localhost:8123').replace(/\/+$/, '');
  }

  /** Execute a SQL query. Set format=JSON to get structured output. */
  async query(sql: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.url}/`,
        sql.includes('FORMAT') ? sql : `${sql} FORMAT JSON`,
        {
          headers: { 'Content-Type': 'text/plain' },
          params: { user: process.env.CLICKHOUSE_USER || 'default', password: process.env.CLICKHOUSE_PASSWORD || '' },
        }
      );
      return { success: true, data: response.data.data || response.data, rows: response.data.rows || 0 };
    } catch (error: any) {
      return { success: false, error: error.response?.data || error.message };
    }
  }

  /** List all tables in the default database */
  async getTables(): Promise<string[]> {
    try {
      const response = await axios.post(`${this.url}/`, 'SHOW TABLES FORMAT JSON', {
        headers: { 'Content-Type': 'text/plain' },
        params: { user: process.env.CLICKHOUSE_USER || 'default', password: process.env.CLICKHOUSE_PASSWORD || '' },
      });
      return (response.data.data || []).map((r: any) => r.name);
    } catch {
      return [];
    }
  }

  /** Check if ClickHouse is reachable */
  async ping(): Promise<boolean> {
    try {
      await axios.get(`${this.url}/ping`);
      return true;
    } catch {
      return false;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DuckDB
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DuckDB adapter using the duckdb CLI for analytical queries.
 * Uses DUCKDB_PATH or defaults to an in-memory database.
 */
export class DuckDBAdapter {
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.DUCKDB_PATH || ':memory:';
  }

  /** Execute a SQL query and return results as JSON */
  async query(sql: string): Promise<any> {
    try {
      const cmd = `duckdb -json "${this.dbPath}" -c "${sql.replace(/"/g, '\\"')}"`;
      const out = execSync(cmd, { timeout: 30000, encoding: 'utf-8' }).trim();
      return { success: true, data: out ? JSON.parse(out) : [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List all tables */
  async getTables(): Promise<string[]> {
    try {
      const cmd = `duckdb -json "${this.dbPath}" -c "SHOW TABLES"`;
      const out = execSync(cmd, { timeout: 10000, encoding: 'utf-8' }).trim();
      const parsed = out ? JSON.parse(out) : [];
      return parsed.map((r: any) => r.name || Object.values(r)[0]);
    } catch {
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Neo4j
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Neo4j adapter using cypher-shell CLI for graph queries.
 * Uses NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD.
 */
export class Neo4jAdapter {
  private uri: string;
  private user: string;
  private password: string;

  constructor(uri?: string, user?: string, password?: string) {
    this.uri = uri || process.env.NEO4J_URI || process.env.NEO4J_URL || 'bolt://localhost:7687';
    this.user = user || process.env.NEO4J_USER || 'neo4j';
    this.password = password || process.env.NEO4J_PASSWORD || 'password';
  }

  /** Execute a Cypher query with optional parameters */
  async query(cypher: string, params: Record<string, any> = {}): Promise<any> {
    try {
      const paramFlags = Object.entries(params).map(([k, v]) => ` -p "${k}=${JSON.stringify(v)}"`).join('');
      const cmd = `cypher-shell -a "${this.uri}" -u "${this.user}" -p "${this.password}" -f <(echo "${cypher.replace(/"/g, '\\"')}")${paramFlags}`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8', shell: '/bin/bash' }).trim();
      return { success: true, data: out };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Get graph schema (node labels and relationship types) */
  async getSchema(): Promise<any> {
    const labels = await this.query('CALL db.labels() YIELD label RETURN label');
    const relTypes = await this.query('CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType');
    return { success: true, data: { labels, relationshipTypes: relTypes } };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BigQuery
// ═══════════════════════════════════════════════════════════════════════════

/**
 * BigQuery adapter using bq CLI for Google Cloud analytics warehouse queries.
 * Uses GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT, and GOOGLE_APPLICATION_CREDENTIALS.
 */
export class BigQueryAdapter {
  private projectId: string;
  private keyFile: string;

  constructor(projectId?: string, keyFile?: string) {
    this.projectId = projectId || process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || '';
    this.keyFile = keyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS || '';
  }

  /** Execute a SQL query */
  async query(sql: string): Promise<any> {
    try {
      const credFlag = this.keyFile ? ` --credential_file="${this.keyFile}"` : '';
      const projectFlag = this.projectId ? ` --project_id="${this.projectId}"` : '';
      const cmd = `bq query --format=json --use_legacy_sql=false${credFlag}${projectFlag} "${sql.replace(/"/g, '\\"')}"`;
      const out = execSync(cmd, { timeout: 60000, encoding: 'utf-8' }).trim();
      return { success: true, data: out ? JSON.parse(out) : [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List all datasets in the project */
  async getDatasets(): Promise<string[]> {
    try {
      const credFlag = this.keyFile ? ` --credential_file="${this.keyFile}"` : '';
      const projectFlag = this.projectId ? ` --project_id="${this.projectId}"` : '';
      const cmd = `bq ls --format=json${credFlag}${projectFlag}`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
      return (out ? JSON.parse(out) : []).map((d: any) => d.id || d.datasetReference?.datasetId);
    } catch {
      return [];
    }
  }

  /** List tables in a dataset */
  async getTables(dataset: string): Promise<string[]> {
    try {
      const credFlag = this.keyFile ? ` --credential_file="${this.keyFile}"` : '';
      const projectFlag = this.projectId ? ` --project_id="${this.projectId}"` : '';
      const cmd = `bq ls --format=json "${dataset}"${credFlag}${projectFlag}`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
      return (out ? JSON.parse(out) : []).map((t: any) => t.id || t.tableReference?.tableId);
    } catch {
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Snowflake
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Snowflake adapter using snowsql CLI for data warehouse queries.
 * Uses SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_PASSWORD, SNOWFLAKE_DATABASE.
 */
export class SnowflakeAdapter {
  private account: string;
  private user: string;
  private password: string;
  private database: string;

  constructor() {
    this.account = process.env.SNOWFLAKE_ACCOUNT || '';
    this.user = process.env.SNOWFLAKE_USER || '';
    this.password = process.env.SNOWFLAKE_PASSWORD || '';
    this.database = process.env.SNOWFLAKE_DATABASE || '';
  }

  /** Execute a SQL query */
  async query(sql: string): Promise<any> {
    try {
      const dbFlag = this.database ? ` -d ${this.database}` : '';
      const cmd = `snowsql -a "${this.account}" -u "${this.user}" -p "${this.password}"${dbFlag} -o output_format=JSON -q "${sql.replace(/"/g, '\\"')}"`;
      const out = execSync(cmd, { timeout: 60000, encoding: 'utf-8' }).trim();
      return { success: true, data: out ? JSON.parse(out) : [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Retrieve schema info (tables and columns) */
  async getSchema(): Promise<any> {
    return this.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'PUBLIC'
      ORDER BY table_name, ordinal_position
    `);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// InfluxDB
// ═══════════════════════════════════════════════════════════════════════════

/**
 * InfluxDB adapter using the HTTP API v2 for time-series data.
 * Uses INFLUXDB_URL, INFLUXDB_TOKEN, INFLUXDB_ORG.
 */
export class InfluxDBAdapter {
  private url: string;
  private token: string;
  private org: string;

  constructor(url?: string, token?: string, org?: string) {
    this.url = (url || process.env.INFLUXDB_URL || 'http://localhost:8086').replace(/\/+$/, '');
    this.token = token || process.env.INFLUXDB_TOKEN || '';
    this.org = org || process.env.INFLUXDB_ORG || '';
  }

  /** Execute a Flux query */
  async query(flux: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.url}/api/v2/query?org=${this.org}`,
        flux,
        {
          headers: {
            'Authorization': `Token ${this.token}`,
            'Content-Type': 'application/vnd.flux',
            Accept: 'application/csv',
          },
        }
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  /** Write line protocol data to a bucket */
  async write(bucket: string, data: any): Promise<void> {
    try {
      const response = await axios.post(
        `${this.url}/api/v2/write?org=${this.org}&bucket=${bucket}`,
        typeof data === 'string' ? data : JSON.stringify(data),
        {
          headers: {
            'Authorization': `Token ${this.token}`,
            'Content-Type': 'text/plain; charset=utf-8',
          },
        }
      );
      if (response.status !== 204) throw new Error(`Unexpected status: ${response.status}`);
    } catch (error: any) {
      throw new Error(`InfluxDB write failed: ${error.message}`);
    }
  }

  /** List all buckets */
  async getBuckets(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.url}/api/v2/buckets?org=${this.org}`, {
        headers: { Authorization: `Token ${this.token}` },
      });
      return (response.data.buckets || []).map((b: any) => b.name);
    } catch {
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Firebase
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Firebase adapter using the Firebase REST API.
 * Uses FIREBASE_PROJECT_ID and FIREBASE_API_KEY or FIREBASE_DATABASE_URL.
 */
export class FirebaseAdapter {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    const projectId = process.env.FIREBASE_PROJECT_ID || '';
    this.baseUrl = process.env.FIREBASE_DATABASE_URL || `https://${projectId}.firebasedatabase.app`;
    this.apiKey = process.env.FIREBASE_API_KEY || '';
  }

  /** Get a single document from Firestore via REST */
  async getDocument(collection: string, docId: string): Promise<any> {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID || '';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;
      const headers: Record<string, string> = {};
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
      const response = await axios.get(url, { headers });
      return { success: true, data: this.unpackFirestoreFields(response.data.fields) };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /** Set a document in Firestore */
  async setDocument(collection: string, docId: string, data: any): Promise<void> {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID || '';
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${docId}`;
      const headers: Record<string, string> = {};
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
      await axios.patch(url, { fields: this.packFirestoreFields(data) }, { headers });
    } catch (error: any) {
      throw new Error(`Firebase setDocument failed: ${error.message}`);
    }
  }

  /** Query a Firestore collection with structured query */
  async queryCollection(collection: string, filters: any): Promise<any> {
    try {
      const projectId = process.env.FIREBASE_PROJECT_ID || '';
      const structuredQuery = this.buildStructuredQuery(filters);
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
      const headers: Record<string, string> = {};
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`;
      const response = await axios.post(url, { structuredQuery }, { headers });
      const docs = (response.data || [])
        .filter((r: any) => r.document)
        .map((r: any) => this.unpackFirestoreFields(r.document.fields));
      return { success: true, data: docs };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error?.message || error.message };
    }
  }

  /** Helper: unpack Firestore field values */
  private unpackFirestoreFields(fields: any): Record<string, any> {
    if (!fields) return {};
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(fields as Record<string, any>)) {
      const v = value as Record<string, any>;
      if (v.stringValue !== undefined) result[key] = v.stringValue;
      else if (v.integerValue !== undefined) result[key] = parseInt(v.integerValue, 10);
      else if (v.doubleValue !== undefined) result[key] = v.doubleValue;
      else if (v.booleanValue !== undefined) result[key] = v.booleanValue;
      else if (v.mapValue) result[key] = this.unpackFirestoreFields(v.mapValue.fields);
      else if (v.arrayValue) result[key] = (v.arrayValue.values || []).map((a: any) => this.unpackFirestoreFields(a.mapValue?.fields || {}));
      else if (v.timestampValue !== undefined) result[key] = v.timestampValue;
      else if (v.nullValue !== undefined) result[key] = null;
      else result[key] = v;
    }
    return result;
  }

  /** Helper: pack Firestore field values */
  private packFirestoreFields(data: any): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === null) result[key] = { nullValue: null };
      else if (typeof value === 'string') result[key] = { stringValue: value };
      else if (typeof value === 'number') result[key] = Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
      else if (typeof value === 'boolean') result[key] = { booleanValue: value };
      else if (Array.isArray(value)) result[key] = { arrayValue: { values: value.map((v) => ({ mapValue: { fields: this.packFirestoreFields(v) } })) } };
      else if (typeof value === 'object') result[key] = { mapValue: { fields: this.packFirestoreFields(value) } };
    }
    return result;
  }

  /** Helper: build a Firestore structured query from filter objects */
  private buildStructuredQuery(filters: any): any {
    const from = [{ collectionId: filters.collection || '' }];
    const where = filters.field && filters.operator
      ? {
          fieldFilter: {
            field: { fieldPath: filters.field },
            op: filters.operator,
            value: { stringValue: String(filters.value) },
          },
        }
      : undefined;
    const structuredQuery: any = { from };
    if (where) structuredQuery.where = where;
    if (filters.limit) structuredQuery.limit = filters.limit;
    return structuredQuery;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Qdrant
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Qdrant adapter for vector similarity search and collection management.
 * Uses QDRANT_URL and QDRANT_API_KEY.
 */
export class QdrantAdapter {
  private url: string;
  private headers: Record<string, string>;

  constructor(url?: string, apiKey?: string) {
    this.url = (url || process.env.QDRANT_URL || 'http://localhost:6333').replace(/\/+$/, '');
    const key = apiKey || process.env.QDRANT_API_KEY || '';
    this.headers = { 'Content-Type': 'application/json' };
    if (key) this.headers['api-key'] = key;
  }

  /** Search for similar vectors in a collection */
  async search(collection: string, vector: number[], limit: number = 10): Promise<any> {
    try {
      const response = await axios.post(
        `${this.url}/collections/${collection}/points/search`,
        { vector, limit, with_payload: true },
        { headers: this.headers }
      );
      return { success: true, data: response.data.result || [] };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.status?.description || error.message };
    }
  }

  /** Upsert (create or update) points in a collection */
  async upsert(collection: string, points: any[]): Promise<void> {
    try {
      await axios.put(
        `${this.url}/collections/${collection}/points`,
        { points },
        { headers: this.headers }
      );
    } catch (error: any) {
      throw new Error(`Qdrant upsert failed: ${error.response?.data?.status?.description || error.message}`);
    }
  }

  /** List all collections */
  async listCollections(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.url}/collections`, { headers: this.headers });
      return (response.data.result?.collections || []).map((c: any) => c.name);
    } catch {
      return [];
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Couchbase
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Couchbase adapter using the REST API for N1QL queries.
 * Uses COUCHBASE_URL and COUCHBASE_USERNAME / COUCHBASE_PASSWORD.
 */
export class CouchbaseAdapter {
  private url: string;
  private auth: string;

  constructor() {
    this.url = (process.env.COUCHBASE_URL || 'http://localhost:8091').replace(/\/+$/, '');
    const user = process.env.COUCHBASE_USERNAME || 'Administrator';
    const pass = process.env.COUCHBASE_PASSWORD || 'password';
    this.auth = Buffer.from(`${user}:${pass}`).toString('base64');
  }

  /** Execute a N1QL query */
  async query(sql: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.url}/query/service`,
        { statement: sql },
        { headers: { Authorization: `Basic ${this.auth}`, 'Content-Type': 'application/json' } }
      );
      return { success: true, data: response.data.results || [], metrics: response.data.metrics };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.errors?.[0]?.msg || error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Memgraph (Neo4j-compatible graph database)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Memgraph adapter using cypher-shell or mgconsole for graph queries.
 * Uses MEMGRAPH_URI, MEMGRAPH_USER, MEMGRAPH_PASSWORD.
 */
export class MemgraphAdapter {
  private uri: string;

  constructor() {
    this.uri = process.env.MEMGRAPH_URI || process.env.MEMGRAPH_URL || 'bolt://localhost:7687';
  }

  /** Execute a Cypher query */
  async query(cypher: string): Promise<any> {
    try {
      const cmd = `echo "${cypher.replace(/"/g, '\\"')}" | mgconsole`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
      return { success: true, data: out };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TiDB (MySQL-compatible distributed database)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TiDB adapter using the MySQL protocol (compatible with MySQLAdapter).
 * Uses TIDB_HOST, TIDB_PORT, TIDB_USER, TIDB_PASSWORD, TIDB_DATABASE.
 */
export class TiDBAdapter {
  private config: { host: string; port: number; user: string; password: string; database: string };

  constructor() {
    this.config = {
      host: process.env.TIDB_HOST || 'localhost',
      port: parseInt(process.env.TIDB_PORT || '4000', 10),
      user: process.env.TIDB_USER || 'root',
      password: process.env.TIDB_PASSWORD || '',
      database: process.env.TIDB_DATABASE || 'test',
    };
  }

  /** Execute a SQL query via mysql CLI (TiDB is MySQL-compatible) */
  async query(sql: string): Promise<any> {
    try {
      const cmd = `mysql -h ${this.config.host} -P ${this.config.port} -u ${this.config.user} -p"${this.config.password}" ${this.config.database} -e "${sql.replace(/"/g, '\\"')}"`;
      const out = execSync(cmd, { timeout: 15000, encoding: 'utf-8' }).trim();
      if (!out) return { success: true, data: [] };
      const lines = out.split('\n');
      const headers = lines[0].split('\t');
      return { success: true, data: lines.slice(1).map((line) => {
        const vals = line.split('\t');
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h.trim()] = (vals[i] || '').trim(); });
        return row;
      })};
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Chroma (Vector database)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Chroma adapter for embedding-based vector similarity search.
 * Uses CHROMA_URL or defaults to http://localhost:8000.
 */
export class ChromaAdapter {
  private url: string;

  constructor() {
    this.url = (process.env.CHROMA_URL || 'http://localhost:8000').replace(/\/+$/, '');
  }

  /** List all collections */
  async listCollections(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.url}/api/v1/collections`);
      return (response.data || []).map((c: any) => c.name || c.id);
    } catch {
      return [];
    }
  }

  /** Query a collection with an embedding vector */
  async query(collection: string, queryEmbeddings: number[], nResults: number = 10): Promise<any> {
    try {
      const response = await axios.post(
        `${this.url}/api/v1/collections/${collection}/query`,
        { query_embeddings: [queryEmbeddings], n_results: nResults, include: ['documents', 'metadatas', 'distances'] }
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || error.message };
    }
  }

  /** Add embeddings to a collection */
  async add(collection: string, ids: string[], embeddings: number[][], metadatas?: any[], documents?: string[]): Promise<void> {
    try {
      await axios.post(`${this.url}/api/v1/collections/${collection}/add`, {
        ids, embeddings, metadatas, documents,
      });
    } catch (error: any) {
      throw new Error(`Chroma add failed: ${error.response?.data?.error || error.message}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Confluent / Kafka (Schema Registry)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Confluent Kafka adapter using the REST Proxy and Schema Registry APIs.
 * Uses KAFKA_REST_URL, SCHEMA_REGISTRY_URL, KAFKA_API_KEY, KAFKA_API_SECRET.
 */
export class ConfluentKafkaAdapter {
  private restUrl: string;
  private schemaUrl: string;
  private auth: string;

  constructor() {
    this.restUrl = (process.env.KAFKA_REST_URL || 'http://localhost:8082').replace(/\/+$/, '');
    this.schemaUrl = (process.env.SCHEMA_REGISTRY_URL || 'http://localhost:8081').replace(/\/+$/, '');
    const key = process.env.KAFKA_API_KEY || '';
    const secret = process.env.KAFKA_API_SECRET || '';
    this.auth = key && secret ? Buffer.from(`${key}:${secret}`).toString('base64') : '';
  }

  /** List topics via REST Proxy */
  async listTopics(): Promise<string[]> {
    try {
      const headers: Record<string, string> = {};
      if (this.auth) headers['Authorization'] = `Basic ${this.auth}`;
      const response = await axios.get(`${this.restUrl}/v3/clusters`, { headers });
      const clusterId = response.data.data?.[0]?.cluster_id;
      if (!clusterId) return [];
      const topicsRes = await axios.get(`${this.restUrl}/v3/clusters/${clusterId}/topics`, { headers });
      return (topicsRes.data.data || []).map((t: any) => t.topic_name);
    } catch {
      return [];
    }
  }

  /** Get all schemas from Schema Registry */
  async listSubjects(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.schemaUrl}/subjects`);
      return response.data || [];
    } catch {
      return [];
    }
  }

  /** Get the latest schema for a subject */
  async getSchema(subject: string): Promise<any> {
    try {
      const response = await axios.get(`${this.schemaUrl}/subjects/${subject}/versions/latest`);
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Weaviate (AI-native vector database)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Weaviate adapter for AI-powered vector search and object management.
 * Uses WEAVIATE_URL and WEAVIATE_API_KEY.
 */
export class WeaviateAdapter {
  private url: string;
  private headers: Record<string, string>;

  constructor() {
    this.url = (process.env.WEAVIATE_URL || 'http://localhost:8080').replace(/\/+$/, '');
    this.headers = { 'Content-Type': 'application/json' };
    const key = process.env.WEAVIATE_API_KEY || '';
    if (key) this.headers['Authorization'] = `Bearer ${key}`;
  }

  /** List all classes (collections) */
  async listCollections(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.url}/v1/schema`, { headers: this.headers });
      return (response.data.classes || []).map((c: any) => c.class);
    } catch {
      return [];
    }
  }

  /** Search objects with a GraphQL-like query vector */
  async search(className: string, vector: number[], limit: number = 10): Promise<any> {
    try {
      const response = await axios.get(
        `${this.url}/v1/objects`,
        {
          headers: this.headers,
          params: { class: className, limit, vector: vector.join(',') },
        }
      );
      return { success: true, data: response.data.objects || [] };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || error.message };
    }
  }

  /** Create a new object */
  async createObject(className: string, properties: any): Promise<any> {
    try {
      const response = await axios.post(
        `${this.url}/v1/objects`,
        { class: className, properties },
        { headers: this.headers }
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.error || error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DolphinDB (Time-series database)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DolphinDB adapter for high-performance time-series analytics.
 * Uses DOLPHINDB_URL and DOLPHINDB_USER / DOLPHINDB_PASSWORD.
 */
export class DolphinDBAdapter {
  private url: string;
  private auth: string;

  constructor() {
    this.url = (process.env.DOLPHINDB_URL || 'http://localhost:8848').replace(/\/+$/, '');
    const user = process.env.DOLPHINDB_USER || 'admin';
    const pass = process.env.DOLPHINDB_PASSWORD || '123456';
    this.auth = Buffer.from(`${user}:${pass}`).toString('base64');
  }

  /** Execute a DolphinDB script */
  async query(script: string): Promise<any> {
    try {
      const response = await axios.post(
        `${this.url}/run`,
        `login("${process.env.DOLPHINDB_USER || 'admin'}","${process.env.DOLPHINDB_PASSWORD || '123456'}");\n${script}`,
        {
          headers: {
            Authorization: `Basic ${this.auth}`,
            'Content-Type': 'text/plain',
          },
        }
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data || error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Convex (Realtime backend database)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convex adapter for the Convex realtime backend platform.
 * Uses CONVEX_SITE_URL and CONVEX_ADMIN_KEY.
 */
export class ConvexAdapter {
  private siteUrl: string;
  private adminKey: string;

  constructor() {
    this.siteUrl = (process.env.CONVEX_SITE_URL || '').replace(/\/+$/, '');
    this.adminKey = process.env.CONVEX_ADMIN_KEY || '';
  }

  /** Execute a Convex query via the HTTP API */
  async query(tableName: string, args: any = {}): Promise<any> {
    try {
      const response = await axios.post(
        `${this.siteUrl}/api/query`,
        { path: `${tableName}:list`, args },
        {
          headers: { 'Content-Type': 'application/json', Authorization: `Convex ${this.adminKey}` },
        }
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }

  /** Mutate (insert/update) a document via the HTTP API */
  async mutate(mutationName: string, args: any): Promise<any> {
    try {
      const response = await axios.post(
        `${this.siteUrl}/api/mutation`,
        { path: mutationName, args },
        {
          headers: { 'Content-Type': 'application/json', Authorization: `Convex ${this.adminKey}` },
        }
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VikingDB (ByteDance Vector Database)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * VikingDB adapter for ByteDance's managed vector database service.
 * Uses VIKINGDB_HOST, VIKINGDB_ACCESS_KEY, VIKINGDB_SECRET_KEY.
 */
export class VikingDBAdapter {
  private host: string;
  private headers: Record<string, string>;

  constructor() {
    this.host = (process.env.VIKINGDB_HOST || '').replace(/\/+$/, '');
    const ak = process.env.VIKINGDB_ACCESS_KEY || '';
    const sk = process.env.VIKINGDB_SECRET_KEY || '';
    this.headers = { 'Content-Type': 'application/json' };
    if (ak && sk) this.headers['Authorization'] = `Bearer ${Buffer.from(`${ak}:${sk}`).toString('base64')}`;
  }

  /** List all collections */
  async listCollections(): Promise<string[]> {
    try {
      const response = await axios.post(`${this.host}/collection/list`, {}, { headers: this.headers });
      return (response.data.data?.collections || []).map((c: any) => c.collection_name);
    } catch {
      return [];
    }
  }

  /** Search vectors in a collection */
  async search(collection: string, vector: number[], limit: number = 10): Promise<any> {
    try {
      const response = await axios.post(
        `${this.host}/collection/${collection}/vector/search`,
        { vector, limit, recall: true },
        { headers: this.headers }
      );
      return { success: true, data: response.data.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.message || error.message };
    }
  }
}
