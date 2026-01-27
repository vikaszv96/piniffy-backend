import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';

import authRoutes from './routes/auth.routes.js';
// import pinterestRoutes from './routes/pinterest.routes.js';
import { errorHandler } from './middlewares/error.middleware.js';

const app = express();

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

/**
 * SESSION CONFIG (OAuth = Login)
 */
app.use(session({
  name: 'piniffy.sid',
  secret: process.env.SESSION_SECRET || 'piniffy-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false // set true in production (https)
  }
}));

app.use('/auth', authRoutes);
// app.use('/api/pinterest', pinterestRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

export default app;
