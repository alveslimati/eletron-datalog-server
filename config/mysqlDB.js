// src/config/mysqlDB.js
import mysql from 'mysql2/promise'; // Importa a versão com suporte a Promises
import dotenv from 'dotenv';

dotenv.config();

// Cria um "pool" de conexões. Isso é mais eficiente do que criar uma nova conexão a cada consulta.
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10, // Limite de conexões simultâneas
  queueLimit: 0
});

// Apenas para verificar se a conexão foi bem-sucedida ao iniciar o servidor
pool.getConnection()
  .then(connection => {
    console.log('Conectado ao banco de dados MySQL com sucesso!');
    connection.release(); // Libera a conexão de volta para o pool
  })
  .catch(err => {
    console.error('Erro ao conectar com o banco de dados MySQL:', err);
  });

export default pool;