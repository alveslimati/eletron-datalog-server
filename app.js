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
const corsOptions = {
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "DELETE"],
};
app.use(cors(corsOptions));
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