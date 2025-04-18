import { Telegraf } from 'telegraf';
import { PostCacheModel } from '../models/PostCacheModel';
import { unifiedQueue, JobType } from '../services/queue.service';
import { UserVipModel } from '../models/UserVipModel';
import * as dotenv from 'dotenv';
import { Markup } from 'telegraf';
import { getPosts, savePosts } from '../services/storage.service';
import { CacheRate, Categories } from '../cors/enumAll';
import { updateDailyStats } from '../services/analiticUser.service';

dotenv.config();

interface BotConfig {
  telegramToken: string;
  deepseekKey: string;
}

interface NotificationJobData {
  cacheRate: string;
  category: string;
  idJob: string;
}

interface UserState {
  categories: string;
  cashbackRange: string;
}

class BotClientController {
  private bot: Telegraf;
  private users = new Map<number, UserState>();

  constructor(config: BotConfig) {
    this.bot = new Telegraf(config.telegramToken);
    this.initialize();
  }

  private initialize() {
    this.setupQueueWorker();
    this.setupCommandsForConfigUser();
    this.setupCommands();
  }

  private setupQueueWorker() {
    unifiedQueue.createWorker(
      JobType.NOTIFICATION,
      async (job) => {
        this.handleNotificationJob(job as { data: NotificationJobData })
      }
    );
  }

  private setupCommands() {
    this.bot.action(/^cacheRange:(.+)/, async (ctx) => {
      const userId = ctx.from.id;
      const cache = ctx.match[1];
      
      if (!this.users.has(userId)) {
        this.users.set(userId, { categories: '', cashbackRange: cache });
      }
    
      await ctx.answerCbQuery(`Выбрано: ${cache}`);
      await this.showCategorySelection(ctx);
    });

    this.bot.action(/^category:(.+)/, async (ctx) => {
      const userId = ctx.from.id;
      const category = Categories[ctx.match[1] as keyof typeof  Categories]
      
      if (!this.users.has(userId)) {
        this.users.set(userId, { categories: category, cashbackRange: CacheRate.first });
      }
      
      const userState = this.users.get(userId)!;
      userState.categories = category;
    
      await ctx.answerCbQuery(`Выбрана категория: ${category}`);
      await this.showFinalConfirmation(ctx);
    });

    this.bot.action(/^view_offers:(.+);cahce:(.+);idjob:(.+)/, async (ctx) => {
      const category = ctx.match[1];
      await updateDailyStats('' + ctx.from.id);
      const cahce = ctx.match[2];
      const idJob = ctx.match[3];
      await this.showOffers(ctx, category, cahce, idJob);
    });

    this.bot.action(/^prev_post;index:(.+);category:(.+);cahce:(.+);idjob:(.+)/, async (ctx) => {
      let index = Number(ctx.match[1]);
      await updateDailyStats('' + ctx.from.id);
      const category = ctx.match[2];
      const cahce = ctx.match[3];
      const idJob = ctx.match[4];
      
      const { caption, reply_markup, photoId } = await this.getMessageWithButtons(category, cahce, index, idJob);
      await ctx.editMessageMedia({
        type: 'photo',
        media: photoId,
        caption: caption,
      }, {
        reply_markup: reply_markup
      }
      );
  });
  
  this.bot.action(/^next_post;index:(.+);category:(.+);cahce:(.+);idjob:(.+)/, async (ctx) => {
      const userId = ctx.from.id;
      await updateDailyStats('' + userId);
      let index = Number(ctx.match[1]);
      const category = ctx.match[2];
      const cahce = ctx.match[3];
      const idJob = ctx.match[4];

      const { caption, reply_markup, photoId } = await this.getMessageWithButtons(category, cahce, index, idJob);
      await ctx.editMessageMedia({
        type: 'photo',
        media: photoId,
        caption: caption,
      }, {
        reply_markup: reply_markup
      }
      );
  });
  }

