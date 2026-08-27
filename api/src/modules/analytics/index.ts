import { Router } from 'express';
import type { Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import { authenticate } from '../../middlewares/authenticate.js';
import { authorize } from '../../middlewares/authorize.js';
import { resolveAffiliatorId } from '../../middlewares/resolve-affiliator.js';
import { asyncHandler } from '../../shared/utils/async-handler.js';
import { sendSuccess } from '../../shared/utils/api-response.js';

function pctChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function createAnalyticsModule(db: PrismaClient): Router {
  const router = Router();
  router.use(authenticate, authorize('AFFILIATOR'), resolveAffiliatorId(db));

  router.get(
    '/summary',
    asyncHandler(async (req: Request, res: Response) => {
      const affiliatorId = req.affiliatorId as string;
      const now = new Date();
      const windowStart = new Date(now.getTime() - 7 * DAY_MS);
      const prevWindowStart = new Date(now.getTime() - 14 * DAY_MS);

      const clickWhere = { affiliatorId };

      const [
        totalVisitors,
        totalScans,
        totalClicks,
        revenueAgg,
        visitorsPrev,
        visitorsCurr,
        scansPrev,
        scansCurr,
        clicksPrev,
        clicksCurr,
        revenuePrev,
        revenueCurr,
        convertedClicks,
      ] = await Promise.all([
        db.pageViewEvent.count({ where: { aiPage: { affiliatorId } } }),
        db.scan.count({ where: { aiPageId: { not: null }, aiPage: { affiliatorId } } }),
        db.clickEvent.count({ where: clickWhere }),
        db.clickEvent.aggregate({ where: clickWhere, _sum: { revenue: true } }),
        db.pageViewEvent.count({ where: { aiPage: { affiliatorId }, createdAt: { gte: prevWindowStart, lt: windowStart } } }),
        db.pageViewEvent.count({ where: { aiPage: { affiliatorId }, createdAt: { gte: windowStart } } }),
        db.scan.count({ where: { aiPage: { affiliatorId }, createdAt: { gte: prevWindowStart, lt: windowStart } } }),
        db.scan.count({ where: { aiPage: { affiliatorId }, createdAt: { gte: windowStart } } }),
        db.clickEvent.count({ where: { affiliatorId, createdAt: { gte: prevWindowStart, lt: windowStart } } }),
        db.clickEvent.count({ where: { affiliatorId, createdAt: { gte: windowStart } } }),
        db.clickEvent.aggregate({ where: { affiliatorId, createdAt: { gte: prevWindowStart, lt: windowStart } }, _sum: { revenue: true } }),
        db.clickEvent.aggregate({ where: { affiliatorId, createdAt: { gte: windowStart } }, _sum: { revenue: true } }),
        db.clickEvent.count({ where: { affiliatorId, converted: true } }),
      ]);

      const ctr = totalVisitors > 0 ? Number(((totalClicks / totalVisitors) * 100).toFixed(1)) : 0;
      const conversionRate = totalScans > 0 ? Number(((convertedClicks / totalScans) * 100).toFixed(1)) : 0;
      const ctrPrev = visitorsPrev > 0 ? (clicksPrev / visitorsPrev) * 100 : 0;
      const ctrCurr = visitorsCurr > 0 ? (clicksCurr / visitorsCurr) * 100 : 0;

      sendSuccess(res, {
        totalVisitors,
        totalScans,
        totalClicks,
        ctr,
        conversionRate,
        estimatedRevenue: revenueAgg._sum.revenue ?? 0,
        visitorsTrend: pctChange(visitorsCurr, visitorsPrev),
        scansTrend: pctChange(scansCurr, scansPrev),
        ctrTrend: pctChange(ctrCurr, ctrPrev),
        revenueTrend: pctChange(revenueCurr._sum.revenue ?? 0, revenuePrev._sum.revenue ?? 0),
      });
    }),
  );

  router.get(
    '/chart',
    asyncHandler(async (req: Request, res: Response) => {
      const affiliatorId = req.affiliatorId as string;
      const now = new Date();
      const days: { day: string; visitors: number; scans: number; clicks: number; revenue: number }[] = [];

      for (let i = 6; i >= 0; i -= 1) {
        const dayStart = new Date(now.getTime() - i * DAY_MS);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + DAY_MS);

        // eslint-disable-next-line no-await-in-loop
        const [visitors, scans, clicks, revenueAgg] = await Promise.all([
          db.pageViewEvent.count({ where: { aiPage: { affiliatorId }, createdAt: { gte: dayStart, lt: dayEnd } } }),
          db.scan.count({ where: { aiPage: { affiliatorId }, createdAt: { gte: dayStart, lt: dayEnd } } }),
          db.clickEvent.count({ where: { affiliatorId, createdAt: { gte: dayStart, lt: dayEnd } } }),
          db.clickEvent.aggregate({ where: { affiliatorId, createdAt: { gte: dayStart, lt: dayEnd } }, _sum: { revenue: true } }),
        ]);

        days.push({
          day: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
          visitors,
          scans,
          clicks,
          revenue: revenueAgg._sum.revenue ?? 0,
        });
      }

      sendSuccess(res, days);
    }),
  );

  router.get(
    '/undertone-stats',
    asyncHandler(async (req: Request, res: Response) => {
      const affiliatorId = req.affiliatorId as string;
      const rows = await db.scan.groupBy({
        by: ['undertone'],
        where: { aiPage: { affiliatorId } },
        _count: { undertone: true },
      });
      const total = rows.reduce((sum, r) => sum + r._count.undertone, 0);
      sendSuccess(
        res,
        rows.map((r) => ({
          name: r.undertone,
          percentage: total > 0 ? Number(((r._count.undertone / total) * 100).toFixed(1)) : 0,
        })),
      );
    }),
  );

  router.get(
    '/concern-stats',
    asyncHandler(async (req: Request, res: Response) => {
      const affiliatorId = req.affiliatorId as string;
      const rows = await db.scan.findMany({
        where: { aiPage: { affiliatorId } },
        select: { concerns: true },
      });
      const counts = new Map<string, number>();
      let total = 0;
      for (const row of rows) {
        for (const concern of row.concerns) {
          counts.set(concern, (counts.get(concern) ?? 0) + 1);
          total += 1;
        }
      }
      sendSuccess(
        res,
        [...counts.entries()].map(([concern, count]) => ({
          concern,
          percentage: total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0,
        })),
      );
    }),
  );

  return router;
}
