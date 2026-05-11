/**
 * @aenews/mcp - Universal MCP Catalog
 * Master catalog of ALL community MCP servers organized by category.
 * Each entry provides metadata for discovery, connection, and configuration.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type MCPCategory =
  | 'database'
  | 'cloud'
  | 'browser'
  | 'communication'
  | 'code'
  | 'cli'
  | 'search'
  | 'multimedia'
  | 'art'
  | 'tools'
  | 'monitoring'
  | 'data'
  | 'file'
  | 'aggregator'
  | 'translation'
  | 'social'
  | 'security';

export type MCPTransport = 'stdio' | 'sse' | 'builtin';
export type MCPOrigin = 'npm' | 'github' | 'builtin';
export type MCPStatus = 'active' | 'beta' | 'experimental';

export interface MCPCatalogEntry {
  /** kebab-case unique identifier */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Semantic version, defaults to '1.0.0' */
  version: string;
  /** npm/github author or org */
  author: string;
  /** Functional category */
  category: MCPCategory;
  /** Short description of capabilities */
  description: string;
  /** Where and how to obtain / connect to the server */
  source: {
    type: MCPOrigin;
    /** npm package name OR github org/repo */
    package: string;
    transport: MCPTransport;
  };
  /** Permission tags required by this server */
  permissions: string[];
  /** Environment variables the server expects at runtime */
  envVars: string[];
  /** Free-text searchable keywords */
  tags: string[];
  /** Release maturity */
  status: MCPStatus;
}

// ─── Category Constants ────────────────────────────────────────────────────

export const MCP_CATEGORIES: Record<MCPCategory, string> = {
  database:      'Database & Storage',
  cloud:         'Cloud & Infrastructure',
  browser:       'Browser & Automation',
  communication: 'Communication & Messaging',
  code:          'Code & Execution',
  cli:           'CLI & Terminal',
  search:        'Search & Extraction',
  multimedia:    'Multimedia & Processing',
  art:           'Art & Culture',
  tools:         'Tools & Integration',
  monitoring:    'Monitoring & Observability',
  data:          'Data & Customer',
  file:          'File & Storage',
  aggregator:    'Aggregator & Proxy',
  translation:   'Translation & Language',
  social:        'Social & Media',
  security:      'Security',
} as const;

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Shorthand factory — reduces boilerplate when listing hundreds of entries.
 */
function entry(
  id: string,
  name: string,
  author: string,
  category: MCPCategory,
  description: string,
  pkg: string,
  opts: Partial<{
    version: string;
    origin: MCPOrigin;
    transport: MCPTransport;
    permissions: string[];
    envVars: string[];
    tags: string[];
    status: MCPStatus;
  }> = {},
): MCPCatalogEntry {
  return {
    id,
    name,
    version: opts.version ?? '1.0.0',
    author,
    category,
    description,
    source: {
      type: opts.origin ?? 'github',
      package: pkg,
      transport: opts.transport ?? 'stdio',
    },
    permissions: opts.permissions ?? ['network:access'],
    envVars: opts.envVars ?? [],
    tags: opts.tags ?? [category],
    status: opts.status ?? 'active',
  };
}

// ─── CATALOG DATA ──────────────────────────────────────────────────────────

/**
 * Complete community MCP server catalog.
 * Organised by category for readability; flat array for programmatic use.
 */
