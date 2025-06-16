import User from '../models/User.js';
import { pool } from '../app.js';

const MessageController = {
  // Função existente
  async getMessages(req, res) {
    const userId = req.user.id;
    try {
      const user = await User.findById(userId).select('codigoHex');
      if (!user || !user.codigoHex) {
        return res.status(404).json({ message: 'Usuário ou dispositivo não encontrado.' });
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

  // Nova função para buscar mensagens por data
 async getMessagesByDate(req, res) {
  try {
    console.log("Iniciando método getMessagesByDate.");

    const { date } = req.query;
    console.log("Data recebida:", date);

    const userId = req.user.id;
    console.log("ID do usuário:", userId);

    const user = await User.findById(userId).select('codigoHex');
    if (!user || !user.codigoHex) {
      return res.status(404).json({ message: 'Usuário do dispositivo não encontrado.' });
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
    
    // Nova consulta para obter mensagens por data específica
    const messagesResult = await pool.query(
      'SELECT * FROM producao WHERE DATE(timestamp) = $1 AND maquina_id = ANY($2::int[])',
      [date, allowedMachineIds]
    );

    console.log("Mensagens encontradas:", messagesResult.rows.length);
    res.json(messagesResult.rows);

  } catch (error) {
    console.error('Erro ao buscar mensagens por data:', error);
    res.status(500).json({ message: 'Erro interno ao buscar dados por data.' + error});
  }
},
};

export default MessageController;