import { pool } from '../app.js';
import User from '../models/User.js';
// Não precisamos mais importar 'checkToken' ou 'jwt' aqui.

const UserFilterMetadataController = {
  // A função agora é muito mais simples.
  async getUserMachinesMetadata(req, res) {
    // O middleware 'checkToken' já validou e adicionou 'req.user'.
    const userId = req.user.id; 

    // A verificação de 'userId' ainda é uma boa prática.
    if (!userId) {
      return res.status(401).json({ message: 'Usuário não autenticado. ID não encontrado na requisição.' });
    }

    try {
      // 1. Obter o codigoHex do usuário logado
      const user = await User.findById(userId).select('codigoHex');
      if (!user || !user.codigoHex) {
        return res.status(404).json({ message: 'Usuário não encontrado ou sem dispositivo associado.' });
      }
      const userCodigoHex = user.codigoHex;

      // 2. Obter o CNPJ
      const cnpjResult = await pool.query(
        'SELECT cnpj FROM dispositivo_esp32 WHERE codigo_hex = $1',
        [userCodigoHex]
      );
      if (cnpjResult.rows.length === 0) {
        return res.status(404).json({ message: 'Dispositivo do usuário não encontrado.' });
      }
      const userCnpj = cnpjResult.rows[0].cnpj;

      // 3. Obter todos os dispositivos associados
      const devicesResult = await pool.query(
        'SELECT DISTINCT id_maquina, codigo_hex FROM dispositivo_esp32 WHERE cnpj = $1 AND id_maquina IS NOT NULL',
        [userCnpj]
      );

      const allowedMachineIds = devicesResult.rows.map(row => row.id_maquina);
      const allowedCodigoHexes = devicesResult.rows.map(row => row.codigo_hex);

      res.json({
        cnpj: userCnpj,
        allowedMachineIds,
        allowedCodigoHexes
      });

    } catch (error) {
      console.error('Erro ao buscar metadados de máquina do usuário:', error);
      res.status(500).json({ message: 'Erro interno ao buscar metadados de máquina.' });
    }
  }
};

export default UserFilterMetadataController;