import { prop, getModelForClass } from '@typegoose/typegoose';

class AnaliticUserForDayCache {
  @prop({ type: String, default: Date.now }) 
  public date!: string;

  @prop({ type: Number, default: 0 }) 
  public connections!: Number;

  @prop({ type: Number, default: 0 }) 
  public totalRequests!: Number;

  @prop({ type: [String], default: [] }) 
  public uniqueUsers!: [String];
}

export const analiticUserDayModel = getModelForClass(AnaliticUserForDayCache);