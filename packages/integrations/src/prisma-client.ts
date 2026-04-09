import { PrismaClient } from "@prisma/client";

let prismaClientSingleton: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (prismaClientSingleton) {
    return prismaClientSingleton;
  }

  prismaClientSingleton = new PrismaClient({
    log: ["error", "warn"],
  });

  return prismaClientSingleton;
}

export async function disconnectPrismaClient(): Promise<void> {
  if (!prismaClientSingleton) {
    return;
  }

  await prismaClientSingleton.$disconnect();
  prismaClientSingleton = undefined;
}
