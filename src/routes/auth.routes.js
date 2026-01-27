import { Router } from 'express';
import {
  redirectToPinterest, getPinBoards, getPin, createPin,
  pinterestCallback, getPinterestMe, disconnectPinterest,
  createPinBoard, getAllPins
} from '../controllers/pinterestAuth.controller.js';
import { requirePinterestAuth } from '../middlewares/requirePinterestAuth.js';

const router = Router();

// OAuth (public)
router.get('/pinterest', redirectToPinterest);
router.get('/pinterest/callback', pinterestCallback);

// Account
router.get('/api/pinterest/me', requirePinterestAuth, getPinterestMe);
router.post('/api/pinterest/disconnect', requirePinterestAuth, disconnectPinterest);

// Boards
router.post('/api/pinterest/boards', requirePinterestAuth, createPinBoard);
router.get('/api/pinterest/boards', requirePinterestAuth, getPinBoards);

// Pins
router.post('/api/pinterest/pins', requirePinterestAuth, createPin);
router.get('/api/pinterest/pins/:pinid', requirePinterestAuth, getPin);
router.get('/api/pinterest/board/pins/:boardId', requirePinterestAuth, getAllPins);


export default router;


