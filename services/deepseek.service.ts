import axios from 'axios';
import { error } from 'console';
import OpenAI from "openai";
import { Categories } from '../cors/enumAll';

export class DeepSeekService {
  apiKey: string;
  openai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: process.env.DEEPSEEK_API_KEY
  });
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async _sendAnalysisRequest(text: string) {
    try {
      console.log("createrd");
      const response = await this.openai.chat.completions.create({
       messages: [
          {
            role: "system",
            content: `Извлечь данные о кешбеки в json формате: 
            {provider: "имя продовца или его никнейм", percentage: Рассчетай из текста размер кешбека или скидки, category: определи несколько категорий если это возможно в тексте и выбери из следующего списка ${Object.values(Categories)}} 
            из текста и ничего больше.
            Если не можешь найти данные то возвращщай в таком формате данные {error: "error"} и ничего больше.
            `
          },
          {
            role: "user",
            content: text
          }
        ],
        model: "deepseek-chat",
        response_format: {
          'type': 'json_object',
        }
      })

      return this._parseResponse(response);
    } catch (error: any) {
      console.log('DeepSeek request failed:', error.message);
      throw error;
    }
  }

  _parseResponse(response: any) {
    try {
      const content = JSON.parse(response.choices[0].message.content);
      if(content.error) {
        return {
          error: true
        }
      }
      return content;
    } catch (e) {
      console.log('Parsing error:', e);
      return null;
    }
  }
}