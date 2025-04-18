import Redis  from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

const redisConnection = new Redis(process.env.REDIS_URL!);

export interface PaginationState {
    userId: string;
    currentIndex: number;
    posts: any[];
    category: string;
    cacheRange: string;
}

export const savePosts = async (
    posts: any[],
    category: string,
    cacheRange: string,
    idJob: string
) => {
    await redisConnection.set(
        `posts-category:${category};cacheRange:${cacheRange};idjob:${idJob}`,
        JSON.stringify(posts),
    );
};


export const getPosts = async (
    category: string,
    cacheRange: string,
    idJob: string
) => {
    const data = await redisConnection.get( `posts-category:${category};cacheRange:${cacheRange};idjob:${idJob}`);
    return data ? JSON.parse(data) : null;
};