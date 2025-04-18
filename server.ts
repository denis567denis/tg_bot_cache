import express from 'express';
import { dbConnection } from './db/dbConnection';
import { botController } from './controller/bot.controller';
import * as dotenv from 'dotenv';
import { Categories } from './cors/enumAll';
import { botClientController } from './controller/bot.client.controller';

dotenv.config();

const app = express();
const PORT = Number.parseInt(process.env.PORT!);

(async () => {
    try {
        await dbConnection.connect();

        app.listen(PORT, async () => {
            (async () => {
              try {
                await dbConnection.connect();
                botController.start();
                botClientController.start();
                console.log('Bots is running...');
              } catch (err) {
                console.error('Error starting bot:', err);
                process.exit(1);
              }
            })();
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error('Error starting server:', err);
        process.exit(1);
    }
})();

process.on('SIGINT', async () => {
    console.log('Received SIGINT. Disconnecting from MongoDB...');
    await dbConnection.disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Disconnecting from MongoDB...');
    await dbConnection.disconnect();
    process.exit(0);
});