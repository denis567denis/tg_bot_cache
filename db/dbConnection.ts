import mongoose from 'mongoose';
import * as dotenv from 'dotenv';

dotenv.config()

class DbConnection {
  private static instance: DbConnection;
  private uri: string;

  private constructor(uri: string) {
    this.uri = uri;
  }

  public static getInstance(uri: string): DbConnection {
    if (!DbConnection.instance) {
      DbConnection.instance = new DbConnection(uri);
    }
    return DbConnection.instance;
  }

  public async connect(): Promise<void> {
    try {
      await mongoose.connect(this.uri);
      console.log('Connected to MongoDB');
    } catch (err) {
      console.error('MongoDB connection error:', err);
      process.exit(1);
    }
  }

  public async disconnect(): Promise<void> {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

const mongoUri = process.env.MONGO_URI! ;
export const dbConnection = DbConnection.getInstance(mongoUri);