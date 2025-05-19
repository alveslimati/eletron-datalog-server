// controllers/MessageController.js
import User from '../models/User.js'; // Importa o modelo de usuário do MongoDB
// Importa o pool de conexão do PostgreSQL.
// Certifique-se de que o pool é exportado de onde ele é criado (ex: app.js ou config/db.js)
// Exemplo: No seu app.js, adicione `export const pool = new Pool({...});`
import { pool } from '../app.js'; // Ajuste o caminho conforme onde seu pool está definido e exportado

const MessageController = {
  async getMessages(req, res) {
    // O ID do usuário autenticado está disponível em req.user.id (graças ao middleware checkToken)
    const userId = req.user.id;
    console.log(`Usuário autenticado (ID: ${userId}) solicitou mensagens.`);

    try {
      // 1. Buscar o usuário no MongoDB para obter o codigoHex
      const user = await User.findById(userId).select('codigoHex'); // Seleciona apenas o campo codigoHex
      if (!user) {
        console.warn(`Usuário com ID ${userId} não encontrado no MongoDB.`);
        return res.status(404).json({ message: 'Usuário não encontrado.' });
      }
      if (!user.codigoHex) {
         console.warn(`Usuário com ID ${userId} não possui codigoHex associado.`);
         return res.status(400).json({ message: 'Usuário não possui dispositivo associado.' });
      }
      const userCodigoHex = user.codigoHex;
      console.log(`CodigoHex do usuário ${userId}: ${userCodigoHex}`);


      // 2. Buscar o CNPJ associado a este codigoHex na tabela dispositivo_esp32 (PostgreSQL)
      const cnpjResult = await pool.query(
        'SELECT cnpj FROM dispositivo_esp32 WHERE codigo_hex = $1',
        [userCodigoHex]
      );

      if (cnpjResult.rows.length === 0 || !cnpjResult.rows[0].cnpj) {
        console.warn(`CodigoHex ${userCodigoHex} não encontrado ou sem CNPJ associado em dispositivo_esp32.`);
        // Dependendo da sua regra de negócio, pode retornar 404 ou apenas dados vazios
        return res.status(404).json({ message: 'Dispositivo não encontrado ou não associado a um CNPJ.' });
      }
      const userCnpj = cnpjResult.rows[0].cnpj;
      console.log(`CNPJ associado ao CodigoHex ${userCodigoHex}: ${userCnpj}`);


      // 3. Buscar TODOS os id_maquina associados a este CNPJ na tabela dispositivo_esp32
      const maquinasResult = await pool.query(
        'SELECT DISTINCT id_maquina FROM dispositivo_esp32 WHERE cnpj = $1 AND id_maquina IS NOT NULL',
        [userCnpj]
      );

      const allowedMachineIds = maquinasResult.rows.map(row => row.id_maquina);
      console.log(`Máquinas permitidas para o CNPJ ${userCnpj}:`, allowedMachineIds);

      if (allowedMachineIds.length === 0) {
          console.log(`Nenhuma máquina associada ao CNPJ ${userCnpj}. Retornando dados vazios.`);
          return res.json([]); // Retorna um array vazio se não houver máquinas associadas
      }

      // 4. Filtrar as mensagens recebidas do MQTT
      const allMessages = req.app.locals.messages || [];
      console.log(`Total de mensagens MQTT recebidas (em memória): ${allMessages.length}`);

      // Filtra as mensagens para incluir apenas aquelas cujo maquina_id está na lista permitida
      const filteredMessages = allMessages.filter(msg =>
        msg.maquina_id && allowedMachineIds.includes(msg.maquina_id)
      );
      console.log(`Total de mensagens filtradas para o usuário ${userId}: ${filteredMessages.length}`);


      // 5. Retornar as mensagens filtradas
      res.json(filteredMessages);

    } catch (error) {
      console.error('Erro ao buscar e filtrar mensagens para o usuário:', error);
      res.status(500).json({ message: 'Erro interno ao buscar dados das máquinas: ' + error.message });
    }
  },
};

export default MessageController;