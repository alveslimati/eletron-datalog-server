import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
// import connectDB from './config/db.js'; // REMOVER: Era do Mongoose, se não usar, remova.
import userRoutes from './routes/userRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import messageRealTimeRoutes from './routes/messageRealTimeRoutes.js';
import mqttHandler from './mqttHandler.js';
import axios from 'axios';
// --- IMPORTAÇÃO CORRIGIDA ---
import pool from './config/mysqlDB.js'; // Importa o pool de conexões do MySQL

dotenv.config();
const app = express();

const allowedOrigins = [
  'http://localhost:5173',
   'http://localhost:4173',
  'https://main.d1o387bagj6v4q.amplifyapp.com'
];

const corsOptions = {
  origin: (origin, callback) => {
    // Permitir sem origin (ex: Postman, server2server)
    if (!origin) return callback(null, true);
    // Permitir localhost e amplify
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // Bloquear outras origens
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));


// Middleware para garantir que a rota OPTIONS funcione (preflight)
app.use(express.json());   // Middleware para JSON

// connectDB(); // REMOVER: Era do Mongoose

mqttHandler(app);

app.use('/auth', userRoutes);
app.use('/api/users', userRoutes);
app.use('/api/mensagens', messageRoutes);
app.use('/api/mensagensRealTime', messageRealTimeRoutes);

// --- REMOVER A CONFIGURAÇÃO ANTIGA DO POOL DO POSTGRESQL ---
// export const pool = new Pool({...}); // REMOVER TODO ESTE BLOCO

// --- ROTA DE VALIDAÇÃO AJUSTADA PARA MYSQL ---
app.post('/api/validarDispositivo', async (req, res) => {
  const { codigoHex, cnpj } = req.body;
 
  // Validações de formato (mantidas, pois são rápidas e não dependem do DB)
  if (!codigoHex || !cnpj) {
    return res.status(400).json({ message: 'Código Serial e CNPJ são obrigatórios!' });
  }

  const cnpjRegex = /^\d{14}$/;
  if (!cnpjRegex.test(cnpj)) {
    return res.status(400).json({ message: 'CNPJ inválido! Deve conter 14 dígitos numéricos.' });
  }

  // Ajuste a regex se o código hexadecimal tiver um tamanho diferente de 8
  // Pelo seu INSERT, parece ter 16 caracteres hexadecimais (8 bytes)
  const codigoHexRegex = /^[0-9A-Fa-f]{8}$/; // Ajustado para 16 caracteres hexadecimais
  if (!codigoHexRegex.test(codigoHex)) {
    return res.status(400).json({ message: 'Código serial inválido! Deve conter 8 caracteres hexadecimais.' });
  }

  try {
    // --- SINTAXE SQL AJUSTADA ---
    // MySQL usa '?' como placeholder em vez de '$1', '$2', etc.
    const selectQuery = `
      SELECT id, id_maquina, cnpj 
      FROM dispositivo_esp32 
      WHERE codigo_hex = ? AND (cnpj IS NULL OR cnpj = ?)
    `;
    const selectValues = [codigoHex, cnpj];
    
    // A forma de executar a query muda um pouco com 'mysql2'
    const [rows] = await pool.query(selectQuery, selectValues);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Serial do dispositivo não encontrado ou já associado a outro CNPJ. Consulte o administrador!' });
    }

    const dispositivo = rows[0];

    if (dispositivo.cnpj === null) {
      // NOW() funciona tanto em PostgreSQL quanto em MySQL, então não precisa mudar.
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