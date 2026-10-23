/**
 * Prisma seed script for local development.
 * Issue #25: User position tracking database schema and ORM models.
 *
 * Run with:
 *   npx prisma db seed
 * or:
 *   npx ts-node prisma/seed.ts
 */

import { PrismaClient, Strategy, TransactionType, TransactionStatus, Protocol } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Seeding NeuroWealth development database…');

  // ── Clean existing dev data ──────────────────────────────────────────────
  await prisma.auditLog.deleteMany();
  await prisma.apySnapshot.deleteMany();
  await prisma.rebalance.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.user.deleteMany();

  // ── Seed users ────────────────────────────────────────────────────────────
  const alice = await prisma.user.create({
    data: {
      stellarAddress: 'GDQOE23CFSUMSVQK4Y5JHPPYK73VYCNHZHA7ENKCV37P6SUEO6XQBKPP',
      phoneHash: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
      strategy: Strategy.balanced,
    },
  });

  const bob = await prisma.user.create({
    data: {
      stellarAddress: 'GC2QLHB3SCMHNL5MU6KQZLPVHIWGBPB7AIDLQHYC7RLVG47WJQHPQOBY',
      strategy: Strategy.conservative,
    },
  });

  const carol = await prisma.user.create({
    data: {
      stellarAddress: 'GDRGM2SGNPZRTZPFCAEZXRXPQMLP2SNWBZ3VKIVS6LWZPOXN7XVHSQPJ',
      phoneHash: 'deadbeef00112233445566778899aabbccddeeff00112233445566778899aabb',
      strategy: Strategy.growth,
    },
  });

  console.log(`  ✅ Created 3 users: ${alice.id}, ${bob.id}, ${carol.id}`);

  // ── Seed transactions ─────────────────────────────────────────────────────
  await prisma.transaction.createMany({
    data: [
      {
        userId: alice.id,
        type: TransactionType.deposit,
        amount: 500_0000000, // 500 USDC in stroops (7 decimals)
        txHash: 'aabbcc0000000000000000000000000000000000000000000000000000000001',
        ledger: 51_000_000,
        status: TransactionStatus.confirmed,
      },
      {
        userId: alice.id,
        type: TransactionType.withdrawal,
        amount: 100_0000000,
        txHash: 'aabbcc0000000000000000000000000000000000000000000000000000000002',
        ledger: 51_000_100,
        status: TransactionStatus.confirmed,
      },
      {
        userId: bob.id,
        type: TransactionType.deposit,
        amount: 1000_0000000,
        txHash: 'bbccdd0000000000000000000000000000000000000000000000000000000001',
        ledger: 51_000_200,
        status: TransactionStatus.confirmed,
      },
      {
        userId: carol.id,
        type: TransactionType.deposit,
        amount: 250_0000000,
        txHash: 'ccddee0000000000000000000000000000000000000000000000000000000001',
        ledger: 51_000_300,
        status: TransactionStatus.pending,
      },
    ],
  });

  console.log('  ✅ Created 4 transactions');

  // ── Seed rebalances ───────────────────────────────────────────────────────
  await prisma.rebalance.createMany({
    data: [
      {
        fromProtocol: Protocol.none,
        toProtocol: Protocol.blend,
        amount: 1500_0000000,
        expectedApy: 520, // 5.20%
        actualApy: 510,
        txHash: 'rebal0000000000000000000000000000000000000000000000000000000001',
      },
      {
        fromProtocol: Protocol.blend,
        toProtocol: Protocol.dex,
        amount: 1500_0000000,
        expectedApy: 820,
        actualApy: 795,
        txHash: 'rebal0000000000000000000000000000000000000000000000000000000002',
      },
    ],
  });

  console.log('  ✅ Created 2 rebalances');

  // ── Seed APY snapshots ────────────────────────────────────────────────────
  const now = new Date();
  const snapshotData = [];

  for (let i = 12; i >= 0; i--) {
    const ts = new Date(now.getTime() - i * 5 * 60 * 1000); // every 5 min
    snapshotData.push(
      {
        protocol: Protocol.blend,
        apyBps: 510 + Math.floor(Math.random() * 30),
        recordedAt: ts,
      },
      {
        protocol: Protocol.dex,
        apyBps: 780 + Math.floor(Math.random() * 60),
        recordedAt: ts,
      },
    );
  }

  await prisma.apySnapshot.createMany({ data: snapshotData });
  console.log(`  ✅ Created ${snapshotData.length} APY snapshots`);

  // ── Seed audit logs ───────────────────────────────────────────────────────
  await prisma.auditLog.createMany({
    data: [
      {
        userId: alice.id,
        action: 'keypair_decrypted',
        details: { reason: 'transaction_signing', txHash: 'aabbcc0000000000000000000000000000000000000000000000000000000001' },
      },
      {
        userId: carol.id,
        action: 'keypair_generated',
        details: { stellarAddress: carol.stellarAddress },
      },
    ],
  });

  console.log('  ✅ Created 2 audit log entries');
  console.log('🌱 Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
