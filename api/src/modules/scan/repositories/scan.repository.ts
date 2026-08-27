import type { Prisma, PrismaClient, Scan, ScanHistory } from '@prisma/client';
import type { AiPrediction } from '../../../shared/services/ai-client.js';

export interface CreateScanData {
  userId: string;
  imagePath: string | null;
  prediction: AiPrediction;
}

export interface ScanHistoryItem {
  id: string;
  scanId: string;
  summary: string;
  createdAt: Date;
  scan: {
    id: string;
    skinTone: string;
    undertone: string;
    faceShape: string;
    confidence: number;
    createdAt: Date;
  };
}

export interface IScanRepository {
  create(data: CreateScanData): Promise<Scan>;
  findByIdForUser(scanId: string, userId: string): Promise<Scan | null>;
}

export interface IHistoryRepository {
  create(data: { userId: string; scanId: string; summary: string }): Promise<ScanHistory>;
  listByUserId(userId: string, limit?: number): Promise<ScanHistoryItem[]>;
}

export class ScanRepository implements IScanRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: CreateScanData): Promise<Scan> {
    return this.db.scan.create({
      data: {
        userId: data.userId,
        imagePath: data.imagePath,
        skinTone: data.prediction.skin_tone,
        undertone: data.prediction.undertone,
        faceShape: data.prediction.face_shape,
        confidence: data.prediction.confidence,
        rawAiResponse: data.prediction as unknown as Prisma.InputJsonValue,
      },
    });
  }

  findByIdForUser(scanId: string, userId: string): Promise<Scan | null> {
    return this.db.scan.findFirst({ where: { id: scanId, userId } });
  }
}

export class HistoryRepository implements IHistoryRepository {
  constructor(private readonly db: PrismaClient) {}

  create(data: { userId: string; scanId: string; summary: string }): Promise<ScanHistory> {
    return this.db.scanHistory.create({ data });
  }

  listByUserId(userId: string, limit = 50): Promise<ScanHistoryItem[]> {
    return this.db.scanHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        scan: {
          select: {
            id: true,
            skinTone: true,
            undertone: true,
            faceShape: true,
            confidence: true,
            createdAt: true,
          },
        },
      },
    });
  }
}
