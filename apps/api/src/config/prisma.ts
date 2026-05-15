/**
 * Prisma Client Singleton with Read Replica Support
 * Phase 2: Adds read replica routing for read-heavy operations
 * 
 * - prisma: Primary client for writes
 * - prismaRead: Read replica client for read-heavy operations
 */

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaRead: PrismaClient | undefined;
};

// Primary client for writes
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Read replica client for read-heavy operations
// Falls back to primary DATABASE_URL if DATABASE_READ_URL is not set
export const prismaRead = globalForPrisma.prismaRead ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_READ_URL || process.env.DATABASE_URL,
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaRead = prismaRead;
}

