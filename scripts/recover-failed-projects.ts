/**
 * Recovery Script: Reset FAILED projects and re-queue them
 * 
 * Usage:
 *   npx tsx scripts/recover-failed-projects.ts [--dry-run] [--limit N]
 * 
 * Options:
 *   --dry-run   Show what would be done without making changes
 *   --limit N   Only process N projects (default: all)
 * 
 * @version 1.0.0
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit='));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1]) : Infinity;

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  AENEWS BUILDER — Failed Project Recovery Tool');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will modify DB)'}`);
  console.log(`  Limit: ${LIMIT === Infinity ? 'All' : LIMIT}`);
  console.log('');

  // 1. Find all FAILED projects
  const failedProjects = await prisma.project.findMany({
    where: { state: 'FAILED' },
    orderBy: { createdAt: 'desc' },
    take: LIMIT === Infinity ? undefined : LIMIT,
  });

  console.log(`  Found ${failedProjects.length} FAILED projects`);

  if (failedProjects.length === 0) {
    console.log('  No failed projects to recover. Exiting.');
    return;
  }

  // 2. Display projects
  console.log('');
  console.log('  Projects to recover:');
  for (const p of failedProjects) {
    console.log(`    - ${p.id} | ${p.name} | ${p.createdAt.toISOString()}`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('  [DRY RUN] Would reset these projects to INIT and re-queue them.');
    return;
  }

  // 3. Reset each project state to INIT
  let recovered = 0;
  let queued = 0;

  for (const project of failedProjects) {
    try {
      // Reset state to INIT
      await prisma.project.update({
        where: { id: project.id },
        data: {
          state: 'INIT',
          context: {},
          updatedAt: new Date(),
        },
      });
      recovered++;

      // Re-queue the project
      const jobData = {
        projectId: project.id,
        userId: project.userId,
        prompt: project.prompt,
        options: {},
        priority: 3,
      };

      // Push to Redis queue directly
      await redis.xadd(
        'bull:project:generate',
        '*',
        'data',
        JSON.stringify(jobData)
      );
      queued++;

      console.log(`  ✅ Recovered: ${project.id} (${project.name})`);
    } catch (error: any) {
      console.error(`  ❌ Failed to recover ${project.id}: ${error.message}`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Recovery complete: ${recovered} reset, ${queued} re-queued`);
  console.log('═══════════════════════════════════════════════════');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
