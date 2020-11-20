import { getConnection } from "typeorm";
import { isAuth } from "../middleware/isAuth";
import {
  Arg,
  Ctx,
  Field,
  FieldResolver,
  InputType,
  Int,
  Mutation,
  ObjectType,
  Query,
  Resolver,
  Root,
  UseMiddleware,
} from "type-graphql";
import { Post } from "../entities/Post";
import { Vote } from "../entities/Vote";
import { User } from "../entities/User";
import { MyContext } from "src/types";

@InputType()
class PostInput {
  @Field()
  title: string;
  @Field()
  text: string;
}

@ObjectType()
class PaginatedPosts {
  @Field(() => [Post])
  posts: Post[];
  @Field()
  hasMore: boolean;
}

@Resolver(Post)
export class PostResolver {
  @FieldResolver(() => String)
  textSnippet(@Root() root: Post) {
    return root.text.slice(0, 50);
  }

  @FieldResolver(() => User)
  creator(@Root() post: Post, @Ctx() { userLoader }: MyContext) {
    return userLoader.load(post.creatorId);
  }

  @FieldResolver(() => Int, { nullable: true })
  async voteStatus(@Root() post: Post, @Ctx() { req, voteLoader }: MyContext) {
    if (!req.session!.userId) {
      return null;
    }

    const vote = await voteLoader.load({
      postId: post.id,
      userId: req.session!.userId,
    });

    return vote ? vote.value : null;
  }

  @Query(() => PaginatedPosts)
  async posts(
    @Arg("limit", () => Int) limit: number,
    @Arg("cursor", () => String, { nullable: true }) cursor: string | null
  ): Promise<PaginatedPosts> {
    const realLimit = Math.min(50, limit);
    const realLimitPlusOne = realLimit + 1;

    let replacements: any[] = [realLimitPlusOne];

    if (cursor) {
      replacements.push(new Date(parseInt(cursor)));
    }

    const posts = await getConnection().query(
      `select p.* from "post" p 
      ${cursor ? `where p."createdAt" < $2` : ""}
      order by p."createdAt" DESC LIMIT $1`,
      replacements
    );

    return {
      posts: posts.slice(0, realLimit),
      hasMore: posts.length === realLimitPlusOne,
    };
  }

  @Query(() => Post, { nullable: true })
  post(@Arg("id", () => Int) id: number): Promise<Post | undefined> {
    return Post.findOne(id);
  }

  @Mutation(() => Post)
  @UseMiddleware(isAuth)
  async createPost(
    @Arg("input") input: PostInput,
    @Ctx() { req }: MyContext
  ): Promise<Post | null> {
    return Post.create({ ...input, creatorId: req.session!.userId }).save();
  }

  @Mutation(() => Post, { nullable: true })
  @UseMiddleware(isAuth)
  async updatePost(
    @Arg("id", () => Int) id: number,
    @Arg("title") title: string,
    @Arg("text") text: string,
    @Ctx() { req }: MyContext
  ): Promise<Post | undefined> {
    const post = await getConnection()
      .createQueryBuilder()
      .update(Post)
      .set({ title, text })
      .where('id=:id AND "creatorId"=:creatorId', {
        id,
        creatorId: req.session!.userId,
      })
      .returning("*")
      .execute();
    return post.raw[0];
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async deletePost(
    @Arg("id", () => Int) id: number,
    @Ctx() { req }: MyContext
  ): Promise<boolean> {
    await Post.delete({ id, creatorId: req.session!.userId });
    return true;
  }

  @Mutation(() => Boolean)
  @UseMiddleware(isAuth)
  async vote(
    @Arg("postId", () => Int) postId: number,
    @Arg("value", () => Int) value: number,
    @Ctx() { req }: MyContext
  ) {
    const realValue = value > 0 ? 1 : -1;
    const userId = req.session!.userId;

    const vote = await Vote.findOne({ where: { postId, userId } });
    if (vote && vote.value !== realValue) {
      await getConnection().transaction(async (tm) => {
        await tm.query(
          `UPDATE vote SET value=$1 WHERE "userId"=$2 AND "postId"=$3`,
          [realValue, userId, postId]
        );
        await tm.query(
          `UPDATE "post" p SET points = points + $1 WHERE p.id = $2`,
          [2 * realValue, postId]
        );
      });
    } else if (!vote) {
      await getConnection().transaction(async (tm) => {
        await tm.query(
          `INSERT INTO vote ("userId","postId",value) VALUES ($1,$2,$3)`,
          [userId, postId, realValue]
        );
        await tm.query(
          `UPDATE "post" p SET points = points + $1 WHERE p.id = $2`,
          [realValue, postId]
        );
      });
    }

    return true;
  }
}
