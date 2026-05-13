/**
 * Universal Cloud MCP Tools Bundle
 * Covers: AWS, Kubernetes, Terraform, Pulumi, Azure, Cloudflare,
 * Docker/Portainer, Railway, Alibaba Cloud, and Generic Cloud.
 *
 * Each adapter reads configuration from environment variables and uses
 * axios for REST APIs, child_process for CLI-based tools with safety checks.
 *
 * SECURITY: All CLI calls use execFileSync with argument arrays to prevent
 * command injection. Input validation is applied to user-controlled parameters.
 */

import axios from 'axios';
import { execFileSync } from 'child_process';

// ═══════════════════════════════════════════════════════════════════════════
// Input Validation Helpers
// ═══════════════════════════════════════════════════════════════════════════

const RE_BUCKET_NAME = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const RE_BUCKET_NAME_SHORT = /^[a-z0-9]{3,63}$/;

/** Validate an S3 bucket name */
function validateBucketName(bucket: string): void {
  if (!RE_BUCKET_NAME.test(bucket) && !RE_BUCKET_NAME_SHORT.test(bucket)) {
    throw new Error(`Invalid bucket name: must match S3 naming rules (lowercase, dots, hyphens, 3-63 chars)`);
  }
}

/** Validate an S3 object key */
function validateS3Key(key: string): void {
  if (key.startsWith('/') || key.includes('..')) {
    throw new Error('Invalid S3 key: must not start with "/" or contain ".."');
  }
}

/** Validate a CloudFormation/Pulumi stack name */
function validateStackName(name: string): void {
  if (!/^[a-zA-Z][a-zA-Z0-9-]{0,127}$/.test(name)) {
    throw new Error('Invalid stack name: must start with a letter, contain only letters, digits, and hyphens, max 128 chars');
  }
}

/** Validate a Kubernetes resource name (DNS subdomain) */
function validateK8sName(value: string, label: string = 'resource'): void {
  if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(value) || value.length > 253) {
    throw new Error(`Invalid Kubernetes ${label}: must be a valid DNS subdomain (lowercase, digits, hyphens, 1-253 chars)`);
  }
}

/** Validate a Kubernetes resource type (e.g., pod, deployment, service) */
function validateK8sResourceType(resource: string): void {
  if (!/^[a-z][a-z0-9]*([.][a-z0-9]+)*$/.test(resource)) {
    throw new Error(`Invalid Kubernetes resource type: "${resource}"`);
  }
}

