import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import userRoutes from './routes/userRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import mqttHandler from './mqttHandler.js';


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