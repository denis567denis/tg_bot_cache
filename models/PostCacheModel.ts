import { prop, getModelForClass, modelOptions } from '@typegoose/typegoose';

@modelOptions({
  schemaOptions: {
    timestamps: true
  }
})
class PostCahce {
  @prop({ required: true, index: true })
  public salesman!: string;

  @prop({ required: true })
  public photoId!: string;

  @prop({ required: true })
  public cache!: number;

  @prop({type: () => [String], required: true })
  public category!: string[];

  @prop({ required: true })
  public message!: string;

  public createdAt?: Date;
  public updatedAt?: Date;
}

export const PostCacheModel = getModelForClass(PostCahce);