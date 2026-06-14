/**
 * Seed Script - Creates the initial admin user
 *
 * Usage:
 *   ADMIN_EMAIL=custom@example.com ADMIN_PASSWORD=MyPass123! npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@aenews.net';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD env var is required');
  process.exit(1);
}

async function seed() {
  try {
    console.log('🌱 Seeding admin user...');

    // Check if admin user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
    });

    if (existingUser) {
      // Update role to admin if not already
      if (existingUser.role !== 'admin') {
        await prisma.user.update({
          where: { email: ADMIN_EMAIL },
          data: { role: 'admin' },
        });
        console.log(`✅ Updated existing user "${ADMIN_EMAIL}" role to "admin"`);
      } else {
        console.log(`ℹ️  Admin user "${ADMIN_EMAIL}" already exists with admin role — skipping`);
      }
      return;
    }

    // Hash password with bcrypt (12 rounds)
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    // Create admin user
    const adminUser = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        password: hashedPassword,
        name: 'Admin',
        role: 'admin',
      },
    });

    console.log(`✅ Admin user created: ${adminUser.email} (id: ${adminUser.id}, role: ${adminUser.role})`);
  } catch (error: any) {
    console.error('❌ Seed failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
