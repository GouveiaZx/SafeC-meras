import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkRecordings() {
  try {
    const recordings = await prisma.recording.findMany({
      select: {
        id: true,
        filename: true,
        filePath: true,
        status: true,
        createdAt: true
      }
    });
    console.log('Gravações no banco de dados:');
    console.log(JSON.stringify(recordings, null, 2));
  } catch (error) {
    console.error('Erro ao consultar banco:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkRecordings();