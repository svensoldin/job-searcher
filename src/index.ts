import jobRoutes from './routes/jobs.js';
import logger from './utils/logger.js';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

const app: Express = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

app.use('/jobs', jobRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `The route ${req.originalUrl} does not exist.`,
  });
});

// Error handler
app.use(
  (
    err: { status: number; message: string },
    req: express.Request,
    res: express.Response,
    // `next` is included so Express recognises this as an error handler
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction
  ) => {
    logger.error('Unhandled error:', err);

    res.status(err?.status || 500).json({
      error: 'Internal server error',
      message:
        process.env.NODE_ENV === 'development'
          ? err?.message
          : 'Something went wrong',
    });
  }
);

/**
 * Initialize the server and required services
 */
async function initializeServer() {
  try {
    logger.info('🚀 Initializing Job scraping API Server...');

    app.listen(PORT, () => {
      logger.info(`✅ Server is running on port ${PORT}`);
      logger.info('🎯 Ready to analyze jobs!');
    });
  } catch (error) {
    console.error('❌ Failed to initialize server:', error);
    logger.error('❌ Failed to initialize server:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

initializeServer();

export default app;
