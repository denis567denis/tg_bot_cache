import { Telegraf } from 'telegraf';
import { PostCacheModel } from '../models/PostCacheModel';
import { DeepSeekService } from '../services/deepseek.service';
import { PostCountCategoryModel } from '../models/PostCountCategoryModel';
import { unifiedQueue, JobType } from '../services/queue.service';
import { getPosts, savePosts } from '../services/storage.service';
import * as dotenv from 'dotenv';
import { CacheRate, CatAndCountPostBeforeNot, Categories } from '../cors/enumAll';
import { botClientController } from './bot.client.controller';

dotenv.config();

interface BotConfig {
  telegramToken: string;
  deepseekKey: string;
}

interface MessageProcessingData {
    text: string;
    photoId: string;
  }

class BotController {
  private bot: Telegraf;
  private deepseek: DeepSeekService;
  private usedNumbers = new Set();

  constructor(config: BotConfig) {
    this.bot = new Telegraf(config.telegramToken);
    this.deepseek = new DeepSeekService(config.deepseekKey);
    this.initialize();
  }

  private initialize() {
    this.setupQueueWorker();
    this.setupMessageHandler();
  }

  private setupQueueWorker() {
    unifiedQueue.createWorker(
        JobType.MESSAGE_PROCESSING,
        async (job) => this.processMessage(job as { data: MessageProcessingData }),
      );
  }

  private setupMessageHandler() {
    this.bot.on('photo', async (ctx) => {
      try {
        if(ctx.message.caption && ctx.message.photo.length > 0) {
          await unifiedQueue.addJob(
            JobType.MESSAGE_PROCESSING,
            {
              text: ctx.message.caption,
              photoId: ctx.message.photo.pop()?.file_id,
            }
          );
        }
      } catch (error) {
        console.log('Message handling error:', error);
      }
    });
  }

  public async processMessage(job: { data: MessageProcessingData }) {
    try {
      const { text, photoId } = job.data;
      const analysis: any = await this.deepseek._sendAnalysisRequest(text);
      
      if (analysis?.provider && analysis?.percentage && analysis?.category) {
        await this.saveCashbackData(text, photoId, analysis);
        await this.updateCategoryCount(analysis.percentage, analysis.category);
      }
    } catch (error) {
      console.log('Message processing error:', error);
    }
  }

  private async saveCashbackData(message: string, photoId: string, data: { provider: string; percentage: number, category: string[] }) {
    const cashbackRecord = new PostCacheModel({
      salesman: data.provider,
      cache: data.percentage,
      category: data.category,
      photoId,
      message
    });

    await cashbackRecord.save();
  }

  private async updateCategoryCount(cahce: number, category: string) {
    let cacheRate = '';
    for(let cahceKey in CacheRate) {
      if(cahceKey === 'free') {
        if(cahce == 100) {
          cacheRate = cahceKey;
          continue;
        }
      }
      let rate = CacheRate[cahceKey as keyof typeof CacheRate].split('-');
      if(cahce >= +rate[0] && cahce < +rate[1]){
        cacheRate = CacheRate[cahceKey as keyof typeof CacheRate];
      }
    }
    const updatedStat = await PostCountCategoryModel.findOneAndUpdate(
      { 
      category,
      cacheRate
    },
      { $inc: { postCount: 1 } },
      { upsert: true, new: true }
    );

    if (updatedStat.postCount >= CatAndCountPostBeforeNot[this.getKeyByValue(Categories, category) as keyof typeof CatAndCountPostBeforeNot]) {
      await botClientController.sendNotifications(cacheRate, category, '' + this.generateUniqueFourDigitNumber(this.usedNumbers));
      await PostCountCategoryModel.updateOne(
        { 
          cacheRate,
          category, 
        },
        { postCount: 0 }
      );
    }
  }

  private getKeyByValue(enumObj: any, value: string): string | undefined {
    const keys = Object.keys(enumObj) as Array<keyof typeof enumObj>;
    for (const key of keys) {
        if (enumObj[key] === value) {
            return key as string;
        }
    }
    return undefined;
}

  private generateUniqueFourDigitNumber(existingNumbers = new Set()) {
    let number;
    do {
      number = Math.floor(Math.random() * (9999 - 1000 + 1)) + 100;
    } while (existingNumbers.has(number));
    existingNumbers.add(number);
  
    return number;
  }

  public start() {
    this.bot.launch();
    console.log('Bot started');
  }
}

export const botController = new BotController({
    telegramToken: process.env.API_BOT!,
    deepseekKey: process.env.DEEPSEEK_API_KEY!
  });
  