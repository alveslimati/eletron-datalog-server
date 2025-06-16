// models/User.js
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email:      { type: String, required: true, unique: true, trim: true },
  password:   { type: String, required: true },
  nomeEmpresa:{ type: String },
  codigoHex:  { type: String, unique: true },	
  lastLogin:  { type: Date, default: null },
  charts:     {
    type: [
      {
        id: Number,               
        title: String,
        chartType: String,
        dataKey: String
      }
    ],
    default: [],
  }
});

const User = mongoose.model('User', UserSchema);
export default User;