  private setupCommandsForConfigUser() {
    this.bot.command('start', async (ctx) => {
        try {
          const welcomeText = `
👋 Привет!
Добро пожаловать в КЭШмаркет - отборный кэшбэк!
Ваш личный помощник в мире КЭШбэк предложений!

У нас больше 200+ чатов с объявлениями и отзывами ‼

*Как это работает:*
1⃣ Выберите категории товаров
2⃣ Настройте желаемый процент кэшбэка
3⃣ Получайте уведомления о лучших предложениях
4⃣ Получай быстрее всех уведомления о товарах с огромными скидками и кэшбэком до 100%!`;
          await ctx.reply(welcomeText, Markup.keyboard([
            '➕ Добавить',
            '🗑 Удалить',
           '📊 Мои настройки',
          ]).resize());
          await this.showCacheSelection(ctx);
        } catch (error: any) {
          console.error('Ошибка при отправке сообщения:', error);
        }

    });

    this.bot.on('message', async (ctx) => {
      const messageText = ctx.text;
    
      if (messageText === '➕ Добавить') {
        await updateDailyStats('' + ctx.from.id);
        await this.showCacheSelection(ctx);
      };
      if (messageText === '🗑 Удалить') {
        await updateDailyStats('' + ctx.from.id);
        await this.removeAction(ctx)
      } ;
      if (messageText === '📊 Мои настройки') {
        await updateDailyStats('' + ctx.from.id);
        await this.showSetting(ctx)
      }
    });
    

    this.bot.action(/^removeCache:(.+)/, async (ctx) => {
      const userId = ctx.from.id;
      let index = Number(ctx.match[1]);
      const user = await UserVipModel.findOne({ idTg: String(userId) });
      user?.subscribeEvent.splice(index,1);
      user?.save();
      await ctx.replyWithMarkdown(
        `*Успешно удален*\n`
      );
  });
  }

  private async showSetting(ctx: any) {
    const user = await UserVipModel.findOne({ idTg: String(ctx.from.id) });
    let message = user?.subscribeEvent.reduce((acc,value)=>{
      const events1 = value.split(';');
      acc+= `Категория: ${events1[0].split(':')[1]} , с кешом: ${events1[1].split(':')[1]}%\n`;
      return acc;
    },``);
    await ctx.reply(
      `⚙️ *Ваши текущие настройки:*\n` +
      message
    );
  }

  private async removeAction(ctx: any) {
    const userId = ctx.from.id;
    const user = await UserVipModel.findOne({idTg: userId})
    if(!user){
      return;
    }
    let markubButton = user.subscribeEvent.reduce((acc,value,index)=>{
      const events1 = value.split(';');
      acc.push([Markup.button.callback(`Категория: ${events1[0].split(':')[1]} , с кешом: ${events1[1].split(':')[1]}`, `removeCache:${index}`)])
      return acc;
    }, [] as Array<Array<any>>)
    const categoriesKeyboard = Markup.inlineKeyboard(markubButton);
  
    await ctx.replyWithMarkdown(
      '💰 *Выберите вариант который хотите удалить:*',
      categoriesKeyboard,
    );
  }

