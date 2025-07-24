import { pool } from '../app.js';
import User from '../models/User.js';

const UserFilterMetadataController = {
  async getUserMachinesMetadata(req, res) {
    const userId = req.user.id; // O ID do usuário deve vir do seu middleware de autenticação (ex: JWT)

    if (!userId) {
      return res.status(401).json({ message: 'Usuário não autenticado.' });
    }

    try {
      // 1. Obter o codigoHex do usuário logado
      // Assumimos que o modelo User tem um método findById e uma propriedade codigoHex
      const user = await User.findById(userId).select('codigoHex');
      if (!user || !user.codigoHex) {
        return res.status(404).json({ message: 'Usuário não encontrado ou sem dispositivo associado.' });
      }
      const userCodigoHex = user.codigoHex;

      // 2. Obter o CNPJ associado ao codigoHex do usuário
      const cnpjResult = await pool.query(
        'SELECT cnpj FROM dispositivo_esp32 WHERE codigo_hex = $1',
        [userCodigoHex]
      );
      if (cnpjResult.rows.length === 0) {
        return res.status(404).json({ message: 'Dispositivo do usuário não encontrado ou não associado a um CNPJ.' });
      }
      const userCnpj = cnpjResult.rows[0].cnpj;

      // 3. Obter todos os id_maquina e codigo_hex (numero_serial) para aquele CNPJ
      const devicesResult = await pool.query(
        'SELECT DISTINCT id_maquina, codigo_hex FROM dispositivo_esp32 WHERE cnpj = $1 AND id_maquina IS NOT NULL',
        [userCnpj]
      );

      const allowedMachineIds = devicesResult.rows.map(row => row.id_maquina);
      const allowedCodigoHexes = devicesResult.rows.map(row => row.codigo_hex); // Estes são os "numero_serial" do HiveMQ

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