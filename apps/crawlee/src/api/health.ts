// src/api/health.ts
import { Request, Response, Router } from 'express';

const router = Router();

router.get('/health', (_: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