  private async showCacheSelection(ctx: any) {
    const categoriesKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('30-70% ', `cacheRange:${CacheRate.first}`)],
      [Markup.button.callback('70-80% ', `cacheRange:${CacheRate.second}`)],
      [Markup.button.callback('80-100% ', `cacheRange:${CacheRate.third}`)],
      [Markup.button.callback('Только 100% кэшбэк', `cacheRange:${CacheRate.free}`)],
    ]);
  
    await ctx.replyWithMarkdown(
      '💰 *Выберите интересующие кеши:*',
      categoriesKeyboard,
    );

  }

  private async showCategorySelection(ctx: any) {
    const categoriesKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Электроника 🔌💻', `category:electronics`)],
      [Markup.button.callback('Одежда и обувь 👗👠', `category:clothingAndFootwear`)],
      [Markup.button.callback('Красота и здоровье 💄🧴', `category:beautyAndHealth`)],
      [Markup.button.callback('Дом и сад 🏡🌿', `category:homeAndGarden`)],
      [Markup.button.callback('Детские товары 🧸👶', `category:childrenGoods`)],
      [Markup.button.callback('Спорт и отдых ⚽🧘', `category:sportsAndRecreation`)],
      [Markup.button.callback('Автотовары 🚗🔧', `category:automotiveGoods}`)],
      [Markup.button.callback('Книги и канцелярия 📚✏️', `category:BooksAndStationery`)],
      [Markup.button.callback('Зоотовары 🐶🐱', `category:petSupplies`)],
      [Markup.button.callback('Продукты питания 🍎🥖', `category:food`)],
      [Markup.button.callback('Цифровые товары 💾🎮', `category:digitalGoods`)],
      [Markup.button.callback('Хобби и творчество 🎨🧵', `category:hobbiesAndCreativity`)],
      [Markup.button.callback('Люкс-товары 💎🕶️', `category:luxuryGoods}`)],
      [Markup.button.callback('Стройматериалы и инструменты 🧱🔨', `category:buildingMaterialsAndTools`)],
      [Markup.button.callback('Товары для взрослых (18+) 🔞🎭', `category:adultGoods`)],
    ]);
    await ctx.replyWithMarkdown(
      '🎯 *Выберите интересующие категории:*',
      categoriesKeyboard
    );
  }

  private async showFinalConfirmation(ctx: any) {
    const userId = ctx.from.id;
    const userState = this.users.get(userId)!;
  
    const summaryText = `
  ⚡ *Ваши настройки:*
  
  ▫️ *Категории:* ${userState.categories}
  ▫️ *Кэшбэк:* ${userState.cashbackRange}%
  
  Начинаем мониторинг! 🚀
    `;
  
    await ctx.replyWithMarkdown(summaryText);
    await this.saveUserVip(userId, `category:${userState.categories};cacheRate:${userState.cashbackRange}`);
  }

  private async getMessageWithButtons (category: string, cahceRate: string, index: number, idJob: string) {
    const offers = await getPosts(Categories[category  as keyof typeof  Categories], cahceRate, idJob);
    const nameSalesNick = offers[index].salesman[0] !== '@' ? offers[index].salesman : offers[index].salesman.slice(1)
    return {
      photoId: offers[index].photoId,
      caption: `🔥 Пост ${index + 1}/${offers.length}\n\n` +
              `${offers[index].message}`,
      reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback('⬅️', `prev_post;index:${index === 0? offers.length - 1: index-1};category:${category};cahce:${cahceRate};idjob:${idJob}`),
              Markup.button.url(`@${nameSalesNick}`, `https://${process.env.BOT_REDIRECT}?start=${nameSalesNick}`),
              Markup.button.callback('➡️', `next_post;index:${index === offers.length - 1? 0: index+1};category:${category};cahce:${cahceRate};idjob:${idJob}`)
            ]
        ]).reply_markup
    };
};

  private async showOffers(ctx: any, category: string, cahceRate: string, idJob: string) {
    try {
      const offers = await getPosts(Categories[category as keyof typeof Categories], cahceRate, idJob)
      if (offers.length === 0) {
        await ctx.reply(`😞 Пока нет активных предложений в категории ${category}`);
        return;
      }
      let message = `🔥 Пост ${1}/${offers.length}:\n\n`;
      message+=offers[0].message;

      const nameSalesNick = offers[0].salesman[0] !== '@' ? offers[0].salesman : offers[0].salesman.slice(1);
      await ctx.replyWithPhoto(offers[0].photoId, {
        caption: message,
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback('⬅️', `prev_post;index:${offers.length-1};category:${category};cahce:${cahceRate};idjob:${idJob}`),
          Markup.button.url(`@${nameSalesNick}`, `https://${process.env.BOT_REDIRECT}?start=${nameSalesNick}`),
          Markup.button.callback('➡️', `next_post;index:${1};category:${category};cahce:${cahceRate};idjob:${idJob}`)
  ]).reply_markup
      });
      
    } catch (error) {
      console.error('Error showing offers:', error);
      await ctx.reply('⚠️ Произошла ошибка при загрузке предложений');
    }
  }


  public async sendNotifications(cacheRate: string, category: string, idJob: string) {
    unifiedQueue.addJob(
      JobType.NOTIFICATION,
      {
        category,
        cacheRate,
        idJob
      }
    );
}

  private async handleNotificationJob(job: { data: NotificationJobData }) {
    try {
      const subscribeEvent = `category:${job.data.category};cacheRate:${job.data.cacheRate}`;
      const cacheRate = job.data.cacheRate.split('-')
      const offers = await PostCacheModel.aggregate([
        {
          $match: {
            category: { $in: [job.data.category] },
            cache: { 
              $gte: +cacheRate[0],
              $lte: +cacheRate[1]
            }
          }
        },
        {
          $sort: {
            createdAt: -1 
          }
        },
        {
          $limit: 10
        }
      ]);
      await savePosts(offers,job.data.category, job.data.cacheRate, job.data.idJob );
      const subscribers = await UserVipModel.find({ subscribeEvent: {
        $in: subscribeEvent
      } });

      for await (let sub of subscribers) {

        await this.bot.telegram.sendMessage(
          sub.idTg,
          `🔥🔥🔥 вышло топ 10 предложений по ${job.data.category} .`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: 'Посмотреть предложения',
                    callback_data: `view_offers:${this.getKeyByValue(Categories,job.data.category)};cahce:${job.data.cacheRate};idjob:${job.data.idJob}`
                  }
                ]
              ]
            }
          }
        );
        console.log(`Notification sent to ${sub.idTg}`);
      }
    } catch (error) {
        console.log(`Notification failed for :`, error);
      throw error;
    }
  }

  private async saveUserVip(idTg: string, subscribeEvent: string) {
    await updateDailyStats('' + idTg);
    const user = await UserVipModel.findOneAndUpdate({
      idTg
    },       {
      $addToSet: { subscribeEvent },
      $setOnInsert: { 
        createdAt: new Date(),
        idTg 
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    });
    this.users.delete(+idTg);
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

  public async start() {
    this.bot.launch();
    console.log('Bot client started');
  }
}

export const botClientController = new BotClientController({
    telegramToken: process.env.API_BOT_CLIENT!,
    deepseekKey: process.env.DEEPSEEK_API_KEY!
  });
  