import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
// REMOVIDO: import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import messageRealTimeRoutes from './routes/messageRealTimeRoutes.js';
// ANTIGO (remover): import { startRabbitConsumer } from './mqttHandler.js';
import { startRealtimeConsumer } from './mqttHandler.js'; // NOVO: consumidor da fila espelho
import axios from 'axios';
import pool from './config/mysqlDB.js'; // Pool MySQL

dotenv.config();
const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://main.d1o387bagj6v4q.amplifyapp.com'
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// REMOVIDO: connectDB(); // Era do Mongoose

// Inicializa o consumidor da FILA ESPELHO (alimenta o buffer do getRealTimeMessages)
startRealtimeConsumer().catch((err) => {
  console.error('Erro ao inicializar RabbitMQ (fila espelho):', err?.message || err);
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/mensagens', messageRoutes);
app.use('/api/mensagensRealTime', messageRealTimeRoutes);

// Rota de validação (MySQL)
app.post('/api/validarDispositivo', async (req, res) => {
  const { codigoHex, cnpj } = req.body;

  if (!codigoHex || !cnpj) {
    return res.status(400).json({ message: 'Código Serial e CNPJ são obrigatórios!' });
  }

  const cnpjRegex = /^\d{14}$/;
  if (!cnpjRegex.test(cnpj)) {
    return res.status(400).json({ message: 'CNPJ inválido! Deve conter 14 dígitos numéricos.' });
  }

  // Ajuste aqui conforme seu padrão real:
  // Se seu serial tem 16 hex, use {16}; se tem 8, volte para {8}
  const codigoHexRegex = /^[0-9A-Fa-f]{16}$/; // 16 caracteres hexadecimais
  if (!codigoHexRegex.test(codigoHex)) {
    return res.status(400).json({ message: 'Código serial inválido! Deve conter 16 caracteres hexadecimais.' });
  }

  try {
    const selectQuery = `
      SELECT id, id_maquina, cnpj 
      FROM dispositivo_esp32 
      WHERE codigo_hex = ? AND (cnpj IS NULL OR cnpj = ?)
    `;
    const selectValues = [codigoHex, cnpj];
    const [rows] = await pool.query(selectQuery, selectValues);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Serial do dispositivo não encontrado ou já associado a outro CNPJ. Consulte o administrador!' });
    }

    const dispositivo = rows[0];

    if (dispositivo.cnpj === null) {
      const updateQuery = `
        UPDATE dispositivo_esp32
        SET cnpj = ?, data_registro = NOW()
        WHERE codigo_hex = ?
      `;
      const updateValues = [cnpj, codigoHex];
      await pool.query(updateQuery, updateValues);
    }
    
    res.status(200).json({
      message: 'Dispositivo validado com sucesso!',
      dispositivoId: dispositivo.id,
      maquinaId: dispositivo.id_maquina
    });
  } catch (error) {
    console.error('Erro detalhado ao validar dispositivo:', error);
    res.status(500).json({ message: 'Erro interno ao validar dispositivo: ' + error.message });
  }
});

app.get('/api/receitaws/:cnpj', async (req, res) => {
  const cnpj = req.params.cnpj;
  try {
    const response = await axios.get(`https://receitaws.com.br/v1/cnpj/${cnpj}`);
    res.json(response.data);
  } catch (error) {
    console.error('Erro ao consultar a API da Receita Federal:', error);
    res.status(500).json({ message: 'Erro ao consultar a API da Receita Federal.' });
  }
});

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Hello World!' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});