export const mcpCatalog: MCPCatalogEntry[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // DATABASE & STORAGE
  // ═══════════════════════════════════════════════════════════════════════
  entry('anyquery', 'AnyQuery', 'julien040', 'database',
    'Query 40+ applications using SQL via PostgreSQL/MySQL/SQLite interfaces',
    'julien040/anyquery', {
      tags: ['sql', 'universal', 'query', 'multi-app'],
      envVars: [],
    }),

  entry('mindsdb', 'MindsDB', 'mindsdb', 'database',
    'Connect and unify data across platforms with AI-augmented queries',
    'mindsdb/mindsdb', {
      tags: ['ai', 'unified-data', 'federated'],
      envVars: ['MINDSDB_HOST', 'MINDSDB_PORT', 'MINDSDB_API_KEY'],
    }),

  entry('waystation-mcp', 'Waystation AI', 'waystation-ai', 'database',
    'Connect to Notion, Slack, Monday.com, Airtable and more via a unified MCP',
    'waystation-ai/mcp', {
      tags: ['notion', 'slack', 'monday', 'airtable', 'unified'],
      envVars: ['WAYSTATION_API_KEY'],
    }),

  entry('aiven', 'Aiven', 'Aiven-Open', 'database',
    'Manage PostgreSQL, Kafka, ClickHouse, and OpenSearch on Aiven',
    'Aiven-Open/mcp-aiven', {
      tags: ['postgresql', 'kafka', 'clickhouse', 'opensearch', 'managed'],
      envVars: ['AIVEN_TOKEN', 'AIVEN_PROJECT'],
    }),

  entry('supabase-community', 'Supabase (Community)', 'alexander-zuev', 'database',
    'Community Supabase MCP — database queries, auth, storage, and edge functions',
    'supabase-community/mcp-server-supabase', {
      tags: ['supabase', 'postgresql', 'auth', 'storage', 'realtime'],
      envVars: ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_ACCESS_TOKEN'],
    }),

  entry('mysql-community', 'MySQL (Community)', 'benborla', 'database',
    'Community MySQL integration for querying and managing MySQL databases',
    'benborla/mcp-server-mysql', {
      tags: ['mysql', 'relational', 'sql'],
      envVars: ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE'],
    }),

  entry('dbhub', 'DBHub', 'bytebase', 'database',
    'Universal database MCP server supporting multiple database engines',
    'bytebase/dbhub', {
      tags: ['universal', 'multi-database', 'migration'],
      envVars: ['DBHUB_DATABASE_URL'],
    }),

  entry('tidb', 'TiDB', 'c4pt0r', 'database',
    'TiDB distributed SQL database management and queries',
    'c4pt0r/tidb-mcp', {
      tags: ['tidb', 'distributed-sql', 'mysql-compatible'],
      envVars: ['TIDB_HOST', 'TIDB_PORT', 'TIDB_USER', 'TIDB_PASSWORD'],
    }),

  entry('centralmind-gateway', 'CentralMind Gateway', 'centralmind', 'database',
    'PostgreSQL, ClickHouse, MySQL, Snowflake, BigQuery unified gateway',
    'centralmind/gateway', {
      tags: ['multi-database', 'gateway', 'data-warehouse', 'bigquery', 'snowflake'],
      envVars: ['CM_GATEWAY_URL', 'CM_GATEWAY_KEY'],
    }),

  entry('chroma', 'Chroma', 'chroma-core', 'database',
    'Chroma vector store — embedding storage and similarity search',
    'chroma-core/chroma-mcp', {
      tags: ['vector-store', 'embeddings', 'similarity-search', 'ai'],
      envVars: ['CHROMA_HOST', 'CHROMA_PORT', 'CHROMA_COLLECTION'],
    }),

  entry('clickhouse', 'ClickHouse', 'ClickHouse', 'database',
    'ClickHouse analytical database — fast OLAP queries and management',
    'ClickHouse/mcp-clickhouse', {
      tags: ['clickhouse', 'olap', 'analytics', 'columnar'],
      envVars: ['CLICKHOUSE_HOST', 'CLICKHOUSE_PORT', 'CLICKHOUSE_USER', 'CLICKHOUSE_PASSWORD'],
    }),

  entry('confluent', 'Confluent', 'confluentinc', 'database',
    'Confluent Kafka — manage topics, produce and consume messages',
    'confluentinc/mcp-confluent', {
      tags: ['kafka', 'streaming', 'event-streaming', 'confluent'],
      envVars: ['CONFLUENT_BOOTSTRAP_SERVERS', 'CONFLUENT_API_KEY', 'CONFLUENT_API_SECRET'],
    }),

  entry('couchbase', 'Couchbase', 'Couchbase-Ecosystem', 'database',
    'Couchbase NoSQL document database — N1QL queries and bucket management',
    'couchbase-ecosystem/mcp-server-couchbase', {
      tags: ['couchbase', 'nosql', 'n1ql', 'document-store'],
      envVars: ['COUCHBASE_CONNECTION_STRING', 'COUCHBASE_USERNAME', 'COUCHBASE_PASSWORD', 'COUCHBASE_BUCKET'],
    }),

  entry('elasticsearch', 'Elasticsearch', 'cr7258', 'database',
    'Elasticsearch — full-text search, indexing, and analytics queries',
    'cr7258/mcp-elasticsearch', {
      tags: ['elasticsearch', 'search', 'indexing', 'analytics'],
      envVars: ['ES_HOST', 'ES_PORT', 'ES_USERNAME', 'ES_PASSWORD'],
    }),

  entry('postgres-devops', 'PostgreSQL (crystaldba)', 'crystaldba', 'database',
    'PostgreSQL developer and ops tooling — queries, schema introspection, monitoring',
    'crystaldba/postgres-mcp', {
      tags: ['postgresql', 'postgres', 'devops', 'sql', 'schema'],
      envVars: ['POSTGRES_HOST', 'POSTGRES_PORT', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_DATABASE'],
    }),

  entry('trino', 'Trino', 'Dataring-engineering', 'database',
    'Trino distributed SQL query engine — federated queries across data sources',
    'Dataring-engineering/trino-mcp', {
      tags: ['trino', 'presto', 'federated', 'distributed-sql'],
      envVars: ['TRINO_HOST', 'TRINO_PORT', 'TRINO_USER', 'TRINO_CATALOG', 'TRINO_SCHEMA'],
    }),

  entry('airtable', 'Airtable', 'domdomegg', 'database',
    'Airtable — read/write records, manage bases, tables, and views',
    'domdomegg/mcp-server-airtable', {
      tags: ['airtable', 'spreadsheet', 'no-code', 'database'],
      envVars: ['AIRTABLE_PERSONAL_ACCESS_TOKEN', 'AIRTABLE_BASE_ID'],
    }),

  entry('nocodb', 'NocoDB', 'edwinbernadus', 'database',
    'NocoDB — open-source Airtable alternative, manage tables and records',
    'edwinbernadus/mcp-nocodb', {
      tags: ['nocodb', 'spreadsheet', 'no-code', 'open-source'],
      envVars: ['NOCODB_URL', 'NOCODB_API_TOKEN'],
    }),

  entry('bigquery', 'BigQuery', 'ergut', 'database',
    'Google BigQuery — run analytics queries, manage datasets and tables',
    'ergut/mcp-server-bigquery', {
      tags: ['bigquery', 'google-cloud', 'data-warehouse', 'analytics'],
      envVars: ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS'],
    }),

  entry('fireproof', 'Fireproof', 'fireproof-storage', 'database',
    'Fireproof ledger database — immutable, CRDT-based local-first storage',
    'fireproof-storage/mcp-fireproof', {
      tags: ['fireproof', 'crdt', 'ledger', 'local-first', 'immutable'],
      envVars: [],
    }),

  entry('db-mcp-server', 'DB MCP Server (FreePeak)', 'FreePeak', 'database',
    'Multi-database MCP server supporting MySQL and PostgreSQL',
    'FreePeak/db-mcp-server', {
      tags: ['multi-database', 'mysql', 'postgresql', 'universal'],
      envVars: ['DB_CONNECTION_STRING'],
    }),

  entry('mongodb', 'MongoDB', 'furey', 'database',
    'MongoDB — CRUD operations, aggregation pipelines, index management',
    'furey/mcp-server-mongodb', {
      tags: ['mongodb', 'nosql', 'document', 'aggregation'],
      envVars: ['MONGODB_URI', 'MONGODB_DATABASE'],
    }),

  entry('firebase', 'Firebase', 'gannonh', 'database',
    'Firebase — Auth, Firestore, Cloud Storage management',
    'gannonh/firebase-mcp', {
      tags: ['firebase', 'auth', 'firestore', 'cloud-storage', 'google'],
      envVars: ['FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL'],
    }),

  entry('convex', 'Convex', 'get-convex', 'database',
    'Convex database — queries, mutations, and real-time subscriptions',
    'get-convex/mcp-convex', {
      tags: ['convex', 'realtime', 'serverless', 'database'],
      envVars: ['CONVEX_DEPLOYMENT', 'CONVEX_ADMIN_KEY'],
    }),

  entry('genai-toolbox', 'GenAI Toolbox', 'googleapis', 'database',
    'Google GenAI Toolbox — database tools for AI workflows',
    'googleapis/genai-toolbox', {
      tags: ['google', 'ai', 'toolbox', 'database'],
      envVars: ['GOOGLE_CLOUD_PROJECT', 'GOOGLE_APPLICATION_CREDENTIALS'],
    }),

  entry('greptimedb', 'GreptimeDB', 'GreptimeTeam', 'database',
    'GreptimeDB — time-series database with SQL and PromQL support',
    'GreptimeTeam/greptimedb-mcp', {
      tags: ['greptimedb', 'time-series', 'sql', 'promql'],
      envVars: ['GREPTIMEDB_HOST', 'GREPTIMEDB_PORT', 'GREPTIMEDB_USERNAME', 'GREPTIMEDB_PASSWORD'],
    }),

  entry('sqlite', 'SQLite', 'hannesrudolph', 'database',
    'SQLite — local database queries, schema management, and data operations',
    'hannesrudolph/mcp-server-sqlite', {
      tags: ['sqlite', 'local', 'embedded', 'sql'],
      envVars: ['SQLITE_DB_PATH'],
    }),

  entry('influxdb', 'InfluxDB', 'idoru', 'database',
    'InfluxDB — time-series data ingestion and Flux/InfluxQL queries',
    'idoru/mcp-server-influxdb', {
      tags: ['influxdb', 'time-series', 'flux', 'monitoring'],
      envVars: ['INFLUXDB_URL', 'INFLUXDB_TOKEN', 'INFLUXDB_ORG', 'INFLUXDB_BUCKET'],
    }),

  entry('snowflake', 'Snowflake', 'isaacwasserman', 'database',
    'Snowflake — data warehouse queries, warehouse and schema management',
    'isaacwasserman/mcp-server-snowflake', {
      tags: ['snowflake', 'data-warehouse', 'sql', 'analytics'],
      envVars: ['SNOWFLAKE_ACCOUNT', 'SNOWFLAKE_USER', 'SNOWFLAKE_PASSWORD', 'SNOWFLAKE_WAREHOUSE', 'SNOWFLAKE_DATABASE', 'SNOWFLAKE_SCHEMA'],
    }),

  entry('kafka-timeplus', 'Kafka / Timeplus', 'jovezhong', 'database',
    'Apache Kafka — produce/consume messages, manage topics and consumer groups',
    'jovezhong/kafka-mcp-server', {
      tags: ['kafka', 'streaming', 'messaging', 'events'],
      envVars: ['KAFKA_BOOTSTRAP_SERVERS', 'KAFKA_SASL_USERNAME', 'KAFKA_SASL_PASSWORD'],
    }),

  entry('vikingdb', 'VikingDB', 'KashiwaByte', 'database',
    'VikingDB — vector store and similarity search engine',
    'KashiwaByte/mcp-vikingdb', {
      tags: ['vector-store', 'similarity-search', 'embeddings'],
      envVars: ['VIKINGDB_HOST', 'VIKINGDB_API_KEY'],
    }),

  entry('duckdb', 'DuckDB', 'ktanaka101', 'database',
    'DuckDB — in-process analytical database for fast OLAP queries',
    'ktanaka101/mcp-server-duckdb', {
      tags: ['duckdb', 'olap', 'analytics', 'embedded', 'sql'],
      envVars: [],
    }),

  entry('jdbc', 'JDBC', 'quarkiverse', 'database',
    'JDBC universal adapter — connect to any JDBC-compatible database',
    'quarkiverse/quarkus-mcp-server-jdbc', {
      tags: ['jdbc', 'universal', 'java', 'database'],
      envVars: ['JDBC_URL', 'JDBC_USERNAME', 'JDBC_PASSWORD', 'JDBC_DRIVER'],
    }),

  entry('memgraph', 'Memgraph', 'memgraph', 'database',
    'Memgraph — graph database for real-time graph analytics with Cypher queries',
    'memgraph/mcp-server-memgraph', {
      tags: ['memgraph', 'graph-database', 'cypher', 'analytics'],
      envVars: ['MEMGRAPH_HOST', 'MEMGRAPH_PORT', 'MEMGRAPH_USERNAME', 'MEMGRAPH_PASSWORD'],
    }),

  entry('neo4j', 'Neo4j', 'neo4j-contrib', 'database',
    'Neo4j — knowledge graph queries, node/relationship management via Cypher',
    'neo4j-contrib/mcp-neo4j', {
      tags: ['neo4j', 'graph-database', 'knowledge-graph', 'cypher'],
      envVars: ['NEO4J_URI', 'NEO4J_USER', 'NEO4J_PASSWORD'],
    }),

  entry('neon', 'Neon', 'neondatabase', 'database',
    'Neon Serverless Postgres — branching, scale-to-zero, serverless queries',
    'neondatabase/mcp-server-neon', {
      tags: ['neon', 'serverless', 'postgresql', 'branching'],
      envVars: ['NEON_CONNECTION_STRING', 'NEON_API_KEY'],
    }),

  entry('nile', 'Nile', 'niledatabase', 'database',
    'Nile — multi-tenant Postgres with virtual tenant isolation',
    'niledatabase/mcp-server-nile', {
      tags: ['nile', 'multi-tenant', 'postgresql', 'saas'],
      envVars: ['NILE_DB_URL', 'NILE_WORKSPACE', 'NILE_TOKEN'],
    }),

  entry('odbc', 'ODBC', 'OpenLinkSoftware', 'database',
    'Generic DBMS connectivity via ODBC — connect to any ODBC data source',
    'OpenLinkSoftware/mcp-server-odbc', {
      tags: ['odbc', 'generic', 'database', 'universal'],
      envVars: ['ODBC_CONNECTION_STRING', 'ODBC_USERNAME', 'ODBC_PASSWORD'],
    }),

  entry('sqlalchemy', 'SQLAlchemy', 'OpenLinkSoftware', 'database',
    'Universal SQLAlchemy database adapter — connect to any SQLAlchemy-supported DB',
    'OpenLinkSoftware/mcp-server-sqlalchemy', {
      tags: ['sqlalchemy', 'universal', 'python', 'orm'],
      envVars: ['SQLALCHEMY_DATABASE_URL'],
    }),

  entry('azure-data-explorer', 'Azure Data Explorer', 'pab1it0', 'database',
    'Azure Data Explorer (Kusto) — run KQL queries, manage clusters',
    'pab1it0/mcp-server-azure-data-explorer', {
      tags: ['azure', 'kusto', 'adx', 'analytics', 'time-series'],
      envVars: ['AZURE_ADX_CLUSTER', 'AZURE_ADX_DATABASE', 'AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'],
    }),

  entry('prisma', 'Prisma', 'prisma', 'database',
    'Prisma — database ORM operations, schema management, and migrations',
    'prisma/mcp-server-prisma', {
      tags: ['prisma', 'orm', 'postgresql', 'schema', 'migrations'],
      envVars: ['DATABASE_URL'],
    }),

  entry('qdrant', 'Qdrant', 'qdrant', 'database',
    'Qdrant — high-performance vector similarity search and storage',
    'qdrant/mcp-server-qdrant', {
      tags: ['qdrant', 'vector-store', 'similarity-search', 'embeddings'],
      envVars: ['QDRANT_URL', 'QDRANT_API_KEY'],
    }),

  entry('redis', 'Redis', 'redis', 'database',
    'Redis — key-value operations, caching, pub/sub, and data structures',
    'redis/mcp-redis', {
      tags: ['redis', 'key-value', 'cache', 'pub-sub'],
      envVars: ['REDIS_URL', 'REDIS_PASSWORD'],
    }),

  entry('mcp-alchemy', 'MCP Alchemy', 'runekaagaard', 'database',
    'Universal SQL database adapter — PostgreSQL, MySQL, MariaDB, SQLite, Oracle, MS SQL',
    'runekaagaard/mcp-alchemy', {
      tags: ['universal', 'sql', 'multi-database', 'alchemy'],
      envVars: ['DATABASE_URL'],
    }),

  entry('skysql', 'SkySQL', 'skysqlinc', 'database',
    'SkySQL — MariaDB Cloud database management and queries',
    'skysqlinc/mcp-server-skysql', {
      tags: ['mariadb', 'skysql', 'cloud-database', 'sql'],
      envVars: ['SKYSQL_HOST', 'SKYSQL_PORT', 'SKYSQL_USER', 'SKYSQL_PASSWORD'],
    }),

  entry('supabase-official', 'Supabase (Official)', 'supabase-community', 'database',
    'Official Supabase MCP server — database, auth, storage, and edge functions',
    'supabase-community/mcp-server-supabase-official', {
      tags: ['supabase', 'official', 'postgresql', 'auth', 'storage'],
      envVars: ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_ID'],
    }),

  entry('legion', 'Legion', 'TheRaLabs', 'database',
    'Legion — multi-type database adapter (PostgreSQL, Redshift, MySQL, BigQuery, Oracle, SQLite)',
    'TheRaLabs/legion-mcp', {
      tags: ['multi-database', 'postgresql', 'redshift', 'mysql', 'bigquery', 'oracle'],
      envVars: ['LEGION_CONNECTION_URL'],
    }),

  entry('dolphindb', 'DolphinDB', 'tradercjz', 'database',
    'DolphinDB — high-performance time-series and analytics database',
    'tradercjz/mcp-server-dolphindb', {
      tags: ['dolphindb', 'time-series', 'analytics', 'finance'],
      envVars: ['DOLPHINDB_HOST', 'DOLPHINDB_PORT', 'DOLPHINDB_USER', 'DOLPHINDB_PASSWORD'],
    }),

  entry('weaviate', 'Weaviate', 'weaviate', 'database',
    'Weaviate — vector search, object storage, GraphQL queries, and chat memory',
    'weaviate/mcp-server-weaviate', {
      tags: ['weaviate', 'vector-store', 'search', 'graphql', 'ai', 'memory'],
      envVars: ['WEAVIATE_URL', 'WEAVIATE_API_KEY'],
    }),

  entry('xiyan', 'Xiyan', 'XGenerationLab', 'database',
    'Xiyan — Text-to-SQL using LLM, natural language database queries',
    'XGenerationLab/xiyan-mcp', {
      tags: ['text-to-sql', 'llm', 'natural-language', 'ai'],
      envVars: ['XIYAN_DATABASE_URL', 'XIYAN_LLM_API_KEY'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // CLOUD & INFRASTRUCTURE
  // ═══════════════════════════════════════════════════════════════════════
  entry('aws', 'AWS', 'awslabs', 'cloud',
    'AWS services — manage EC2, S3, Lambda, IAM, and more via AWS SDK',
    'awslabs/mcp', {
      tags: ['aws', 'ec2', 's3', 'lambda', 'iam', 'cloud'],
      envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    }),

  entry('qiniu', 'Qiniu Cloud Storage', 'qiniu', 'cloud',
    'Qiniu Cloud Storage — upload, download, and manage objects',
    'qiniu/mcp-qiniu', {
      tags: ['qiniu', 'cloud-storage', 'cdn', 'object-storage'],
      envVars: ['QINIU_ACCESS_KEY', 'QINIU_SECRET_KEY', 'QINIU_BUCKET'],
    }),

  entry('ipfs', 'IPFS', 'alexbakers', 'cloud',
    'IPFS — decentralized file storage, pinning, and retrieval',
    'alexbakers/mcp-ipfs', {
      tags: ['ipfs', 'decentralized', 'p2p', 'storage'],
      envVars: ['IPFS_API_URL', 'IPFS_GATEWAY_URL'],
    }),

  entry('k8s', 'Kubernetes', 'reza-gholizade', 'cloud',
    'Kubernetes — manage pods, deployments, services, and cluster resources',
    'reza-gholizade/mcp-k8s', {
      tags: ['kubernetes', 'k8s', 'containers', 'orchestration'],
      envVars: ['KUBECONFIG', 'KUBERNETES_NAMESPACE'],
    }),

  entry('aws-cli', 'AWS CLI', 'alexei-led', 'cloud',
    'AWS CLI commands executed in Docker — full AWS CLI surface area',
    'alexei-led/mcp-aws-cli', {
      tags: ['aws', 'cli', 'docker', 'cloud'],
      envVars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    }),

  entry('alibaba-cloud', 'Alibaba Cloud', 'aliyun', 'cloud',
    'Alibaba Cloud Ops — manage ECS, OSS, SLB, RDS, and more',
    'aliyun/alibaba-cloud-ops-mcp-server', {
      tags: ['alibaba', 'aliyun', 'ecs', 'oss', 'cloud'],
      envVars: ['ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET', 'ALIBABA_CLOUD_REGION_ID'],
    }),

  entry('vmware-esxi', 'VMware ESXi', 'bright8192', 'cloud',
    'VMware ESXi / vCenter — manage VMs, hosts, and datastores',
    'bright8192/mcp-vmware-esxi', {
      tags: ['vmware', 'esxi', 'vcenter', 'virtualization'],
      envVars: ['VMWARE_HOST', 'VMWARE_USER', 'VMWARE_PASSWORD'],
    }),

  entry('cloudflare', 'Cloudflare', 'cloudflare', 'cloud',
    'Cloudflare — Workers, KV, R2, D1, Pages, and DNS management',
    'cloudflare/mcp-server-cloudflare', {
      tags: ['cloudflare', 'workers', 'kv', 'r2', 'd1', 'pages', 'dns', 'cdn'],
      envVars: ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'],
    }),

  entry('fastly', 'Fastly', 'jedisct1', 'cloud',
    'Fastly — CDN configuration, purge caches, and edge logic management',
    'jedisct1/mcp-fastly', {
      tags: ['fastly', 'cdn', 'edge', 'cache'],
      envVars: ['FASTLY_API_TOKEN', 'FASTLY_SERVICE_ID'],
    }),

  entry('azure-resource-graph', 'Azure Resource Graph', 'hardik-id', 'cloud',
    'Azure Resource Graph — query Azure resources across subscriptions with Kusto',
    'hardik-id/mcp-azure-resource-graph', {
      tags: ['azure', 'resource-graph', 'kusto', 'query'],
      envVars: ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SUBSCRIPTION_ID'],
    }),

  entry('azure-cli', 'Azure CLI', 'jdubois', 'cloud',
    'Azure CLI — run Azure CLI commands through MCP interface',
    'jdubois/mcp-azure-cli', {
      tags: ['azure', 'cli', 'cloud'],
      envVars: ['AZURE_SUBSCRIPTION_ID', 'AZURE_TENANT_ID'],
    }),

  entry('netskope', 'Netskope', 'johnneerdael', 'cloud',
    'Netskope — cloud security, CASB, and threat intelligence',
    'johnneerdael/mcp-netskope', {
      tags: ['netskope', 'security', 'casb', 'sase'],
      envVars: ['NETSKOPE_API_URL', 'NETSKOPE_API_TOKEN'],
    }),

  entry('terraform', 'Terraform', 'nwiizo', 'cloud',
    'Terraform — plan, apply, and manage infrastructure as code',
    'nwiizo/tfmcp', {
      tags: ['terraform', 'iac', 'infrastructure', 'devops'],
      envVars: ['TF_TOKEN_app_terraform_io', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
    }),

  entry('pulumi', 'Pulumi', 'pulumi', 'cloud',
    'Pulumi — manage infrastructure as code with TypeScript, Python, Go',
    'pulumi/mcp-server', {
      tags: ['pulumi', 'iac', 'infrastructure', 'devops', 'typescript'],
      envVars: ['PULUMI_ACCESS_TOKEN', 'PULUMI_STACK'],
    }),

  entry('nutanix', 'Nutanix Prism', 'thunderboltsid', 'cloud',
    'Nutanix Prism Central — manage VMs, clusters, and AHV resources',
    'thunderboltsid/mcp-nutanix', {
      tags: ['nutanix', 'prism', 'hyperconverged', 'virtualization'],
      envVars: ['NUTANIX_HOST', 'NUTANIX_USERNAME', 'NUTANIX_PASSWORD'],
    }),

  entry('aws-pricing', 'AWS Pricing', 'trilogy-group', 'cloud',
    'AWS Pricing — query EC2, RDS, S3, and other service pricing data',
    'trilogy-group/mcp-aws-pricing', {
      tags: ['aws', 'pricing', 'cost-optimization', 'ec2'],
      envVars: [],
    }),

  entry('azure-data-lake', 'Azure Data Lake', 'erikhoward', 'cloud',
    'Azure Data Lake Storage — file system operations on ADLS Gen2',
    'erikhoward/mcp-azure-data-lake', {
      tags: ['azure', 'data-lake', 'storage', 'gen2'],
      envVars: ['AZURE_STORAGE_ACCOUNT_NAME', 'AZURE_STORAGE_ACCOUNT_KEY', 'AZURE_STORAGE_CONTAINER'],
    }),

  entry('redis-cloud', 'Redis Cloud', 'redis', 'cloud',
    'Redis Cloud — managed Redis operations and subscription management',
    'redis/mcp-redis-cloud', {
      tags: ['redis', 'cloud', 'managed', 'cache'],
      envVars: ['REDIS_CLOUD_API_KEY', 'REDIS_CLOUD_SECRET_KEY'],
    }),

  entry('portainer', 'Portainer', 'portainer', 'cloud',
    'Portainer — container management across Docker and Kubernetes environments',
    'portainer/portainer-mcp', {
      tags: ['portainer', 'docker', 'kubernetes', 'containers', 'management'],
      envVars: ['PORTAINER_URL', 'PORTAINER_API_KEY'],
    }),

  entry('ycloud-whatsapp', 'YCloud WhatsApp', 'YCloud-Developers', 'cloud',
    'YCloud WhatsApp Business — send messages, manage templates and conversations',
    'YCloud-Developers/mcp-ycloud-whatsapp', {
      tags: ['whatsapp', 'business', 'messaging', 'ycloud'],
      envVars: ['YCLOUD_API_KEY'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // BROWSER & AUTOMATION
  // ═══════════════════════════════════════════════════════════════════════
  entry('grasp', 'Grasp', 'aircodelabs', 'browser',
    'Self-hosted browser with MCP + A2A protocol support',
    'aircodelabs/grasp-mcp', {
      tags: ['browser', 'self-hosted', 'a2a', 'automation'],
      envVars: ['GRASP_SERVER_URL', 'GRASP_API_KEY'],
    }),

  entry('playwright', 'Playwright', 'Automata-Labs', 'browser',
    'Playwright — browser automation, screenshots, navigation, and form filling',
    'Automata-Labs/mcp-playwright', {
      tags: ['playwright', 'browser', 'automation', 'e2e', 'testing'],
      envVars: [],
    }),

  entry('browserbase', 'Browserbase', 'browserbase', 'browser',
    'Browserbase — cloud browser automation with session management',
    'browserbase/mcp-server-browserbase', {
      tags: ['browserbase', 'cloud-browser', 'automation', 'headless'],
      envVars: ['BROWSERBASE_API_KEY', 'BROWSERBASE_PROJECT_ID'],
    }),

  entry('browsermcp', 'BrowserMCP', 'browsermcp', 'browser',
    'BrowserMCP — control local Chrome browser for web automation',
    'browsermcp/mcp', {
      tags: ['chrome', 'local-browser', 'automation'],
      envVars: [],
    }),

  entry('co-browser', 'Co-Browser', 'co-browser', 'browser',
    'browser-use with Docker + VNC — visual browser automation',
    'co-browser/mcp', {
      tags: ['browser-use', 'docker', 'vnc', 'visual', 'automation'],
      envVars: ['COBROWSER_DISPLAY', 'COBROWSER_NOVNC_PORT'],
    }),

  entry('browser-control', 'Browser Control', 'eyalzh', 'browser',
    'Firefox browser extension for remote control via MCP',
    'eyalzh/mcp-browser-control', {
      tags: ['firefox', 'extension', 'remote-control', 'browser'],
      envVars: [],
    }),

  entry('browser-kit', 'Browser Kit', 'ndthanhdev', 'browser',
    'Manifest v2 browser automation toolkit',
    'ndthanhdev/mcp-browser-kit', {
      tags: ['manifest-v2', 'browser', 'automation', 'toolkit'],
      envVars: [],
    }),

  entry('azure-playwright', 'Azure + Playwright', 'kimtth', 'browser',
    'Azure OpenAI + Playwright — AI-driven browser automation',
    'kimtth/mcp-azure-playwright', {
      tags: ['azure', 'openai', 'playwright', 'ai', 'browser'],
      envVars: ['AZURE_OPENAI_API_KEY', 'AZURE_OPENAI_ENDPOINT'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // COMMUNICATION & MESSAGING
  // ═══════════════════════════════════════════════════════════════════════
  entry('twitter', 'Twitter / X', 'adhikasp', 'communication',
    'Twitter/X — search tweets, timelines, and user profiles',
    'adhikasp/mcp-twikit', {
      tags: ['twitter', 'x', 'social-media', 'search'],
      envVars: ['TWITTER_USERNAME', 'TWITTER_PASSWORD'],
    }),

  entry('agentmail', 'AgentMail', 'agentmail-to', 'communication',
    'AgentMail — email inbox management, read and send emails',
    'agentmail-to/mcp-server', {
      tags: ['email', 'inbox', 'mail', 'smtp'],
      envVars: ['AGENTMAIL_API_KEY'],
    }),

  entry('google-tasks', 'Google Tasks', 'arpitbatra123', 'communication',
    'Google Tasks — create, read, update, and delete task lists',
    'arpitbatra123/mcp-google-tasks', {
      tags: ['google-tasks', 'todo', 'productivity', 'google'],
      envVars: ['GOOGLE_TASKS_CLIENT_ID', 'GOOGLE_TASKS_CLIENT_SECRET', 'GOOGLE_TASKS_REFRESH_TOKEN'],
    }),

  entry('imessage', 'iMessage', 'carterlasalle', 'communication',
    'iMessage — send and receive iMessages on macOS',
    'carterlasalle/mcp-imessage', {
      tags: ['imessage', 'apple', 'messaging', 'macos'],
      envVars: [],
    }),

  entry('telegram', 'Telegram', 'chaindead', 'communication',
    'Telegram — send messages, manage channels, and bot interactions',
    'chaindead/mcp-telegram', {
      tags: ['telegram', 'messaging', 'bot', 'channels'],
      envVars: ['TELEGRAM_BOT_TOKEN'],
    }),

  entry('inbox-zero', 'Inbox Zero', 'elie222', 'communication',
    'Inbox Zero — Gmail email management with AI-powered triage',
    'elie222/mcp-inbox-zero', {
      tags: ['gmail', 'email', 'inbox', 'ai', 'google'],
      envVars: ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'],
    }),

  entry('ntfy', 'Ntfy', 'gitmotion', 'communication',
    'Ntfy — send push notifications to any device',
    'gitmotion/mcp-ntfy', {
      tags: ['ntfy', 'push-notifications', 'alerting'],
      envVars: ['NTFY_URL', 'NTFY_TOKEN'],
    }),

  entry('wecom', 'WeCom', 'gotoolkits', 'communication',
    'WeCom (WeChat Work) robot — send messages and manage groups',
    'gotoolkits/mcp-wecom', {
      tags: ['wecom', 'wechat-work', 'enterprise', 'messaging'],
      envVars: ['WECOM_CORP_ID', 'WECOM_AGENT_ID', 'WECOM_SECRET'],
    }),

  entry('acp', 'ACP', 'i-am-bee', 'communication',
    'ACP ecosystem adapter — Agent Communication Protocol bridge',
    'i-am-bee/mcp-acp', {
      tags: ['acp', 'agent-communication', 'protocol', 'bridge'],
      envVars: ['ACP_ENDPOINT', 'ACP_TOKEN'],
    }),

  entry('mattermost', 'Mattermost', 'jagan-shanmugam', 'communication',
    'Mattermost — send messages, manage channels and teams',
    'jagan-shanmugam/mcp-mattermost', {
      tags: ['mattermost', 'chat', 'teams', 'messaging'],
      envVars: ['MATTERMOST_URL', 'MATTERMOST_TOKEN'],
    }),

  entry('whatsapp', 'WhatsApp', 'lharries', 'communication',
    'WhatsApp — send and receive messages via WhatsApp API',
    'lharries/mcp-whatsapp', {
      tags: ['whatsapp', 'messaging', 'meta'],
      envVars: ['WHATSAPP_API_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'],
    }),

  entry('line', 'LINE', 'line', 'communication',
    'LINE Official Account — reply messages, manage followers and rich menus',
    'line/line-bot-mcp-server', {
      tags: ['line', 'messaging', 'bot', 'japan'],
      envVars: ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET'],
    }),

  entry('gsuite', 'GSuite', 'MarkusPfundstein', 'communication',
    'GSuite — Gmail and Google Calendar management',
    'MarkusPfundstein/mcp-gsuite', {
      tags: ['gmail', 'google-calendar', 'gsuite', 'google'],
      envVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'],
    }),

  entry('bluesky', 'Bluesky', 'keturiosakys', 'communication',
    'Bluesky — post, search, and manage Bluesky social feed',
    'keturiosakys/mcp-bluesky', {
      tags: ['bluesky', 'atproto', 'social', 'decentralized'],
      envVars: ['BLUESKY_IDENTIFIER', 'BLUESKY_APP_PASSWORD'],
    }),

  entry('slack', 'Slack', 'modelcontextprotocol', 'communication',
    'Slack — send messages, list channels, manage conversations and files',
    'modelcontextprotocol/server-slack', {
      tags: ['slack', 'messaging', 'channels', 'files', 'workspace'],
      envVars: ['SLACK_BOT_TOKEN', 'SLACK_TEAM_ID'],
    }),

  entry('vrchat', 'VRChat', 'sawa-zen', 'communication',
    'VRChat — manage worlds, avatars, and interact with the VRChat API',
    'sawa-zen/mcp-vrchat', {
      tags: ['vrchat', 'vr', 'social', 'api'],
      envVars: ['VRCHAT_USERNAME', 'VRCHAT_PASSWORD'],
    }),

  entry('google-calendar', 'Google Calendar', 'takumi0706', 'communication',
    'Google Calendar — create, list, update, and delete events',
    'takumi0706/mcp-google-calendar', {
      tags: ['google-calendar', 'events', 'scheduling', 'google'],
      envVars: ['GOOGLE_CALENDAR_CLIENT_ID', 'GOOGLE_CALENDAR_CLIENT_SECRET', 'GOOGLE_CALENDAR_REFRESH_TOKEN'],
    }),

  entry('teams', 'Microsoft Teams', 'InditexTech', 'communication',
    'Microsoft Teams — send messages, manage channels and chats',
    'InditexTech/mcp-teams', {
      tags: ['teams', 'microsoft', 'messaging', 'collaboration'],
      envVars: ['TEAMS_APP_ID', 'TEAMS_APP_PASSWORD', 'TEAMS_TENANT_ID'],
    }),

  entry('ms365', 'Microsoft 365', 'softeria', 'communication',
    'Microsoft 365 — access Outlook, OneDrive, SharePoint, and more',
    'softeria/mcp-ms365', {
      tags: ['microsoft-365', 'outlook', 'onedrive', 'sharepoint', 'office'],
      envVars: ['MS365_CLIENT_ID', 'MS365_CLIENT_SECRET', 'MS365_TENANT_ID'],
    }),

  entry('didlogic', 'DIDLogic', 'UserAd', 'communication',
    'DIDLogic — SIP endpoint management and call routing',
    'UserAd/mcp-didlogic', {
      tags: ['sip', 'voip', 'telephony', 'call-routing'],
      envVars: ['DIDLOGIC_API_KEY', 'DIDLOGIC_API_SECRET'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // CODE & EXECUTION
  // ═══════════════════════════════════════════════════════════════════════
  entry('pydantic-ai', 'Pydantic AI', 'pydantic', 'code',
    'Pydantic AI — Python sandbox execution with type-safe AI tool calls',
    'pydantic/pydantic-ai', {
      tags: ['python', 'sandbox', 'ai', 'pydantic', 'type-safe'],
      envVars: ['OPENAI_API_KEY'],
    }),

  entry('yepcode', 'YepCode', 'yepcode', 'code',
    'YepCode — JS/Python sandbox for serverless script execution',
    'yepcode/mcp-server-js', {
      tags: ['yepcode', 'sandbox', 'javascript', 'python', 'serverless'],
      envVars: ['YEPCODE_API_KEY'],
    }),

  entry('openapi-mcp', 'OpenAPI-MCP', 'ckanthony', 'code',
    'OpenAPI-MCP — generate MCP tools from any OpenAPI/Swagger specification',
    'ckanthony/openapi-mcp', {
      tags: ['openapi', 'swagger', 'api', 'auto-generate', 'spec'],
      envVars: ['OPENAPI_SPEC_URL', 'OPENAPI_API_KEY'],
    }),

  entry('node-code-sandbox', 'Node Code Sandbox', 'alfonsograziano', 'code',
    'Node.js sandbox — execute JavaScript with npm package support',
    'alfonsograziano/node-code-sandbox-mcp', {
      tags: ['node', 'javascript', 'sandbox', 'npm'],
      envVars: [],
    }),

  entry('v8-sandbox', 'V8 Sandbox', 'r33drichards', 'code',
    'V8 isolated JavaScript sandbox — safe execution environment',
    'r33drichards/mcp-js', {
      tags: ['v8', 'javascript', 'sandbox', 'isolated'],
      envVars: [],
    }),

  entry('serena', 'Serena', 'oraios', 'code',
    'Serena — symbolic code operations with Language Server Protocol integration',
    'oraios/serena', {
      tags: ['language-server', 'lsp', 'code-operations', 'symbolic', 'refactoring'],
      envVars: [],
    }),

  entry('codemcp', 'CodeMCP', 'ezyang', 'code',
    'CodeMCP — read, write, and execute code with CLI access',
    'ezyang/codemcp', {
      tags: ['code', 'read-write', 'cli', 'execution'],
      envVars: [],
    }),

  entry('leetcode', 'LeetCode', 'doggybee', 'code',
    'LeetCode — fetch problems, submit solutions, and track progress',
    'doggybee/mcp-leetcode', {
      tags: ['leetcode', 'algorithms', 'coding-challenges', 'competitive'],
      envVars: ['LEETCODE_SESSION', 'LEETCODE_CSRF_TOKEN'],
    }),

  entry('vscode-mcp', 'VSCode MCP', 'juehang', 'code',
    'VSCode MCP — workspace integration, file editing, and terminal access',
    'juehang/mcp-vscode', {
      tags: ['vscode', 'ide', 'workspace', 'editor'],
      envVars: [],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // CLI & TERMINAL
  // ═══════════════════════════════════════════════════════════════════════
  entry('apple-reminders', 'Apple Reminders', 'FradSer', 'cli',
    'Apple Reminders — create, read, update, and delete reminders on macOS',
    'FradSer/mcp-apple-reminders', {
      tags: ['apple', 'reminders', 'macos', 'productivity', 'todo'],
      envVars: [],
    }),

  entry('apple-shortcuts', 'Apple Shortcuts', 'recursechat', 'cli',
    'Apple Shortcuts — trigger and manage macOS Shortcuts',
    'recursechat/mcp-apple-shortcuts', {
      tags: ['apple', 'shortcuts', 'macos', 'automation'],
      envVars: [],
    }),

  entry('iterm', 'iTerm', 'ferrislucas', 'cli',
    'iTerm — interact with iTerm terminal sessions and profiles on macOS',
    'ferrislucas/mcp-iterm', {
      tags: ['iterm', 'terminal', 'macos', 'shell'],
      envVars: [],
    }),

  entry('commands', 'Commands', 'g0t4', 'cli',
    'Commands — run shell commands and scripts with output capture',
    'g0t4/mcp-commands', {
      tags: ['shell', 'commands', 'scripts', 'execution'],
      envVars: [],
    }),

  entry('python-executor', 'Python Executor', 'maxim-saplin', 'cli',
    'Python Executor — safe Python code execution with resource limits',
    'maxim-saplin/mcp-python-executor', {
      tags: ['python', 'execution', 'sandbox', 'safe'],
      envVars: [],
    }),

  entry('cli-server', 'CLI Server', 'MladenSU', 'cli',
    'CLI Server — secure remote CLI execution via MCP',
    'MladenSU/mcp-cli-server', {
      tags: ['cli', 'remote', 'secure', 'execution'],
      envVars: ['CLI_SERVER_TOKEN'],
    }),

  entry('deepseek-terminal', 'DeepSeek Terminal', 'OthmaneBlial', 'cli',
    'DeepSeek Terminal — terminal interface optimized for DeepSeek AI',
    'OthmaneBlial/mcp-deepseek-terminal', {
      tags: ['deepseek', 'terminal', 'ai', 'cli'],
      envVars: ['DEEPSEEK_API_KEY'],
    }),

  entry('shell-server', 'Shell Server', 'tumf', 'cli',
    'Shell Server — secure shell command execution with sandboxing',
    'tumf/mcp-shell-server', {
      tags: ['shell', 'server', 'secure', 'sandbox'],
      envVars: ['SHELL_SERVER_ALLOWED_COMMANDS'],
    }),

  entry('desktopcommander', 'Desktop Commander', 'wonderwhy-er', 'cli',
    'Desktop Commander — file management, program launching, and system control Swiss army knife',
    'wonderwhy-er/DesktopCommanderMCP', {
      tags: ['desktop', 'file-manager', 'system', 'swiss-army-knife'],
      envVars: [],
    }),

  entry('nostr', 'Nostr', 'AbdelStark', 'cli',
    'Nostr — decentralized social protocol relay and event management',
    'AbdelStark/mcp-nostr', {
      tags: ['nostr', 'decentralized', 'social', 'protocol'],
      envVars: ['NOSTR_RELAY_URL', 'NOSTR_PRIVATE_KEY'],
    }),

  entry('cisco-pyats', 'Cisco pyATS', 'automateyournetwork', 'cli',
    'Cisco pyATS — network device interaction, automation, and testing',
    'automateyournetwork/mcp-cisco-pyats', {
      tags: ['cisco', 'pyats', 'network', 'automation', 'testing'],
      envVars: ['PYATS_TESTBED_FILE', 'PYATS_USERNAME', 'PYATS_PASSWORD'],
    }),

  entry('books', 'Books', 'VmLia', 'cli',
    'Books — query book information, metadata, and recommendations',
    'VmLia/mcp-books', {
      tags: ['books', 'library', 'metadata', 'reading'],
      envVars: [],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // SEARCH & EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════
  entry('web-search', 'Web Search', 'pskill9', 'search',
    'Free Google web search — query the web and retrieve results',
    'pskill9/mcp-web-search', {
      tags: ['web-search', 'google', 'search', 'query'],
      envVars: [],
    }),

  entry('youtube-transcript', 'YouTube Transcript', 'kimtaeyoon83', 'search',
    'YouTube Transcript — fetch video subtitles and transcripts',
    'kimtaeyoon83/mcp-youtube-transcript', {
      tags: ['youtube', 'transcript', 'subtitles', 'video'],
      envVars: [],
    }),

  entry('open-library', 'Open Library', '8enSmith', 'search',
    'Open Library — search books, authors, and reading lists',
    '8enSmith/mcp-open-library', {
      tags: ['books', 'library', 'search', 'open-data'],
      envVars: [],
    }),

  entry('ashra', 'Ashra', 'getrupt', 'search',
    'Ashra — extract structured data from any website',
    'getrupt/ashra', {
      tags: ['web-scraping', 'structured-data', 'extraction'],
      envVars: [],
    }),

  entry('open-data', 'Open Data', 'OpenDataMCP', 'search',
    'Open Data to LLM — convert open data sources to LLM-readable format',
    'OpenDataMCP/mcp-open-data', {
      tags: ['open-data', 'llm', 'conversion', 'datasets'],
      envVars: [],
    }),

  entry('tinybird', 'Tinybird', 'tinybirdco', 'search',
    'Tinybird — query Tinybird workspace data sources and analytics',
    'tinybirdco/mcp-server-tinybird', {
      tags: ['tinybird', 'analytics', 'real-time', 'data'],
      envVars: ['TINYBIRD_API_KEY', 'TINYBIRD_HOST'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // MULTIMEDIA & PROCESSING
  // ═══════════════════════════════════════════════════════════════════════
  entry('imagen-3', 'Imagen 3', 'hamflx', 'multimedia',
    'Google Imagen 3 — AI image generation from text prompts',
    'hamflx/mcp-imagen3', {
      tags: ['imagen', 'google', 'image-generation', 'ai', 'text-to-image'],
      envVars: ['GOOGLE_API_KEY', 'GOOGLE_PROJECT_ID'],
    }),

  entry('openai-gpt-image', 'OpenAI GPT Image', 'SureScaleAI', 'multimedia',
    'OpenAI GPT Image — image generation and editing with DALL-E / GPT',
    'SureScaleAI/mcp-openai-gpt-image', {
      tags: ['openai', 'dall-e', 'image-generation', 'image-editing', 'ai'],
      envVars: ['OPENAI_API_KEY'],
    }),

  entry('manim', 'Manim', 'abhiemj', 'multimedia',
    'Manim — mathematical animation generation',
    'abhiemj/mcp-manim', {
      tags: ['manim', 'animation', 'math', 'video', 'educational'],
      envVars: [],
    }),

  entry('video-editing', 'Video Editing', 'burningion', 'multimedia',
    'Video Editing — cut, trim, and compose video clips',
    'burningion/mcp-video-editing', {
      tags: ['video', 'editing', 'ffmpeg', 'trim', 'compose'],
      envVars: [],
    }),

  entry('davinci-resolve', 'DaVinci Resolve', 'samuelgursky', 'multimedia',
    'DaVinci Resolve — professional video editing and color grading automation',
    'samuelgursky/mcp-davinci-resolve', {
      tags: ['davinci-resolve', 'video-editing', 'color-grading', 'professional'],
      envVars: ['RESOLVE_SCRIPT_API_HOST', 'RESOLVE_SCRIPT_API_PORT'],
    }),

  entry('dicom', 'DICOM', 'ChristianHinge', 'multimedia',
    'DICOM — medical image viewing and metadata extraction',
    'ChristianHinge/mcp-dicom', {
      tags: ['dicom', 'medical', 'imaging', 'healthcare'],
      envVars: [],
    }),

  entry('bilibili', 'Bilibili', 'xspadex', 'multimedia',
    'Bilibili — fetch trending videos and video metadata from Bilibili',
    'xspadex/mcp-bilibili', {
      tags: ['bilibili', 'video', 'trending', 'chinese-platform'],
      envVars: [],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // ART & CULTURE
  // ═══════════════════════════════════════════════════════════════════════
  entry('discogs', 'Discogs', 'cswkim', 'art',
    'Discogs — search music releases, artists, and master releases',
    'cswkim/mcp-discogs', {
      tags: ['discogs', 'music', 'vinyl', 'releases', 'discography'],
      envVars: ['DISCOGS_PERSONAL_TOKEN'],
    }),

  entry('quran', 'Quran', 'djalal', 'art',
    'Quran.com — search verses, surahs, and translations',
    'djalal/mcp-quran', {
      tags: ['quran', 'islam', 'scripture', 'religion'],
      envVars: [],
    }),

  entry('met-museum', 'Met Museum', 'mikechao', 'art',
    'Metropolitan Museum of Art — search artworks, artists, and collections',
    'mikechao/mcp-met-museum', {
      tags: ['met-museum', 'art', 'museum', 'collection', 'artworks'],
      envVars: [],
    }),

  entry('rijksmuseum', 'Rijksmuseum', 'r-huijts', 'art',
    'Rijksmuseum — search and explore artworks from the Dutch national museum',
    'r-huijts/mcp-rijksmuseum', {
      tags: ['rijksmuseum', 'art', 'museum', 'dutch', 'paintings'],
      envVars: ['RIJKSMUSEUM_API_KEY'],
    }),

  entry('wwii-records', 'WWII Records', 'r-huijts', 'art',
    'WWII historical records — search war archives and historical documents',
    'r-huijts/oorlogsbronnen-mcp', {
      tags: ['wwii', 'history', 'archives', 'war-records', 'oorlogsbronnen'],
      envVars: [],
    }),

  entry('anilist', 'AniList', 'yuna0x0', 'art',
    'AniList — search anime, manga, characters, and studios',
    'yuna0x0/mcp-anilist', {
      tags: ['anilist', 'anime', 'manga', 'japanese-animation'],
      envVars: [],
    }),

  entry('aseprite', 'Aseprite', 'diivi', 'art',
    'Aseprite — pixel art creation and sprite management',
    'diivi/mcp-aseprite', {
      tags: ['aseprite', 'pixel-art', 'sprites', 'game-art'],
      envVars: ['ASEPRITE_PATH'],
    }),

  entry('bazi', 'Bazi', 'cantian-ai', 'art',
    'Bazi (Chinese Astrology) — Four Pillars of Destiny analysis',
    'cantian-ai/mcp-bazi', {
      tags: ['bazi', 'chinese-astrology', 'four-pillars', 'fortune-telling'],
      envVars: [],
    }),

  entry('chart', 'AntV Chart', 'antvis', 'art',
    'AntV visual charts — generate publication-quality charts and diagrams',
    'antvis/mcp-server-chart', {
      tags: ['chart', 'antv', 'visualization', 'data-viz', 'diagram'],
      envVars: [],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // TOOLS & INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════
  entry('metamcp', 'MetaMCP', 'metatool-ai', 'tools',
    'MetaMCP — unified MCP middleware for composing and routing MCP servers',
    'metatool-ai/metamcp', {
      tags: ['middleware', 'unified', 'routing', 'composition', 'proxy'],
      envVars: ['METAMCP_CONFIG'],
    }),

  entry('open-mcp', 'Open-MCP', 'wegotdocs', 'tools',
    'Open-MCP — turn any API into an MCP server in 10 seconds',
    'wegotdocs/open-mcp', {
      tags: ['api-to-mcp', 'auto-generate', 'wrapper', 'quick-setup'],
      envVars: ['OPENMCP_API_URL', 'OPENMCP_API_KEY'],
    }),

  entry('pipedream', 'Pipedream', 'PipedreamHQ', 'tools',
    'Pipedream — access 2500+ APIs and integrations via workflow triggers',
    'PipedreamHQ/mcp-server-pipedream', {
      tags: ['pipedream', 'api', 'integration', 'workflow', 'automation'],
      envVars: ['PIPEDREAM_API_KEY'],
    }),

  entry('pluggedin', 'PluggedIn', 'VeriTeknik', 'tools',
    'PluggedIn — MCP proxy and composer for chaining multiple MCP servers',
    'VeriTeknik/mcp-pluggedin', {
      tags: ['proxy', 'composer', 'chain', 'pipeline'],
      envVars: ['PLUGGEDIN_CONFIG'],
    }),

  entry('mcgravity', 'McGravity', 'tigranbs', 'tools',
    'McGravity — MCP load balancer for distributing tool calls across instances',
    'tigranbs/mcgravity', {
      tags: ['load-balancer', 'scaling', 'distributed', 'proxy'],
      envVars: ['MC_GRAVITY_CONFIG'],
    }),

  entry('mcp-access-point', 'MCP Access Point', 'sxhxliang', 'tools',
    'MCP Access Point — expose MCP servers as web services',
    'sxhxliang/mcp-access-point', {
      tags: ['web-service', 'expose', 'http', 'gateway'],
      envVars: ['ACCESS_POINT_PORT', 'ACCESS_POINT_TOKEN'],
    }),

  entry('maya', 'Maya', 'PatrickPalmer', 'tools',
    'Autodesk Maya — 3D modeling, animation, and rendering automation',
    'PatrickPalmer/MayaMCP', {
      tags: ['maya', 'autodesk', '3d', 'modeling', 'animation', 'rendering'],
      envVars: ['MAYA_SCRIPT_PORT'],
    }),

  entry('google-tasks-alt', 'Google Tasks (Alt)', 'zcaceres', 'tools',
    'Google Tasks — task list management (alternative implementation)',
    'zcaceres/mcp-google-tasks', {
      tags: ['google-tasks', 'todo', 'productivity'],
      envVars: ['GOOGLE_TASKS_CLIENT_ID', 'GOOGLE_TASKS_CLIENT_SECRET', 'GOOGLE_TASKS_REFRESH_TOKEN'],
    }),

  entry('product-hunt', 'Product Hunt', 'jaipandya', 'tools',
    'Product Hunt — fetch today\'s launches, trending products, and posts',
    'jaipandya/mcp-product-hunt', {
      tags: ['product-hunt', 'launches', 'startups', 'trending'],
      envVars: ['PRODUCT_HUNT_API_KEY', 'PRODUCT_HUNT_API_SECRET'],
    }),

  entry('iaptic', 'iaptic', 'iaptic', 'tools',
    'iaptic — customer purchases, revenue analytics, and App Store data',
    'iaptic/mcp-iaptic', {
      tags: ['iaptic', 'revenue', 'purchases', 'app-store', 'analytics'],
      envVars: ['IAPTIC_SHARED_SECRET', 'IAPTIC_APP_ID'],
    }),

  entry('unomi', 'Apache Unomi CDP', 'sergehuber', 'tools',
    'Apache Unomi CDP — customer data platform event and profile management',
    'sergehuber/inoyu-mcp-unomi-server', {
      tags: ['unomi', 'cdp', 'customer-data', 'profiles', 'events'],
      envVars: ['UNOMI_URL', 'UNOMI_USERNAME', 'UNOMI_PASSWORD'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // MONITORING & OBSERVABILITY
  // ═══════════════════════════════════════════════════════════════════════
  entry('prometheus', 'Prometheus', 'pab1it0', 'monitoring',
    'Prometheus — execute PromQL queries, list metrics, manage alerts',
    'pab1it0/prometheus-mcp-server', {
      tags: ['prometheus', 'promql', 'monitoring', 'metrics', 'alerts'],
      envVars: ['PROMETHEUS_URL', 'PROMETHEUS_USERNAME', 'PROMETHEUS_PASSWORD'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // DATA & CUSTOMER
  // ═══════════════════════════════════════════════════════════════════════
  entry('inoyu-unomi', 'Inoyu Unomi CDP', 'sergehuber', 'data',
    'Apache Unomi CDP — profile segments, events, and personalization rules',
    'sergehuber/inoyu-mcp-unomi', {
      tags: ['unomi', 'cdp', 'personalization', 'profiles', 'segments'],
      envVars: ['UNOMI_URL', 'UNOMI_API_KEY'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // FILE & STORAGE
  // ═══════════════════════════════════════════════════════════════════════
  entry('wwii-records-file', 'WWII Records (File)', 'r-huijts', 'file',
    'WWII historical records — download and archive war documents and files',
    'r-huijts/oorlogsbronnen-file-mcp', {
      tags: ['wwii', 'history', 'files', 'archives', 'download'],
      envVars: [],
    }),

  entry('firebase-file', 'Firebase Storage', 'gannonh', 'file',
    'Firebase Storage — upload, download, and manage files in Cloud Storage',
    'gannonh/mcp-firebase-storage', {
      tags: ['firebase', 'storage', 'files', 'cloud-storage', 'google'],
      envVars: ['FIREBASE_PROJECT_ID', 'FIREBASE_PRIVATE_KEY', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_STORAGE_BUCKET'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // AGGREGATOR & PROXY
  // ═══════════════════════════════════════════════════════════════════════
  entry('metamcp-aggregator', 'MetaMCP (Aggregator)', 'metatool-ai', 'aggregator',
    'MetaMCP aggregator mode — combine multiple MCP servers into one unified interface',
    'metatool-ai/metamcp-aggregator', {
      tags: ['aggregator', 'unified', 'multi-server', 'middleware'],
      envVars: ['METAMCP_SERVERS_CONFIG'],
    }),

  entry('pluggedin-proxy', 'PluggedIn (Proxy)', 'VeriTeknik', 'aggregator',
    'PluggedIn proxy mode — proxy and route requests to multiple MCP backends',
    'VeriTeknik/mcp-pluggedin-proxy', {
      tags: ['proxy', 'routing', 'multi-backend', 'aggregator'],
      envVars: ['PLUGGEDIN_BACKENDS'],
    }),

  entry('mcgravity-lb', 'McGravity (Load Balancer)', 'tigranbs', 'aggregator',
    'McGravity load balancer — distribute MCP tool calls across server pools',
    'tigranbs/mcgravity-lb', {
      tags: ['load-balancer', 'pool', 'distribution', 'scaling'],
      envVars: ['MC_GRAVITY_POOL_CONFIG'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // TRANSLATION & LANGUAGE
  // ═══════════════════════════════════════════════════════════════════════
  entry('isaac-sim', 'Isaac Sim', 'omni-mcp', 'translation',
    'NVIDIA Isaac Sim — control robot simulations via natural language commands',
    'omni-mcp/isaac-sim', {
      tags: ['isaac-sim', 'nvidia', 'robotics', 'simulation', 'natural-language'],
      envVars: ['ISAAC_SIM_HOST', 'ISAAC_SIM_PORT'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // SOCIAL & MEDIA
  // ═══════════════════════════════════════════════════════════════════════
  entry('bluesky-social', 'Bluesky (Social)', 'keturiosakys', 'social',
    'Bluesky social feed — post, interact, and manage social presence',
    'keturiosakys/mcp-bluesky-social', {
      tags: ['bluesky', 'social', 'atproto', 'feed'],
      envVars: ['BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD'],
    }),

  // ═══════════════════════════════════════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════════════════════════════════════
  entry('netskope-security', 'Netskope Security', 'johnneerdael', 'security',
    'Netskope — cloud security posture, threat detection, and policy management',
    'johnneerdael/mcp-netskope-security', {
      tags: ['netskope', 'security', 'threat-detection', 'policy', 'casb'],
      envVars: ['NETSKOPE_API_URL', 'NETSKOPE_API_TOKEN'],
    }),
];

// ─── Catalog Query Functions ───────────────────────────────────────────────

/**
 * Get all catalog entries for a specific category.
 *
 * @example
 *   getCatalogByCategory('database')  // returns all DB servers
 */
export function getCatalogByCategory(category: MCPCategory): MCPCatalogEntry[] {
  return mcpCatalog.filter((e) => e.category === category);
}

/**
 * Full-text search across name, description, author, and tags.
 * Case-insensitive; returns entries that match ANY of the query terms.
 *
 * @example
 *   searchCatalog('postgres vector')   // matches entries with "postgres" OR "vector"
 */
export function searchCatalog(query: string): MCPCatalogEntry[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return [];

  return mcpCatalog.filter((entry) => {
    const haystack = [
      entry.id,
      entry.name,
      entry.description,
      entry.author,
      entry.category,
      ...entry.tags,
    ]
      .join(' ')
      .toLowerCase();

    return terms.some((term) => haystack.includes(term));
  });
}

/**
 * Look up a single catalog entry by its unique kebab-case id.
 *
 * @example
 *   getCatalogEntry('chroma')  // returns the Chroma vector store entry
 */
export function getCatalogEntry(id: string): MCPCatalogEntry | undefined {
  return mcpCatalog.find((e) => e.id === id);
}

/**
 * Return the deduplicated set of ALL environment variable names required
 * across the entire catalog. Useful for generating `.env` templates
 * or CI/CD configuration checks.
 */
export function getRequiredEnvVars(): string[] {
  const vars = new Set<string>();
  for (const entry of mcpCatalog) {
    for (const v of entry.envVars) {
      vars.add(v);
    }
  }
  return Array.from(vars).sort();
}

/**
 * Return a map of category → entry count for quick summary / dashboard use.
 */
export function getCatalogStats(): Record<MCPCategory, number> {
  const stats = {} as Record<MCPCategory, number>;
  for (const cat of Object.keys(MCP_CATEGORIES) as MCPCategory[]) {
    stats[cat] = mcpCatalog.filter((e) => e.category === cat).length;
  }
  return stats;
}

/**
 * Return only entries that match the given status filter.
 */
export function getCatalogByStatus(status: MCPStatus): MCPCatalogEntry[] {
  return mcpCatalog.filter((e) => e.status === status);
}

/**
 * Return all unique transport types used in the catalog.
 */
export function getUniqueTransports(): MCPTransport[] {
  const set = new Set<MCPTransport>();
  for (const e of mcpCatalog) set.add(e.source.transport);
  return Array.from(set);
}

/**
 * Return all unique category values present in the catalog.
 */
export function getUsedCategories(): MCPCategory[] {
  const set = new Set<MCPCategory>();
  for (const e of mcpCatalog) set.add(e.category);
  return Array.from(set);
}
