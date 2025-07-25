import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import message2Routes from './routes/message2Routes.js';
import mqttHandler from './mqttHandler.js';
import axios from 'axios';
import { Pool } from 'pg'; 

dotenv.config();

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
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

// Conecta ao banco de dados
connectDB();

// Configura MQTT (broker)
mqttHandler(app); // Configuração de mensagens em tempo real

// Configuração das rotas
app.use('/auth', userRoutes); // Rota de autenticação de usuário
app.use('/api/users', userRoutes);        
app.use('/api/mensagens', messageRoutes); // Rota de dados MQTT
app.use('/api/mensagens2', message2Routes); // Rota de dados MQTT

// Configuração do Pool de Conexões com o PostgreSQL
export const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // --- Adicione esta configuração para SSL ---
  ssl: {
    rejectUnauthorized: false // Usando false apenas para testes ou se não tiver o certificado CA
    // Para produção, você devemos configurar o certificado CA:
    // ca: fs.readFileSync('caminho/para/rds-ca-cert.pem').toString(),
  }
  // ------------------------------------------
});

// Rota para validar o dispositivo e o CNPJ
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

  // --- Toda a lógica de DB dentro do try...catch ---
  try {
    // Consulta principal para verificar se o dispositivo existe E
    // se o CNPJ associado é NULL ou corresponde ao CNPJ informado.
    // Esta consulta substitui as verificações separadas.
    const selectQuery = `
      SELECT id, id_maquina, cnpj
      FROM dispositivo_esp32
      WHERE codigo_hex = $1 AND (cnpj IS NULL OR cnpj = $2)
    `;
    const selectValues = [codigoHex, cnpj];
    const result = await pool.query(selectQuery, selectValues);
    
    if (result.rows.length === 0) {
      // Se não encontrou nenhuma linha, significa que:
      // 1. O codigo_hex não existe.
      // 2. O codigo_hex existe, mas já está associado a um CNPJ *diferente* do informado.
      // Em ambos os casos, o dispositivo não pode ser validado com este CNPJ.
      return res.status(404).json({ message: 'Serial do dispositivo não encontrado ou já associado a outro CNPJ. Consulte o administrador!' });
    }

    const dispositivo = result.rows[0];

    // Se chegou aqui, o dispositivo existe e o CNPJ é NULL ou corresponde.
    // Agora, atualizamos o dispositivo se o CNPJ ainda for NULL.
    if (dispositivo.cnpj === null) {
        const updateQuery = `
          UPDATE dispositivo_esp32
          SET cnpj = $1, data_registro = NOW()
          WHERE codigo_hex = $2
        `;
        const updateValues = [cnpj, codigoHex];
        await pool.query(updateQuery, updateValues);
    } else {
        // Se o CNPJ já estava preenchido e era o mesmo, não precisa atualizar.
    }


    // Retorna sucesso com os IDs necessários para o registro do usuário
    res.status(200).json({
      message: 'Dispositivo validado com sucesso!',
      dispositivoId: dispositivo.id,
      maquinaId: dispositivo.id_maquina // Pode ser NULL se não estiver associado a uma máquina ainda
    });

  } catch (error) {
    // Captura qualquer erro que ocorra dentro do try
    console.error('Erro detalhado ao validar dispositivo:', error); // Log mais detalhado no servidor
    // Retorna o erro detalhado para o cliente (Postman)
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