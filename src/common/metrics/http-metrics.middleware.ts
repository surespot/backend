import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { Counter, Histogram, register } from 'prom-client';

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

// Prevent duplicate metric registration on hot reload
if (!register.getSingleMetric('http_requests_total')) {
  register.registerMetric(httpRequestsTotal);
}
if (!register.getSingleMetric('http_request_duration_seconds')) {
  register.registerMetric(httpRequestDuration);
}

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const start = process.hrtime.bigint();

    res.on('finish', () => {
      // Use route template (/orders/:id) not actual URL (/orders/abc123)
      const route = req.route?.path ?? req.path;
      const method = req.method;
      const statusCode = String(res.statusCode);
      const durationSeconds =
        Number(process.hrtime.bigint() - start) / 1_000_000_000;

      httpRequestsTotal.labels(method, route, statusCode).inc();
      httpRequestDuration
        .labels(method, route, statusCode)
        .observe(durationSeconds);
    });

    next();
  }
}
