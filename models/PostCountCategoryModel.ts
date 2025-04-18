import { prop, getModelForClass } from '@typegoose/typegoose';
import { CacheRate, Categories } from '../cors/enumAll';

class PostCountCategory {
  @prop({ type: String, enum: Categories,  required: true, index: true }) 
  public category!: Categories;

  @prop({ type: String, enum: CacheRate,  required: true, index: true }) 
  public cacheRate!: CacheRate;

  @prop({ required: true })
  public postCount!: number;
}

export const PostCountCategoryModel = getModelForClass(PostCountCategory);