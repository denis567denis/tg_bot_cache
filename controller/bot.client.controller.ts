import { Input, Telegraf } from 'telegraf';
import { PostCacheModel } from '../models/PostCacheModel';
import { unifiedQueue, JobType } from '../services/queue.service';
import { UserVipModel } from '../models/UserVipModel';
import * as dotenv from 'dotenv';
import { Markup } from 'telegraf';
import { getPosts, savePosts } from '../services/storage.service';
import { CacheRate, CatAndCountPostBeforeNot, Categories } from '../cors/enumAll';
import { updateDailyStats } from '../services/analiticUser.service';
import axios from 'axios';

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
        await this.handleNotificationJob(job as { data: NotificationJobData })
      }
    );
  }

  private setupCommands() {
    this.bot.action(/^cacheRange:(.+)/, async (ctx) => {
      const userId = ctx.from.id;
      const cache = ctx.match[1].split(';');
      
      if (!this.users.has(userId)) {
        this.users.set(userId, { categories: '', cashbackRange: cache[0] });
      }
      else {
        const userState = this.users.get(userId)!;
        userState.cashbackRange = cache[0];
      }
    
      await ctx.answerCbQuery(`Выбрано: ${cache}`);
      await this.showCategorySelection(ctx, cache[1]);
    });

    this.bot.action(/^category:(.+)/, async (ctx) => {
      const userId = ctx.from.id;
      const categoruFromstr = ctx.match[1].split(';')
      const category = Categories[categoruFromstr[0] as keyof typeof  Categories]
      
      if (!this.users.has(userId)) {
        this.users.set(userId, { categories: category, cashbackRange: CacheRate.first });
      }
      
      const userState = this.users.get(userId)!;
      userState.categories = category;
    
      await ctx.answerCbQuery(`Выбрана категория: ${category}`);
      if(categoruFromstr[1] === 'true') {
        await this.showOffers(ctx, this.getKeyByValue(Categories,userState.categories)!, userState.cashbackRange, 'true');
      }
      else {
        await this.showFinalConfirmation(ctx);
      }
    });

    this.bot.action(/^view_offers:(.+);cahce:(.+);idjob:(.+)/, async (ctx) => {
      const category = ctx.match[1];
      await updateDailyStats('' + ctx.from.id);
      const cahce = ctx.match[2];
      const idJob = ctx.match[3];
      await this.showOffers(ctx, category, cahce, idJob);
    });

    this.bot.action(/^p;i:(.+);cat:(.+);cahce:(.+);id:(.+)/, async (ctx) => {
      let index = Number(ctx.match[1]);
      await updateDailyStats('' + ctx.from.id);
      const category = ctx.match[2];
      const cahce = ctx.match[3];
      const idJob = ctx.match[4];
      
      const { caption, reply_markup, photoId } = await this.getMessageWithButtons(category, cahce, index, idJob);
      await ctx.editMessageMedia({
        type: 'photo',
        media: Input.fromURLStream(photoId!),
        caption: caption,
      }, {
        reply_markup: reply_markup
      }
      );
  });
  
  this.bot.action(/^n;i:(.+);cat:(.+);cahce:(.+);id:(.+)/, async (ctx) => {
      const userId = ctx.from.id;
      await updateDailyStats('' + userId);
      let index = Number(ctx.match[1]);
      const category = ctx.match[2];
      const cahce = ctx.match[3];
      const idJob = ctx.match[4];

      const { caption, reply_markup, photoId } = await this.getMessageWithButtons(category, cahce, index, idJob);
      await ctx.editMessageMedia({
        type: 'photo',
        media: Input.fromURLStream(photoId!),
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
           '🔎 Посмотреть товар'
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
      if(messageText === '🔎 Посмотреть товар') {
        await updateDailyStats('' + ctx.from.id);
        await this.showCacheSelection(ctx, 'true');
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

  private async showCacheSelection(ctx: any, findCat?: string) {
    const categoriesKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('30-70% ', `cacheRange:${CacheRate.first};${findCat}`)],
      [Markup.button.callback('70-80% ', `cacheRange:${CacheRate.second};${findCat}`)],
      [Markup.button.callback('80-100% ', `cacheRange:${CacheRate.third};${findCat}`)],
      [Markup.button.callback('Только 100% кэшбэк', `cacheRange:${CacheRate.free};${findCat}`)],
    ]);
  
    await ctx.replyWithMarkdown(
      '💰 *Выберите интересующие кеши:*',
      categoriesKeyboard,
    );

  }

  private async showCategorySelection(ctx: any, findCat?: any) {
    const categoriesKeyboard = Markup.inlineKeyboard([
      [Markup.button.callback('Электроника 🔌💻', `category:electronics;${findCat}`)],
      [Markup.button.callback('Одежда и обувь 👗👠', `category:clothingAndFootwear;${findCat}`)],
      [Markup.button.callback('Красота и здоровье 💄🧴', `category:beautyAndHealth;${findCat}`)],
      [Markup.button.callback('Дом и сад 🏡🌿', `category:homeAndGarden;${findCat}`)],
      [Markup.button.callback('Детские товары 🧸👶', `category:childrenGoods;${findCat}`)],
      [Markup.button.callback('Спорт и отдых ⚽🧘', `category:sportsAndRecreation;${findCat}`)],
      [Markup.button.callback('Автотовары 🚗🔧', `category:automotiveGoods;${findCat}`)],
      [Markup.button.callback('Книги и канцелярия 📚✏️', `category:BooksAndStationery;${findCat}`)],
      [Markup.button.callback('Зоотовары 🐶🐱', `category:petSupplies;${findCat}`)],
      [Markup.button.callback('Продукты питания 🍎🥖', `category:food;${findCat}`)],
      [Markup.button.callback('Цифровые товары 💾🎮', `category:digitalGoods;${findCat}`)],
      [Markup.button.callback('Хобби и творчество 🎨🧵', `category:hobbiesAndCreativity;${findCat}`)],
      [Markup.button.callback('Люкс-товары 💎🕶️', `category:luxuryGoods;${findCat}`)],
      [Markup.button.callback('Стройматериалы и инструменты 🧱🔨', `category:buildingMaterialsAndTools;${findCat}`)],
      [Markup.button.callback('Товары для взрослых (18+) 🔞🎭', `category:adultGoods;${findCat}`)],
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
    const urlPhoto = await this.getPhotoUrlById(offers[index].photoId);
    return {
      photoId: urlPhoto,
      caption: `🔥 Пост ${index + 1}/${offers.length}\n\n` +
              `${offers[index].message}`,
      reply_markup: Markup.inlineKeyboard([
            [
              Markup.button.callback('⬅️', `p;i:${index === 0? offers.length - 1: index-1};cat:${category};cahce:${cahceRate};id:${idJob}`),
              Markup.button.url(`@${nameSalesNick}`, `https://${process.env.BOT_REDIRECT}?start=${nameSalesNick}`),
              Markup.button.callback('➡️', `n;i:${index === offers.length - 1? 0: index+1};cat:${category};cahce:${cahceRate};id:${idJob}`)
            ]
        ]).reply_markup
    };
};

private async findAndSaveAllOffers(cacheRateOffer: string, category: string) {
  const cacheRate = cacheRateOffer.split('-');
  let cacheMatch: Object | number = {};
  if(cacheRate.length>1) {
    cacheMatch= { 
      $gte: +cacheRate[0],
      $lte: +cacheRate[1]
    }
  }
  else {
    cacheMatch = 100;
  }


  const offers = await PostCacheModel.aggregate([
    {
      $match: {
        category: { $in: [category] },
        cache: cacheMatch,
      }
    },
    {
      $sort: {
        createdAt: -1 
      }
    }
  ]);
  await savePosts(offers, category, cacheRateOffer, 'true' );
}

  private async showOffers(ctx: any, category: string, cahceRate: string, idJob: string) {
    try {
      const categoryForEvent = Categories[category as keyof typeof Categories];
      let offers =  null;
        if(idJob==='true') {
          await this.findAndSaveAllOffers(cahceRate, categoryForEvent);
        }

      offers = await getPosts(categoryForEvent, cahceRate, idJob);

      if (!offers || offers.length === 0) {
        await ctx.reply(`😞 Пока нет активных предложений в категории ${category}`);
        return;
      }
      let message = `🔥 Пост ${1}/${offers.length}:\n\n`;
      message+=offers[0].message;

      const urlPhoto = await this.getPhotoUrlById(offers[0].photoId);

      const nameSalesNick = offers[0].salesman[0] !== '@' ? offers[0].salesman : offers[0].salesman.slice(1);
      await ctx.replyWithPhoto(Input.fromURLStream(urlPhoto!), {
        caption: message,
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback('⬅️', `p;i:${offers.length-1};cat:${category};cahce:${cahceRate};id:${idJob}`),
          Markup.button.url(`@${nameSalesNick}`, `https://${process.env.BOT_REDIRECT}?start=${nameSalesNick}`),
          Markup.button.callback('➡️', `n;i:${1};cat:${category};cahce:${cahceRate};id:${idJob}`)
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
      },
      1
    );
}

  private async handleNotificationJob(job: { data: NotificationJobData }) {
    try {
      const subscribeEvent = `category:${job.data.category};cacheRate:${job.data.cacheRate === '100' ? 100 : job.data.cacheRate}`;
      const cutNubmer = CatAndCountPostBeforeNot[this.getKeyByValue(Categories, job.data.category) as keyof typeof CatAndCountPostBeforeNot];
      const cacheRate = job.data.cacheRate.split('-')
      let cacheMatch: Object | number = {};
      if(cacheRate.length>1) {
        cacheMatch= { 
          $gte: +cacheRate[0],
          $lte: +cacheRate[1]
        }
      }
      else {
        cacheMatch = 100;
      }
      const offers = await PostCacheModel.aggregate([
        {
          $match: {
            category: { $in: [job.data.category] },
            cache: cacheMatch,
          }
        },
        {
          $sort: {
            createdAt: -1 
          }
        },
        {
          $limit: cutNubmer
        }
      ]);
      await savePosts(offers,job.data.category, job.data.cacheRate, job.data.idJob );
      const subscribers = await UserVipModel.find({ subscribeEvent: {
        $in: subscribeEvent
      } });

      for await (let sub of subscribers) {
        try{
          await this.bot.telegram.sendMessage(
            sub.idTg,
            `🔥🔥🔥 вышло топ ${CatAndCountPostBeforeNot[this.getKeyByValue(Categories, job.data.category) as keyof typeof CatAndCountPostBeforeNot]} предложений по ${job.data.category} .`,
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
        }catch(e){
          console.log(e);
        }
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

private async getPhotoUrlById(fileId: string): Promise<string | null> {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${process.env.API_BOT}/getFile`, {
      params: { file_id: fileId },
    });

    if (!response.data.ok) {
      console.error('Error fetching file path:', response.data.description);
      return null;
    }

    const filePath = response.data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${process.env.API_BOT}/${filePath}`;
    return fileUrl;
  } catch (error: any) {
    console.error('Error getting photo URL:', error.message);
    return null;
  }
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
  