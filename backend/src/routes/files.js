/**
 * Rotas de Arquivos - Gerenciamento de arquivos e navegação
 */
import express from 'express';
import fileController from '../controllers/fileController.js';
import { authenticateToken } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Configurar multer para upload de arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limite
  },
  fileFilter: (req, file, cb) => {
    // Permitir todos os tipos de arquivo por enquanto
    cb(null, true);
  }
});

// Aplicar autenticação a todas as rotas
router.use(authenticateToken);

/**
 * @route   GET /api/files
 * @desc    Listar arquivos e diretórios
 * @access  Admin, Operator, Viewer
 */
router.get('/', fileController.listFiles);

/**
 * @route   GET /api/files/search
 * @desc    Buscar arquivos
 * @access  Admin, Operator, Viewer
 */
router.get('/search', fileController.searchFiles);

/**
 * @route   GET /api/files/stats
 * @desc    Estatísticas de armazenamento
 * @access  Admin, Operator
 */
router.get('/stats', authorize(['admin', 'operator']), fileController.getStorageStats);

/**
 * @route   GET /api/files/:filename/info
 * @desc    Obter informações de um arquivo
 * @access  Admin, Operator, Viewer
 */
router.get('/:filename/info', fileController.getFileInfo);

/**
 * @route   GET /api/files/:filename/download
 * @desc    Fazer download de um arquivo
 * @access  Admin, Operator, Viewer
 */
router.get('/:filename/download', fileController.downloadFile);

/**
 * @route   POST /api/files/upload
 * @desc    Fazer upload de arquivo
 * @access  Admin, Operator
 */
router.post('/upload', 
  authorize(['admin', 'operator']), 
  upload.single('file'), 
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    res.json({
      message: 'Arquivo enviado com sucesso',
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        path: req.file.path
      }
    });
  }
);

/**
 * @route   DELETE /api/files/:filename
 * @desc    Deletar arquivo
 * @access  Admin, Operator
 */
router.delete('/:filename', authorize(['admin', 'operator']), fileController.deleteFile);

/**
 * @route   PUT /api/files/:filename/move
 * @desc    Mover arquivo
 * @access  Admin, Operator
 */
router.put('/:filename/move', authorize(['admin', 'operator']), fileController.moveFile);

export default router;