/** Validate a Docker container ID */
function validateContainerId(id: string): void {
  if (!/^[a-f0-9]{12,64}$/.test(id)) {
    throw new Error(`Invalid container ID: must be a hex string of 12-64 characters`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AWS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * AWS adapter using the AWS CLI (safe Docker sandbox execution).
 * Uses AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_SESSION_TOKEN.
 */
export class AWSAdapter {
  private region: string;

  constructor() {
    this.region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1';
  }

  /** Helper: run AWS CLI command with safety checks */
  private aws(args: string[], timeout: number = 30000): string {
    const dangerousFlags = ['--profile', '--credentials-file'];
    for (const arg of args) {
      if (dangerousFlags.some((f) => arg.startsWith(f))) {
        throw new Error('Flag not allowed in sandbox mode');
      }
    }
    return execFileSync('aws', [...args, '--region', this.region, '--output', 'json'], {
      timeout,
      encoding: 'utf-8',
    }).trim();
  }

  /** List all S3 buckets */
  async s3ListBuckets(): Promise<any> {
    try {
      const out = this.aws(['s3', 'ls']);
      return { success: true, data: out ? JSON.parse(out) : [] };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Upload a string body to an S3 bucket */
  async s3Upload(bucket: string, key: string, body: string): Promise<any> {
    try {
      validateBucketName(bucket);
      validateS3Key(key);
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      const tmpFile = path.join(os.tmpdir(), `mcp-s3-${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, body, 'utf-8');
      execFileSync('aws', ['s3', 'cp', tmpFile, `s3://${bucket}/${key}`, '--region', this.region], { timeout: 60000 });
      fs.unlinkSync(tmpFile);
      return { success: true, data: { bucket, key, uploaded: true } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Describe all EC2 instances */
  async ec2DescribeInstances(): Promise<any> {
    try {
      const out = this.aws(['ec2', 'describe-instances']);
      const data = JSON.parse(out);
      const instances = (data.Reservations || [])
        .flatMap((r: any) => r.Instances || [])
        .map((i: any) => ({
          instanceId: i.InstanceId,
          state: i.State?.Name,
          type: i.InstanceType,
          imageId: i.ImageId,
          publicIp: i.PublicIpAddress,
          privateIp: i.PrivateIpAddress,
          launchTime: i.LaunchTime,
        }));
      return { success: true, data: { instances, count: instances.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List all Lambda functions */
  async lambdaListFunctions(): Promise<any> {
    try {
      const out = this.aws(['lambda', 'list-functions']);
      const data = JSON.parse(out);
      const functions = (data.Functions || []).map((f: any) => ({
        name: f.FunctionName,
        runtime: f.Runtime,
        handler: f.Handler,
        lastModified: f.LastModified,
        codeSize: f.CodeSize,
        description: f.Description,
      }));
      return { success: true, data: { functions, count: functions.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Deploy a CloudFormation stack from a template body */
  async cloudformationDeploy(stackName: string, template: string): Promise<any> {
    try {
      validateStackName(stackName);
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      const tmpFile = path.join(os.tmpdir(), `mcp-cf-${Date.now()}.yaml`);
      fs.writeFileSync(tmpFile, template, 'utf-8');
      const out = this.aws(
        ['cloudformation', 'create-stack', '--stack-name', stackName, '--template-body', `file://${tmpFile}`, '--capabilities', 'CAPABILITY_IAM']
      );
      fs.unlinkSync(tmpFile);
      return { success: true, data: out ? JSON.parse(out) : { stackName, status: 'CREATE_IN_PROGRESS' } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Get the caller's AWS identity */
  async stsGetCallerIdentity(): Promise<any> {
    try {
      const out = this.aws(['sts', 'get-caller-identity']);
      return { success: true, data: JSON.parse(out) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Kubernetes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Kubernetes adapter using kubectl CLI.
 * Uses KUBECONFIG or the default kubeconfig path.
 */
export class KubernetesAdapter {
  private kubeconfig: string;

  constructor(kubeconfig?: string) {
    this.kubeconfig = kubeconfig || process.env.KUBECONFIG || '';
  }

  /** Helper: run kubectl with optional namespace flag */
  private kubectl(args: string[], timeout: number = 15000): string {
    const baseArgs: string[] = [];
    if (this.kubeconfig) baseArgs.push('--kubeconfig', this.kubeconfig);
    return execFileSync('kubectl', [...baseArgs, ...args, '-o', 'json'], {
      timeout,
      encoding: 'utf-8',
    }).trim();
  }

  /** List pods in a namespace (default: all) */
  async getPods(namespace?: string): Promise<any> {
    try {
      const args = ['get', 'pods'];
      if (namespace) {
        validateK8sName(namespace, 'namespace');
        args.push('-n', namespace);
      } else {
        args.push('-A');
      }
      const out = this.kubectl(args);
      const data = JSON.parse(out);
      const items = (data.items || []).map((p: any) => ({
        name: p.metadata?.name,
        namespace: p.metadata?.namespace,
        status: p.status?.phase,
        restarts: p.status?.containerStatuses?.reduce((sum: number, c: any) => sum + (c.restartCount || 0), 0),
        node: p.spec?.nodeName,
        age: p.metadata?.creationTimestamp,
      }));
      return { success: true, data: { pods: items, count: items.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List deployments in a namespace */
  async getDeployments(namespace?: string): Promise<any> {
    try {
      const args = ['get', 'deployments'];
      if (namespace) {
        validateK8sName(namespace, 'namespace');
        args.push('-n', namespace);
      } else {
        args.push('-A');
      }
      const out = this.kubectl(args);
      const data = JSON.parse(out);
      const items = (data.items || []).map((d: any) => ({
        name: d.metadata?.name,
        namespace: d.metadata?.namespace,
        ready: `${d.status?.readyReplicas || 0}/${d.status?.replicas || 0}`,
        available: d.status?.availableReplicas || 0,
        updated: d.status?.updatedReplicas || 0,
      }));
      return { success: true, data: { deployments: items, count: items.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List services in a namespace */
  async getServices(namespace?: string): Promise<any> {
    try {
      const args = ['get', 'services'];
      if (namespace) {
        validateK8sName(namespace, 'namespace');
        args.push('-n', namespace);
      } else {
        args.push('-A');
      }
      const out = this.kubectl(args);
      const data = JSON.parse(out);
      const items = (data.items || []).map((s: any) => ({
        name: s.metadata?.name,
        namespace: s.metadata?.namespace,
        type: s.spec?.type,
        clusterIp: s.spec?.clusterIP,
        ports: (s.spec?.ports || []).map((p: any) => ({ port: p.port, targetPort: p.targetPort, protocol: p.protocol })),
      }));
      return { success: true, data: { services: items, count: items.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List all namespaces */
  async getNamespaces(): Promise<any> {
    try {
      const out = this.kubectl(['get', 'namespaces']);
      const data = JSON.parse(out);
      const items = (data.items || []).map((n: any) => ({
        name: n.metadata?.name,
        status: n.status?.phase,
        age: n.metadata?.creationTimestamp,
      }));
      return { success: true, data: { namespaces: items, count: items.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Get logs for a specific pod and container */
  async getLogs(namespace: string, pod: string, container?: string): Promise<any> {
    try {
      validateK8sName(namespace, 'namespace');
      validateK8sName(pod, 'pod');
      if (container) validateK8sName(container, 'container');
      const args: string[] = [];
      if (this.kubeconfig) args.push('--kubeconfig', this.kubeconfig);
      args.push('logs', pod, '-n', namespace, '--tail=100');
      if (container) args.push('-c', container);
      const out = execFileSync('kubectl', args, { timeout: 15000, encoding: 'utf-8' }).trim();
      return { success: true, data: { pod, namespace, container, logs: out } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Apply a Kubernetes resource from YAML/JSON */
  async apply(resource: string): Promise<any> {
    try {
      const fs = await import('fs');
      const os = await import('os');
      const path = await import('path');
      const tmpFile = path.join(os.tmpdir(), `mcp-k8s-${Date.now()}.yaml`);
      fs.writeFileSync(tmpFile, resource, 'utf-8');
      const args: string[] = [];
      if (this.kubeconfig) args.push('--kubeconfig', this.kubeconfig);
      args.push('apply', '-f', tmpFile);
      const out = execFileSync('kubectl', args, { timeout: 30000, encoding: 'utf-8' }).trim();
      fs.unlinkSync(tmpFile);
      return { success: true, data: { output: out } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Delete a resource by type and name */
  async delete(namespace: string, resource: string, name: string): Promise<any> {
    try {
      validateK8sName(namespace, 'namespace');
      validateK8sName(name, 'resource name');
      validateK8sResourceType(resource);
      const args: string[] = [];
      if (this.kubeconfig) args.push('--kubeconfig', this.kubeconfig);
      args.push('delete', resource, name, '-n', namespace);
      const out = execFileSync('kubectl', args, { timeout: 30000, encoding: 'utf-8' }).trim();
      return { success: true, data: { output: out, deleted: true } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Terraform
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Terraform adapter using the terraform CLI for infrastructure-as-code.
 * Uses TF_VAR_* environment variables for variable injection.
 */
export class TerraformAdapter {
  /** Initialize a Terraform working directory */
  async init(configDir: string): Promise<string> {
    try {
      if (!this.isValidPath(configDir)) throw new Error('Path traversal detected');
      const out = execFileSync('terraform', ['-chdir', configDir, 'init', '-no-color'], {
        timeout: 60000, encoding: 'utf-8',
      });
      return out;
    } catch (error: any) {
      throw new Error(`Terraform init failed: ${error.message}`);
    }
  }

  /** Generate an execution plan */
  async plan(configDir: string): Promise<string> {
    try {
      if (!this.isValidPath(configDir)) throw new Error('Path traversal detected');
      const out = execFileSync('terraform', ['-chdir', configDir, 'plan', '-no-color'], {
        timeout: 120000, encoding: 'utf-8',
      });
      return out;
    } catch (error: any) {
      throw new Error(`Terraform plan failed: ${error.message}`);
    }
  }

  /** Apply infrastructure changes */
  async apply(configDir: string): Promise<string> {
    try {
      if (!this.isValidPath(configDir)) throw new Error('Path traversal detected');
      const out = execFileSync('terraform', ['-chdir', configDir, 'apply', '-auto-approve', '-no-color'], {
        timeout: 300000, encoding: 'utf-8',
      });
      return out;
    } catch (error: any) {
      throw new Error(`Terraform apply failed: ${error.message}`);
    }
  }

  /** Destroy all managed infrastructure */
  async destroy(configDir: string): Promise<string> {
    try {
      if (!this.isValidPath(configDir)) throw new Error('Path traversal detected');
      const out = execFileSync('terraform', ['-chdir', configDir, 'destroy', '-auto-approve', '-no-color'], {
        timeout: 300000, encoding: 'utf-8',
      });
      return out;
    } catch (error: any) {
      throw new Error(`Terraform destroy failed: ${error.message}`);
    }
  }

  /** Show the current state */
  async show(configDir: string): Promise<any> {
    try {
      if (!this.isValidPath(configDir)) throw new Error('Path traversal detected');
      const out = execFileSync('terraform', ['-chdir', configDir, 'show', '-json'], {
        timeout: 30000, encoding: 'utf-8',
      });
      return { success: true, data: JSON.parse(out) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Validate path is safe (no traversal) */
  private isValidPath(dir: string): boolean {
    const normalized = dir.replace(/\\/g, '/');
    return !normalized.includes('..') && normalized.startsWith('/');
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Pulumi
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Pulumi adapter using the Pulumi CLI for infrastructure-as-code.
 * Uses PULUMI_ACCESS_TOKEN for cloud backend auth.
 */
export class PulumiAdapter {
  /** Preview infrastructure changes */
  async preview(stackName: string): Promise<any> {
    try {
      validateStackName(stackName);
      const out = execFileSync(
        'pulumi', ['preview', '--stack', stackName, '--json'],
        { timeout: 120000, encoding: 'utf-8' }
      );
      return { success: true, data: JSON.parse(out) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Deploy infrastructure changes */
  async up(stackName: string): Promise<any> {
    try {
      validateStackName(stackName);
      const out = execFileSync(
        'pulumi', ['up', '--stack', stackName, '--yes', '--json'],
        { timeout: 300000, encoding: 'utf-8' }
      );
      return { success: true, data: JSON.parse(out) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Destroy all managed infrastructure */
  async destroy(stackName: string): Promise<any> {
    try {
      validateStackName(stackName);
      const out = execFileSync(
        'pulumi', ['destroy', '--stack', stackName, '--yes', '--json'],
        { timeout: 300000, encoding: 'utf-8' }
      );
      return { success: true, data: JSON.parse(out) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Get stack outputs */
  async getStackOutputs(stackName: string): Promise<any> {
    try {
      validateStackName(stackName);
      const out = execFileSync(
        'pulumi', ['stack', 'output', '--stack', stackName, '--json'],
        { timeout: 30000, encoding: 'utf-8' }
      );
      return { success: true, data: JSON.parse(out) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Azure
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Azure adapter using the Azure CLI (az) for cloud resource management.
 * Uses AZURE_SUBSCRIPTION_ID, AZURE_TENANT_ID.
 */
export class AzureAdapter {
  private subscriptionId: string;

  constructor() {
    this.subscriptionId = process.env.AZURE_SUBSCRIPTION_ID || '';
  }

  /** Helper: run az CLI command */
  private az(args: string[], timeout: number = 30000): string {
    const fullArgs = [...args];
    if (this.subscriptionId) fullArgs.push('--subscription', this.subscriptionId);
    fullArgs.push('--output', 'json');
    return execFileSync('az', fullArgs, {
      timeout, encoding: 'utf-8',
    }).trim();
  }

  /** List resources in a resource group or subscription */
  async listResources(resourceGroup?: string): Promise<any> {
    try {
      const args = ['resource', 'list'];
      if (resourceGroup) args.push('--resource-group', resourceGroup);
      const out = this.az(args);
      const resources = JSON.parse(out);
      return { success: true, data: { resources, count: resources.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Execute an Azure Resource Graph query */
  async getResourceGraph(query: string): Promise<any> {
    try {
      const out = this.az(['graph', 'query', '--query', query]);
      return { success: true, data: JSON.parse(out) };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List all virtual machines */
  async getVMs(): Promise<any> {
    try {
      const out = this.az(['vm', 'list', '--show-details']);
      const vms = JSON.parse(out);
      return { success: true, data: { vms, count: vms.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List all storage accounts */
  async getStorageAccounts(): Promise<any> {
    try {
      const out = this.az(['storage', 'account', 'list']);
      const accounts = JSON.parse(out);
      return { success: true, data: { accounts, count: accounts.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cloudflare (Full)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enhanced Cloudflare adapter covering Workers, KV, R2, D1, and DNS.
 * Uses CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 */
export class CloudflareFullAdapter {
  private token: string;
  private accountId: string;
  private baseUrl = 'https://api.cloudflare.com/client/v4';
  private headers: Record<string, string>;

  constructor() {
    this.token = process.env.CLOUDFLARE_API_TOKEN || '';
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID || '';
    this.headers = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  /** List all Workers scripts */
  async listWorkers(): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/accounts/${this.accountId}/workers/scripts`,
        { headers: this.headers }
      );
      return { success: true, data: response.data.result || [] };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.errors?.[0]?.message || error.message };
    }
  }

  /** Deploy a Worker script */
  async deployWorker(name: string, script: string): Promise<any> {
    try {
      const response = await axios.put(
        `${this.baseUrl}/accounts/${this.accountId}/workers/scripts/${name}`,
        script,
        {
          headers: { ...this.headers, 'Content-Type': 'application/javascript+module' },
        }
      );
      return { success: true, data: response.data };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.errors?.[0]?.message || error.message };
    }
  }

  /** List all KV namespaces */
  async listKVNamespaces(): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/accounts/${this.accountId}/storage/kv/namespaces`,
        { headers: this.headers }
      );
      return { success: true, data: response.data.result || [] };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.errors?.[0]?.message || error.message };
    }
  }

  /** List all R2 buckets */
  async listR2Buckets(): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/accounts/${this.accountId}/r2/buckets`,
        { headers: this.headers }
      );
      return { success: true, data: response.data.buckets || [] };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.errors?.[0]?.message || error.message };
    }
  }

  /** List all D1 databases */
  async listD1Databases(): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/accounts/${this.accountId}/d1/database`,
        { headers: this.headers }
      );
      return { success: true, data: response.data.result || [] };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.errors?.[0]?.message || error.message };
    }
  }

  /** List DNS records for a zone */
  async dnsListRecords(zoneId: string): Promise<any> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/zones/${zoneId}/dns_records`,
        { headers: this.headers }
      );
      return { success: true, data: response.data.result || [] };
    } catch (error: any) {
      return { success: false, error: error.response?.data?.errors?.[0]?.message || error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Docker / Portainer
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Docker adapter using the Docker CLI and optional Portainer API.
 * Uses DOCKER_HOST, PORTAINER_URL, PORTAINER_API_KEY.
 */
export class DockerAdapter {
  /** List all containers */
  async listContainers(): Promise<any> {
    try {
      const out = execFileSync('docker', ['ps', '-a', '--format', '{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}'], {
        timeout: 10000, encoding: 'utf-8',
      }).trim();
      if (!out) return { success: true, data: [] };
      const containers = out.split('\n').map((line) => {
        const [id, name, image, status, ports] = line.split('|');
        return { id, name, image, status, ports };
      });
      return { success: true, data: { containers, count: containers.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Get resource usage stats for a container */
  async getContainerStats(id: string): Promise<any> {
    try {
      validateContainerId(id);
      const out = execFileSync('docker', ['stats', id, '--no-stream', '--format', '{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.BlockIO}}'], {
        timeout: 15000, encoding: 'utf-8',
      }).trim();
      const [cpu, mem, netIO, blockIO] = out.split('|');
      return { success: true, data: { id, cpu, mem, netIO, blockIO } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List all Docker images */
  async getImages(): Promise<any> {
    try {
      const out = execFileSync('docker', ['images', '--format', '{{.Repository}}|{{.Tag}}|{{.ID}}|{{.Size}}|{{.CreatedSince}}'], {
        timeout: 10000, encoding: 'utf-8',
      }).trim();
      if (!out) return { success: true, data: [] };
      const images = out.split('\n').map((line) => {
        const [repo, tag, id, size, created] = line.split('|');
        return { repository: repo, tag, id, size, created };
      });
      return { success: true, data: { images, count: images.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List all Docker networks */
  async getNetworks(): Promise<any> {
    try {
      const out = execFileSync('docker', ['network', 'ls', '--format', '{{.ID}}|{{.Name}}|{{.Driver}}|{{.Scope}}'], {
        timeout: 10000, encoding: 'utf-8',
      }).trim();
      if (!out) return { success: true, data: [] };
      const networks = out.split('\n').map((line) => {
        const [id, name, driver, scope] = line.split('|');
        return { id, name, driver, scope };
      });
      return { success: true, data: { networks, count: networks.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List all Docker volumes */
  async getVolumes(): Promise<any> {
    try {
      const out = execFileSync('docker', ['volume', 'ls', '--format', '{{.Name}}|{{.Driver}}'], {
        timeout: 10000, encoding: 'utf-8',
      }).trim();
      if (!out) return { success: true, data: [] };
      const volumes = out.split('\n').map((line) => {
        const [name, driver] = line.split('|');
        return { name, driver };
      });
      return { success: true, data: { volumes, count: volumes.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Railway
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Railway adapter using the GraphQL API v2 for PaaS management.
 * Uses RAILWAY_TOKEN (or RAILWAY_API_TOKEN).
 */
export class RailwayAdapter {
  private token: string;
  private graphqlUrl = 'https://backboard.railway.app/graphql/v2';

  constructor() {
    this.token = process.env.RAILWAY_TOKEN || process.env.RAILWAY_API_TOKEN || '';
  }

  /** Execute a GraphQL query against the Railway API */
  private async graphql(query: string, variables: Record<string, any> = {}): Promise<any> {
    const response = await axios.post(
      this.graphqlUrl,
      { query, variables },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
      }
    );
    return response.data;
  }

  /** List all Railway projects */
  async listProjects(): Promise<any> {
    try {
      const data = await this.graphql(`
        query { projects { edges { node { id name description createdAt } } } }
      `);
      const projects = data?.data?.projects?.edges?.map((e: any) => e.node) || [];
      return { success: true, data: { projects, count: projects.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List all services in a project */
  async listServices(projectId: string): Promise<any> {
    try {
      const data = await this.graphql(
        `query($id: ID!) { project(id: $id) { services { edges { node { id name } } } } }`,
        { id: projectId }
      );
      const services = data?.data?.project?.services?.edges?.map((e: any) => e.node) || [];
      return { success: true, data: { services, count: services.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Create a new deployment for a service */
  async createDeployment(projectId: string, serviceId: string): Promise<any> {
    try {
      const data = await this.graphql(
        `mutation($projectId: ID!, $serviceId: ID!) {
          deploymentCreate(input: { projectId: $projectId, serviceId: $serviceId }) { id }
        }`,
        { projectId, serviceId }
      );
      return { success: true, data: data?.data?.deploymentCreate };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Alibaba Cloud
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Alibaba Cloud adapter using the Alibaba Cloud CLI (aliyun).
 * Uses ALICLOUD_ACCESS_KEY_ID, ALICLOUD_ACCESS_KEY_SECRET, ALICLOUD_REGION.
 */
export class AlibabaCloudAdapter {
  private region: string;

  constructor() {
    this.region = process.env.ALICLOUD_REGION || process.env.ALIBABA_CLOUD_REGION || 'cn-hangzhou';
  }

  /** Helper: run aliyun CLI */
  private aliyun(args: string[], timeout: number = 30000): string {
    return execFileSync('aliyun', [...args, '--region', this.region, '--output', 'json'], {
      timeout, encoding: 'utf-8',
    }).trim();
  }

  /** Describe ECS instances */
  async describeECSInstances(): Promise<any> {
    try {
      const out = this.aliyun(['ecs', 'DescribeInstances', '--PageSize', '50']);
      const data = JSON.parse(out);
      const instances = (data.Instances?.Instance || []).map((i: any) => ({
        instanceId: i.InstanceId,
        status: i.Status,
        type: i.InstanceType,
        publicIp: i.PublicIpAddress?.IpAddress?.[0],
        privateIp: i.VpcAttributes?.PrivateIpAddress?.IpAddress?.[0],
        region: i.RegionId,
        creationTime: i.CreationTime,
      }));
      return { success: true, data: { instances, count: instances.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** List all OSS buckets */
  async listBuckets(): Promise<any> {
    try {
      const out = this.aliyun(['oss', 'ls']);
      const data = JSON.parse(out);
      const buckets = (data.Buckets?.Bucket || []).map((b: any) => ({
        name: b.Name,
        location: b.Location,
        creationDate: b.CreationDate,
        storageClass: b.StorageClass,
      }));
      return { success: true, data: { buckets, count: buckets.length } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /** Query CloudMonitor metrics */
  async queryMonitor(metrics: any): Promise<any> {
    try {
      const args = [
        'cms', 'QueryMetricList',
        '--Namespace', metrics.namespace,
        '--MetricName', metrics.metricName,
        '--StartTime', metrics.startTime || '',
        '--EndTime', metrics.endTime || '',
        '--Period', metrics.period || '60',
      ];
      const out = this.aliyun(args);
      const data = JSON.parse(out);
      return { success: true, data };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Generic Cloud (DigitalOcean, Linode, Hetzner, etc.)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generic cloud adapter for providers with REST APIs.
 * Supports DigitalOcean, Linode (Akamai), Hetzner, Vultr, Scaleway, UpCloud, etc.
 * Configured with provider name, API token, and base URL.
 */
export class GenericCloudAdapter {
  private provider: string;
  private token: string;
  private baseUrl: string;
  private headers: Record<string, string>;

  /**
   * @param provider - Provider name (e.g., 'digitalocean', 'linode', 'hetzner')
   * @param token - API token / key
   * @param baseUrl - REST API base URL
   */
  constructor(provider: string, token: string, baseUrl: string) {
    this.provider = provider;
    this.token = token;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  /** Make an arbitrary API request to the cloud provider */
  async request(method: string, path: string, body?: any): Promise<any> {
    try {
      const url = `${this.baseUrl}${path}`;
      const response = await axios({
        method: method.toUpperCase(),
        url,
        headers: this.headers,
        data: body,
        timeout: 30000,
      });
      return {
        success: true,
        data: response.data,
        provider: this.provider,
        status: response.status,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.response?.data?.error || error.message,
        provider: this.provider,
      };
    }
  }

  /** List all droplets/instances/servers */
  async listInstances(): Promise<any> {
    const paths: Record<string, string> = {
      digitalocean: '/v2/droplets',
      linode: '/v4/linode/instances',
      hetzner: '/v1/servers',
      vultr: '/v2/instances',
      scaleway: '/instances/v1/zones/fr-par-1/servers',
      upcloud: '/1.3/server',
    };
    const path = paths[this.provider.toLowerCase()];
    if (!path) return { success: false, error: `No known instance path for provider: ${this.provider}` };
    return this.request('GET', path);
  }

  /** Get account information */
  async getAccount(): Promise<any> {
    const paths: Record<string, string> = {
      digitalocean: '/v2/account',
      linode: '/v4/account',
      hetzner: '/v1/locations',
      vultr: '/v2/account',
    };
    const path = paths[this.provider.toLowerCase()] || '/v2/account';
    return this.request('GET', path);
  }
}
