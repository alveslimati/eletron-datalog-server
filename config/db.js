import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config(); // Carrega as variáveis de ambiente do .env

const connectDB = async () => {
  try {
    mongoose.connect(`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@eletron-cluster.frjfdfp.mongodb.net/datalog?retryWrites=true&w=majority&appName=eletron-cluster`).then().catch((err) => {console.log(err)});

    console.log('MongoDB connected!');
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1); // Encerra a aplicação em caso de erro no banco
  }
};

export default connectDB;