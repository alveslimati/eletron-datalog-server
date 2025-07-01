import User from '../models/User.js';
import { pool } from '../app.js';

const MessageController = {
  // Função existente
  async getMessages(req, res) {
    const userId = req.user.id;
    try {
      const user = await User.findById(userId).select('codigoHex');
      if (!user || !user.codigoHex) {
        return;
      }
      const userCodigoHex = user.codigoHex;

      const cnpjResult = await pool.query(
        'SELECT cnpj FROM dispositivo_esp32 WHERE codigo_hex = $1',
        [userCodigoHex]
      );
      if (cnpjResult.rows.length === 0) {
        return res.status(404).json({ message: 'Dispositivo não encontrado ou não associado a um CNPJ.' });
      }
      const userCnpj = cnpjResult.rows[0].cnpj;

      const maquinasResult = await pool.query(
        'SELECT DISTINCT id_maquina FROM dispositivo_esp32 WHERE cnpj = $1 AND id_maquina IS NOT NULL',
        [userCnpj]
      );
      const allowedMachineIds = maquinasResult.rows.map(row => row.id_maquina);

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

 // Nova função para buscar mensagens por intervalo de datas
async getMessagesByDate(req, res) {
  try {
    const { startDate, endDate } = req.query; // Obtém os parâmetros de data do query string
    const userId = req.user.id;

    // Verifica se o usuário existe e obtém o códigoHex
    const user = await User.findById(userId).select("codigoHex");
    if (!user || !user.codigoHex) {
      return res.status(404).json({
        message: "Usuário do dispositivo não encontrado.",
      });
    }
    const userCodigoHex = user.codigoHex;

    // Busca o CNPJ associado ao dispositivo do usuário
    const cnpjResult = await pool.query(
      "SELECT cnpj FROM dispositivo_esp32 WHERE codigo_hex = $1",
      [userCodigoHex]
    );
    if (cnpjResult.rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Dispositivo não encontrado ou não associado a um CNPJ." });
    }
    const userCnpj = cnpjResult.rows[0].cnpj;

    // Busca os IDs das máquinas atribuídas ao dispositivo do usuário
    const maquinasResult = await pool.query(
      "SELECT DISTINCT id_maquina FROM dispositivo_esp32 WHERE cnpj = $1 AND id_maquina IS NOT NULL",
      [userCnpj]
    );
    const allowedMachineIds = maquinasResult.rows.map((row) => row.id_maquina);

    // Se nenhum parâmetro de data for informado, usar o dia atual
    const currentDate = new Date();
    const defaultStartDate = `${currentDate.toISOString().split("T")[0]}T00:00:00`; // Começo do dia
    const defaultEndDate = `${currentDate.toISOString().split("T")[0]}T23:59:59`; // Fim do dia

    const effectiveStartDate = startDate || defaultStartDate; // Define a data início
    const effectiveEndDate = endDate || defaultEndDate; // Define a data fim (pode ser opcional)

    // Consulta para obter mensagens dentro do intervalo de datas, ordenadas pela data mais recente
    const messagesResult = await pool.query(
      `SELECT * 
       FROM producao 
       WHERE timestamp BETWEEN $1 AND $2 
       AND maquina_id = ANY($3::int[])
       ORDER BY timestamp DESC`, // Ordena as mensagens pela data mais recente
      [effectiveStartDate, effectiveEndDate, allowedMachineIds]
    );

    res.json(messagesResult.rows); // Retorna as mensagens filtradas por data e máquina
  } catch (error) {
    console.error("Erro ao buscar mensagens por intervalo de datas:", error);
    res.status(500).json({
      message: `Erro interno ao buscar dados no intervalo: ${error.message}`,
    });
  }
},
};

export default MessageController;