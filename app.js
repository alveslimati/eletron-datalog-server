import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import mqttHandler from './mqttHandler.js';


dotenv.config();

const app = express();

// Middleware for CORS
import cors from 'cors';

const allowedOrigins = [
  'http://localhost:5173', // Desenvolvimento local
  'https://main.d1o387bagj6v4q.amplifyapp.com', // Produção no Amplify
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      // Permitir a requisição
      callback(null, true);
    } else {
      // Bloqueia a requisição
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Habilita envio de cookies/autenticação
  optionsSuccessStatus: 200, // Para navegadores mais antigos no preflight
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // Permitir esses métodos
  allowedHeaders: ['Content-Type', 'Authorization'], // Permitir esses cabeçalhos
};

// Apply middleware de CORS
app.use(cors(corsOptions));

// Habilita preflight requests
app.options('*', cors(corsOptions));
app.use(express.json()); // Middleware para JSON

// Conecta ao banco de dados
connectDB();

// Configura MQTT (broker)
mqttHandler(app); // Configuração de mensagens em tempo real

// Configuração das rotas
app.use('/auth', userRoutes); // Rota de autenticação de usuário
app.use('/api/mensagens', messageRoutes); // Rota de dados MQTT

// Endpoint inicial para verificar status
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Hello World!' });
});

// Inicia o servidor
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});