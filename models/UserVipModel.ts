import { prop, getModelForClass } from '@typegoose/typegoose';

class UserVip {
  @prop({ type: Date, default: Date.now })
  public createdAt!: Date;

  @prop({ required: true, index: true }) 
  public idTg!: string;

  @prop({ type: () => [String], required: true, index: true })
  public subscribeEvent!: string[];
}

export const UserVipModel = getModelForClass(UserVip);