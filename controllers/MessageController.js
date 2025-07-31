// src/controllers/MessageController.js

import User from '../models/User.js';
// --- IMPORTAÇÃO CORRIGIDA ---
// Remove a importação do app.js e importa diretamente do novo arquivo de configuração
import pool from '../config/mysqlDB.js';

const MessageController = {
  // Esta função não é mais usada no seu fluxo atual, mas vamos corrigi-la também.
  async getMessages(req, res) {
    const userId = req.user.id;
    try {
      // Lógica do Mongoose não muda
      const user = await User.findById(userId).select('codigoHex');
      if (!user || !user.codigoHex) {
        return res.status(404).json({ message: 'Usuário não encontrado.' });
      }
      const userCodigoHex = user.codigoHex;

      // --- CONSULTAS AJUSTADAS PARA MYSQL ---
      const [cnpjRows] = await pool.query(
        'SELECT cnpj FROM dispositivo_esp32 WHERE codigo_hex = ?',
        [userCodigoHex]
      );
      if (cnpjRows.length === 0) {
        return res.status(404).json({ message: 'Dispositivo não encontrado ou não associado a um CNPJ.' });
      }
      const userCnpj = cnpjRows[0].cnpj;

      const [maquinasRows] = await pool.query(
        'SELECT DISTINCT id_maquina FROM dispositivo_esp32 WHERE cnpj = ? AND id_maquina IS NOT NULL',
        [userCnpj]
      );
      const allowedMachineIds = maquinasRows.map(row => row.id_maquina);

      const allMessages = req.app.locals.messages || [];
      const filteredMessages = allMessages.filter(msg =>
        msg.maquina_id && allowedMachineIds.includes(msg.maquina_id)
      );

      res.json(filteredMessages);

    } catch (error) {
      console.error('Erro ao buscar e filtrar mensagens para o usuário:', error);
      res.status(500).json({ message: 'Erro interno ao buscar dados das máquinas.' });
    }
  },

  // --- FUNÇÃO PRINCIPAL CORRIGIDA ---
  async getMessagesByDate(req, res) {
    try {
      const { startDate, endDate, maquinaId, operadorId } = req.query; // Adicionado maquinaId e operadorId
      const userId = req.user.id;

      // Lógica do Mongoose não muda
      const user = await User.findById(userId).select("codigoHex");
      if (!user || !user.codigoHex) {
        return res.status(404).json({ message: "Usuário do dispositivo não encontrado." });
      }
      const userCodigoHex = user.codigoHex;

      const [cnpjRows] = await pool.query(
        "SELECT cnpj FROM dispositivo_esp32 WHERE codigo_hex = ?",
        [userCodigoHex]
      );
      if (cnpjRows.length === 0) {
        return res.status(404).json({ message: "Dispositivo não encontrado ou não associado a um CNPJ." });
      }
      const userCnpj = cnpjRows[0].cnpj;
      
      const [maquinasRows] = await pool.query(
        "SELECT DISTINCT id_maquina FROM dispositivo_esp32 WHERE cnpj = ? AND id_maquina IS NOT NULL",
        [userCnpj]
      );
      const allowedMachineIds = maquinasRows.map((row) => row.id_maquina);

      // Se o usuário não tem permissão para nenhuma máquina, retorna vazio.
      if (allowedMachineIds.length === 0) {
        return res.json([]);
      }
      const formatStartOfDay = (date) => {
        const d = new Date(date);
        d.setUTCHours(0, 0, 0, 0); // 00:00:00.000 UTC
        return d.toISOString();
      };

      const formatEndOfDay = (date) => {
        const d = new Date(date);
        d.setUTCHours(23, 59, 59, 999); // 23:59:59.999 UTC
        return d.toISOString();
      };
      // Tratamento de datas (início e fim)
      let effectiveStartDate = startDate ? formatStartOfDay(startDate) : null;
      let effectiveEndDate = endDate ? formatEndOfDay(endDate) : null;

      // Define a data padrão se `startDate` ou `endDate` não forem fornecidos
      if (!effectiveStartDate) {
        const today = Date.now();
        effectiveStartDate = formatStartOfDay(today); // 00:00 UTC-3 de hoje
      }
      if (!effectiveEndDate) {
        const today = Date.now();
        effectiveEndDate = formatEndOfDay(today); // 23:59 UTC-3 de hoje
      }
      // --- LÓGICA DA QUERY DINÂMICA PARA MYSQL ---
      let baseQuery = `SELECT * FROM producao WHERE timestamp BETWEEN ? AND ?`;
      
      // Os valores para a query
      const queryParams = [effectiveStartDate, effectiveEndDate];

      // Garante que o usuário só possa ver as máquinas que tem permissão
      baseQuery += ` AND maquina_id IN (?)`; // O '?' para IN aceita um array
      queryParams.push(allowedMachineIds);

      // Adiciona filtros opcionais se eles foram fornecidos na URL
      if (maquinaId) {
        baseQuery += ` AND maquina_id = ?`;
        queryParams.push(maquinaId);
      }
      if (operadorId) {
        baseQuery += ` AND operador_id = ?`;
        queryParams.push(operadorId);
      }
      
      baseQuery += ` ORDER BY timestamp ASC`;

      // Executa a query final
      const [messagesRows] = await pool.query(baseQuery, queryParams);

      res.json(messagesRows);
    } catch (error) {
      console.error("Erro ao buscar mensagens por intervalo de datas:", error);
      res.status(500).json({
        message: `Erro interno ao buscar dados no intervalo: ${error.message}`,
      });
    }
  }
};

export default MessageController;