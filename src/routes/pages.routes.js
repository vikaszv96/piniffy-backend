import { Router } from 'express';
import { requirePinterestAuth } from '../middlewares/requirePinterestAuth.js';
import { importFromSitemap, listPages, updatePage, deletePage, fetchPageImages } from '../controllers/pages.controller.js';

const router = Router();

router.post('/api/pages/import', importFromSitemap);
router.post('/api/pages/images', fetchPageImages);
router.get('/api/pages', listPages);
router.patch('/api/pages/:id', updatePage);
router.delete('/api/pages/:id', deletePage);

export default router;


